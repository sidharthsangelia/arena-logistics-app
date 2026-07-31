/**
 * lib/inngest/functions/generateShipmentInvoice.ts
 *
 * Issues the tax invoice for a booked shipment, then sends the booking
 * confirmation email with it attached.
 *
 * ── WHY THE CONFIRMATION EMAIL LIVES HERE ───────────────────────────────────
 * It used to be awaited at the end of createShipmentAction. It moved because
 * the customer should get one email containing their invoice, rather than a
 * confirmation followed minutes later by a second mail carrying the document
 * they were promised.
 *
 * That trade is deliberate and it has a cost: the confirmation now depends on
 * this function running. So the email step is unconditional. If numbering,
 * rendering or upload fail every retry, the customer still gets their
 * confirmation, just without the attachment. Silence is the one outcome that is
 * not acceptable.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
 * Two layers, because at-least-once delivery means this WILL run twice.
 *
 *   1. Steps memoise. A retry after the upload succeeded resumes at the next
 *      step; it does not re-render, re-upload, or take a second serial.
 *   2. The database enforces it independently. ShipmentInvoice is unique on
 *      (shipmentId, docType), so even a completely fresh run against an already
 *      invoiced shipment finds the existing row and stops.
 *
 * Layer 2 is what makes the function safe to invoke by hand, which is exactly
 * what the admin retry path does.
 * ────────────────────────────────────────────────────────────────────────────
 */

import * as Sentry from "@sentry/nextjs";
import { NonRetriableError } from "inngest";

import {
  InvoiceGenerationStatus,
  ShipmentStatus,
  TaxDocType,
} from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { sendShipmentMilestoneEmail } from "@/lib/email/shipment/send";
import {
  buildInvoiceForShipment,
  documentFromRow,
  INVOICE_SHIPMENT_SELECT,
  InvoiceBuildError,
} from "@/lib/invoices/tax/build";
import { issuerIsConfigured } from "@/lib/invoices/tax/config";
import { allocateInvoiceNumber } from "@/lib/invoices/tax/numbering";
import {
  renderInvoicePdf,
  uploadInvoicePdf,
} from "@/lib/invoices/tax/pdf/render";
import type { InvoiceDocumentData } from "@/lib/invoices/tax/types";

import { inngest, invoiceRetryRequested, shipmentBooked } from "../client";

// ---------------------------------------------------------------------------

interface PreparedInvoice {
  invoiceId: string;
  document: InvoiceDocumentData;
  /** Already had a file. Nothing further to do but the email. */
  alreadyIssued: boolean;
  fileUrl: string | null;
  fileName: string | null;
}

/**
 * Create or find the invoice row and give it its number.
 *
 * Everything here happens in ONE transaction, and it is kept deliberately
 * small. The counter row is locked from the moment the number is taken until
 * this transaction commits, and every other booking issuing an invoice waits
 * behind that lock. Rendering a PDF inside this transaction would hold the lock
 * for the length of a render.
 */
async function prepareInvoice(shipmentId: string): Promise<PreparedInvoice | null> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.shipmentInvoice.findUnique({
      where: {
        shipmentId_docType: { shipmentId, docType: TaxDocType.TAX_INVOICE },
      },
    });

    // Already finished. Return it so the email step can still attach it: a
    // duplicate event must not produce a second document, but it also must not
    // skip the confirmation if that is what failed last time.
    if (existing?.generationStatus === InvoiceGenerationStatus.READY && existing.fileUrl) {
      return {
        invoiceId: existing.id,
        document: documentFromRow(existing),
        alreadyIssued: true,
        fileUrl: existing.fileUrl,
        fileName: existing.fileName,
      };
    }

    // The row may already exist as PENDING, written inside the booking
    // transaction. If the build failed there it will not, and this is where it
    // gets made instead. Either way the money is computed from the shipment as
    // it stands now, so the two paths cannot disagree.
    let invoiceId = existing?.id ?? null;
    let issueDate = existing?.issueDate ?? null;

    if (!invoiceId) {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: INVOICE_SHIPMENT_SELECT,
      });

      if (!shipment) {
        // The shipment was deleted between the event and this run. Nothing to
        // invoice, and retrying will not bring it back.
        throw new NonRetriableError(
          `Shipment ${shipmentId} no longer exists; cannot issue an invoice.`,
        );
      }

      if (shipment.status === ShipmentStatus.DRAFT) {
        throw new NonRetriableError(
          `Shipment ${shipment.shipmentNumber} is still a draft; nothing was charged.`,
        );
      }

      const built = buildInvoiceForShipment(shipment);
      const created = await tx.shipmentInvoice.create({
        data: built.row,
        select: { id: true, issueDate: true },
      });

      invoiceId = created.id;
      issueDate = created.issueDate;
    }

    // ── The number ──────────────────────────────────────────────────────────
    // Taken as late as possible and only once. If this transaction rolls back
    // the counter rolls back with it, which is the whole reason the serial
    // lives in a table rather than a Postgres sequence.
    const numbered =
      existing?.invoiceNumber && existing.financialYear
        ? {
            invoiceNumber: existing.invoiceNumber,
            financialYear: existing.financialYear,
          }
        : await allocateInvoiceNumber(
            tx,
            TaxDocType.TAX_INVOICE,
            issueDate ?? new Date(),
          );

    const row = await tx.shipmentInvoice.update({
      where: { id: invoiceId },
      data: {
        invoiceNumber: numbered.invoiceNumber,
        financialYear: numbered.financialYear,
        generationAttempts: { increment: 1 },
        generationError: null,
      },
    });

    return {
      invoiceId: row.id,
      document: documentFromRow(row),
      alreadyIssued: false,
      fileUrl: null,
      fileName: null,
    };
  });
}

// ---------------------------------------------------------------------------

export const generateShipmentInvoice = inngest.createFunction(
  {
    id: "generate-shipment-invoice",
    name: "Generate shipment tax invoice",

    // Two triggers, one body: the ordinary booking path and the admin re-drive.
    // Both end at the same place, and the database uniqueness check means the
    // manual one cannot double-issue.
    triggers: [shipmentBooked, invoiceRetryRequested],

    // The failure mode worth protecting against is a burst of bookings all
    // queueing on the same counter row. Serialising invoice issue removes the
    // lock contention entirely, and at Arena's volume a queue of one costs
    // nothing in wall-clock time.
    concurrency: { limit: 1, key: "event.data.orgId" },

    retries: 4,

    onFailure: async ({ event, error }) => {
      // Every retry is spent. Record why on the row so an admin can see it in
      // the dashboard rather than only in Sentry.
      const shipmentId = event.data.event.data.shipmentId as string;

      Sentry.captureException(error, {
        tags: { location: "generateShipmentInvoice", shipmentId },
      });

      await prisma.shipmentInvoice
        .updateMany({
          where: { shipmentId, docType: TaxDocType.TAX_INVOICE },
          data: {
            generationStatus: InvoiceGenerationStatus.FAILED,
            generationError: String(error?.message ?? error).slice(0, 500),
          },
        })
        .catch(() => {
          // The database being unreachable is what put us here in the first
          // place; there is nothing further to try and Sentry already has it.
        });
    },
  },

  async ({ event, step, logger }) => {
    const { shipmentId } = event.data;

    // ── 0. Refuse to number a document we know is wrong ─────────────────────
    // A serial is permanent. Burning one on an invoice that says "REPLACE ME"
    // where the GSTIN belongs leaves a hole in a gapless series that no later
    // fix can close. Not retriable: this needs a human to set the env vars.
    if (!issuerIsConfigured()) {
      throw new NonRetriableError(
        "Invoice issuer details are still placeholders. Set INVOICE_ISSUER_* " +
          "before issuing tax invoices. See lib/invoices/tax/config.ts.",
      );
    }

    // ── 1. Row, snapshots and number ────────────────────────────────────────
    const prepared = await step.run("prepare-invoice", async () => {
      try {
        return await prepareInvoice(shipmentId);
      } catch (err) {
        // Bad source data will fail identically on every retry. Fail fast and
        // let onFailure record it rather than burning four attempts.
        if (err instanceof InvoiceBuildError) {
          throw new NonRetriableError(err.message);
        }
        throw err;
      }
    });

    if (!prepared) {
      logger.warn(`No invoice to generate for shipment ${shipmentId}.`);
      return { issued: false };
    }

    // ── 2 and 3. Render, then upload ────────────────────────────────────────
    //
    // Separate steps because they fail for unrelated reasons. A render failure
    // is a bug in our data or template and will fail again; an upload failure
    // is usually the network and will not. Keeping them apart means a retry
    // after a flaky upload does not re-render, and a retry after a bad render
    // does not leave an orphaned file behind.
    let file = prepared.alreadyIssued
      ? {
          fileUrl: prepared.fileUrl as string,
          fileName: prepared.fileName as string,
        }
      : null;

    if (!prepared.alreadyIssued) {
      const rendered = await step.run("render-pdf", async () => {
        const result = await renderInvoicePdf(prepared.document);
        // Step output crosses a JSON boundary, so the buffer travels as base64.
        // An invoice is one page of text and comes to tens of kilobytes, well
        // inside what a step may return.
        return {
          base64: result.buffer.toString("base64"),
          fileName: result.fileName,
        };
      });

      const uploaded = await step.run("upload-pdf", async () =>
        uploadInvoicePdf({
          buffer: Buffer.from(rendered.base64, "base64"),
          fileName: rendered.fileName,
        }),
      );

      // ── 4. Mark it issued ────────────────────────────────────────────────
      await step.run("mark-ready", async () => {
        await prisma.shipmentInvoice.update({
          where: { id: prepared.invoiceId },
          data: {
            generationStatus: InvoiceGenerationStatus.READY,
            generatedAt: new Date(),
            generationError: null,
            fileUrl: uploaded.fileUrl,
            fileKey: uploaded.fileKey,
            fileName: uploaded.fileName,
            fileSize: uploaded.fileSize,
            mimeType: uploaded.mimeType,
          },
        });
      });

      file = { fileUrl: uploaded.fileUrl, fileName: uploaded.fileName };
    }

    // ── 5. The customer's confirmation ──────────────────────────────────────
    //
    // Only on the booking path. An admin re-driving a failed invoice weeks
    // later must not send a fresh "your booking is confirmed" for a shipment
    // that has since been delivered.
    if (event.name === shipmentBooked.name) {
      await step.run("send-booking-email", async () => {
        const result = await sendShipmentMilestoneEmail(
          shipmentId,
          ShipmentStatus.BOOKED,
          file
            ? [{ filename: file.fileName, url: file.fileUrl }]
            : undefined,
        );
        return { sent: result.sent, audience: result.audience };
      });
    }

    return {
      issued: true,
      invoiceId: prepared.invoiceId,
      invoiceNumber: prepared.document.invoiceNumber,
    };
  },
);

// ---------------------------------------------------------------------------

/**
 * Emitted when a shipment is booked. Kept next to the function that consumes it
 * so the two are read together.
 *
 * `id` makes the send idempotent within Inngest's 24-hour dedupe window: a
 * booking action that somehow runs its tail twice cannot queue two invoice
 * jobs for one shipment.
 */
export function shipmentBookedEvent(input: {
  shipmentId: string;
  shipmentNumber: string;
  orgId: string;
}) {
  return shipmentBooked.create(input, { id: `shipment-booked-${input.shipmentId}` });
}

export type { PreparedInvoice };
