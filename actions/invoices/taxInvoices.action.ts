"use server";

/**
 * actions/invoices/taxInvoices.action.ts
 *
 * Reads and repair actions for the tax invoices Arena raises automatically on
 * every booking.
 *
 * Separate from invoices.action.ts, which serves the admin-uploaded Invoice
 * model. These documents have no create, edit or delete: they are issued by a
 * background job and an issued tax invoice is not something anyone gets to
 * edit. The only writes here are operational, and they are Arena-admin only.
 *
 * Note: this file is "use server", so it exports functions only. Shared types
 * live in lib/invoices/tax/queries.ts.
 */

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";

import { InvoiceGenerationStatus, TaxDocType } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { getDbOrgId } from "@/utils/tenant";
import { ArenaForbiddenError, requireArenaAdmin } from "@/utils/arena-auth";
import { inngest, invoiceRetryRequested } from "@/lib/inngest/client";
import {
  getAllTaxInvoices,
  getOrgTaxInvoices,
  getShipmentTaxInvoice,
  getShipmentsMissingInvoices,
  getStuckTaxInvoices,
  type TaxInvoiceRow,
} from "@/lib/invoices/tax/queries";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

// ===========================================================================
// READS
// ===========================================================================

/** Tenant: this org's own tax invoices. */
export async function listOrgTaxInvoicesAction(): Promise<TaxInvoiceRow[]> {
  const orgId = await getDbOrgId();
  return getOrgTaxInvoices(orgId);
}

/** Tenant: the invoice for one of this org's shipments, if it has one yet. */
export async function getShipmentTaxInvoiceAction(
  shipmentId: string,
): Promise<TaxInvoiceRow | null> {
  const orgId = await getDbOrgId();
  return getShipmentTaxInvoice(shipmentId, orgId);
}

/** Arena: every tax invoice, optionally narrowed to one org. */
export async function listAllTaxInvoicesAction(
  orgId?: string | null,
): Promise<TaxInvoiceRow[]> {
  await requireArenaAdmin();
  return getAllTaxInvoices({ orgId });
}

/**
 * Arena: the health view. Invoices whose generation failed or stalled, plus
 * booked shipments that never got a row at all.
 *
 * These two questions belong together: they are the same question asked from
 * opposite ends, and answering only one leaves a blind spot exactly where the
 * rare failure hides.
 */
export async function getTaxInvoiceHealthAction(): Promise<{
  stuck: TaxInvoiceRow[];
  missing: Array<{ id: string; shipmentNumber: string; bookedAt: Date | null }>;
}> {
  await requireArenaAdmin();

  const [stuck, missing] = await Promise.all([
    getStuckTaxInvoices(),
    getShipmentsMissingInvoices(),
  ]);

  return { stuck, missing };
}

// ===========================================================================
// REPAIR
// ===========================================================================

/**
 * Arena: re-drive invoice generation for one shipment.
 *
 * Safe to press repeatedly. The job finds an existing READY invoice and stops,
 * and ShipmentInvoice is unique on (shipmentId, docType), so a double press
 * cannot produce a second document or burn a second serial.
 *
 * Deliberately manual rather than a timer. A job that failed for a reason
 * nobody has fixed does not benefit from failing again on a schedule; someone
 * should read the error first, which is what getTaxInvoiceHealthAction is for.
 */
export async function retryTaxInvoiceAction(
  shipmentId: string,
): Promise<ActionResult> {
  try {
    const { userId } = await requireArenaAdmin();

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { id: true, shipmentNumber: true, bookedAt: true, orgId: true },
    });

    if (!shipment) return { ok: false, error: "Shipment not found." };
    if (!shipment.bookedAt) {
      return {
        ok: false,
        error: "This shipment was never booked, so there is nothing to invoice.",
      };
    }

    // Clear the failure marker first. Leaving it FAILED while a fresh run is in
    // flight makes the health view lie about what is happening right now.
    await prisma.shipmentInvoice.updateMany({
      where: { shipmentId, docType: TaxDocType.TAX_INVOICE },
      data: {
        generationStatus: InvoiceGenerationStatus.PENDING,
        generationError: null,
      },
    });

    await inngest.send(
      invoiceRetryRequested.create({
        shipmentId,
        orgId: shipment.orgId,
        requestedByUserId: userId,
      }),
    );

    revalidatePath("/arena-dashboard/invoices");
    return { ok: true };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) {
      return { ok: false, error: "You do not have access to this action." };
    }

    Sentry.captureException(error, {
      tags: { action: "retryTaxInvoice", shipmentId },
    });

    return {
      ok: false,
      error: "Could not queue the invoice. Our team has been notified.",
    };
  }
}
