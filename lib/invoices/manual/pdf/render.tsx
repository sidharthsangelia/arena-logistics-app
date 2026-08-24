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

import { invoiceVariant } from "../../pdf/variant";
import type { ManualInvoiceDocumentData } from "../types";
import {
  ManualInvoiceDocument,
  type ManualInvoiceVariant,
} from "./ManualInvoiceDocument";

/**
 * Which template issued invoices are rendered with.
 *
 * Now read from the one global setting both invoice documents follow rather
 * than declared here, because a manual invoice and the booking invoice for the
 * same customer in two different layouts looks like two different companies.
 * See lib/invoices/pdf/variant.ts.
 *
 * Read per call rather than captured at module load, so a deployment that
 * changes the setting takes effect without a cold start and a test can set it
 * around a render. Invoices already issued keep the PDF they were issued with,
 * which is the correct behaviour for a document somebody is holding.
 */
export function manualInvoiceVariant(): ManualInvoiceVariant {
  return invoiceVariant();
}

export interface RenderedManualInvoice {
  buffer: Buffer;
  fileName: string;
}

/**
 * Invoice numbers are plain alphanumerics now (ARN082600047), so this is a
 * no-op on anything issued today. It is kept because the numbers issued before
 * 2026-08-24 carry slashes, and those rows are still re-downloaded by number.
 */
export function manualInvoiceFileName(invoiceNumber: string): string {
  const safe = invoiceNumber
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${safe}.pdf`;
}

export async function renderManualInvoicePdf(
  data: ManualInvoiceDocumentData,
  variant: ManualInvoiceVariant = manualInvoiceVariant(),
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
