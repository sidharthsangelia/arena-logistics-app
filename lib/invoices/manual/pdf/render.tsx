/**
 * lib/invoices/manual/pdf/render.tsx
 *
 * Renders a manual invoice to a PDF buffer and puts it in storage.
 *
 * NODE RUNTIME ONLY. @react-pdf/renderer needs Node streams and is not usable
 * on the edge, so the server action that calls this must run on Node.
 *
 * Unlike the booking invoice, render and upload are called back to back inside
 * the issuing transaction rather than as separate retryable steps. The reason
 * is in issueManualInvoiceAction: rolling back a failed issue must also roll
 * back the serial, and a serial cannot be rolled back once its transaction has
 * committed. They are still two functions because they fail for unrelated
 * reasons and the error should say which one happened.
 */

import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { UTApi } from "uploadthing/server";

import type { ManualInvoiceDocumentData } from "../types";
import {
  ManualInvoiceDocument,
  type ManualInvoiceVariant,
} from "./ManualInvoiceDocument";

/**
 * Which template issued invoices are rendered with.
 *
 * One constant rather than a per-invoice column: two invoices to the same
 * customer in two different layouts looks like two different companies. Change
 * it here and every invoice issued after that point follows; the ones already
 * issued keep the PDF they were issued with, which is the correct behaviour for
 * a document somebody is holding.
 */
export const MANUAL_INVOICE_VARIANT: ManualInvoiceVariant = "arena";

export interface RenderedManualInvoice {
  buffer: Buffer;
  fileName: string;
}

/**
 * A number like ARM/26-27/00042 contains slashes, which are not something to
 * put in a filename. The dashes read fine and the number is still recoverable
 * by eye, which is what matters when a customer emails asking about a file.
 */
export function manualInvoiceFileName(invoiceNumber: string): string {
  const safe = invoiceNumber
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${safe}.pdf`;
}

export async function renderManualInvoicePdf(
  data: ManualInvoiceDocumentData,
  variant: ManualInvoiceVariant = MANUAL_INVOICE_VARIANT,
): Promise<RenderedManualInvoice> {
  const buffer = await renderToBuffer(
    <ManualInvoiceDocument data={data} variant={variant} />,
  );

  if (!buffer?.length) {
    // renderToBuffer resolving with nothing means the template produced an
    // empty document. Better to fail the issue than to store a zero-byte file
    // and hand the customer a link to it.
    throw new ManualInvoicePdfError(
      "The invoice PDF rendered as an empty file.",
    );
  }

  return { buffer, fileName: manualInvoiceFileName(data.invoiceNumber) };
}

export interface UploadedManualInvoice {
  fileUrl: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Push the rendered PDF to UploadThing.
 *
 * UTApi directly rather than the file router in app/api/uploadthing/core.ts.
 * That router exists to let a BROWSER upload with the user's session
 * authorising it. Here the server generated the file and has already checked
 * the admin's standing, so routing it through a client upload flow would mean
 * satisfying a middleware that has nothing left to check.
 */
export async function uploadManualInvoicePdf(
  rendered: RenderedManualInvoice,
): Promise<UploadedManualInvoice> {
  const utapi = new UTApi();

  const file = new File([new Uint8Array(rendered.buffer)], rendered.fileName, {
    type: "application/pdf",
  });

  const result = await utapi.uploadFiles(file);

  if (result.error || !result.data) {
    throw new ManualInvoicePdfError(
      `Storage rejected the invoice PDF: ${result.error?.message ?? "unknown error"}`,
    );
  }

  return {
    fileUrl: result.data.ufsUrl,
    fileKey: result.data.key,
    fileName: rendered.fileName,
    fileSize: result.data.size,
    mimeType: "application/pdf",
  };
}

export class ManualInvoicePdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualInvoicePdfError";
  }
}
