/**
 * lib/invoices/tax/pdf/render.ts
 *
 * Renders the invoice to a PDF buffer and puts it in storage.
 *
 * NODE RUNTIME ONLY. @react-pdf/renderer needs Node streams and is not usable
 * on the edge. Anything importing this must run on the Node runtime, which the
 * Inngest route already does.
 *
 * Split into render and upload because they fail for unrelated reasons: a
 * render failure is a bug in our data or template and will fail again on
 * retry, whereas an upload failure is usually the network and will not. The
 * generation job runs them as separate steps so a retry never re-renders a PDF
 * that already uploaded, and never re-uploads one that already landed.
 */

import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { UTApi } from "uploadthing/server";

import type { InvoiceDocumentData } from "../types";
import { TaxInvoiceDocument } from "./TaxInvoiceDocument";

export interface RenderedInvoice {
  buffer: Buffer;
  fileName: string;
}

/**
 * A number like ARN/26-27/00042 contains slashes, which are not something to
 * put in a filename. The dashes read fine and the number is still recoverable
 * by eye, which is what matters when a customer emails asking about a file.
 */
export function invoiceFileName(
  invoiceNumber: string,
  shipmentNumber?: string,
): string {
  const safe = invoiceNumber.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return shipmentNumber ? `${safe}-${shipmentNumber}.pdf` : `${safe}.pdf`;
}

export async function renderInvoicePdf(
  data: InvoiceDocumentData,
): Promise<RenderedInvoice> {
  const buffer = await renderToBuffer(<TaxInvoiceDocument data={data} />);

  if (!buffer?.length) {
    // renderToBuffer resolving with nothing means the template produced an
    // empty document. Better to fail the job than to store a zero-byte file
    // and hand the customer a link to it.
    throw new InvoicePdfError("Invoice PDF rendered as an empty buffer.");
  }

  return {
    buffer,
    fileName: invoiceFileName(data.invoiceNumber, data.shipment.shipmentNumber),
  };
}

export interface UploadedInvoice {
  fileUrl: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Push the rendered PDF to UploadThing.
 *
 * Uses UTApi directly rather than the file router in app/api/uploadthing/core.ts.
 * That router exists to let a BROWSER upload with the user's session
 * authorising it. Here there is no browser and no session: the job is the
 * author, and routing a server-generated file through a client upload flow
 * would mean inventing a session to satisfy a middleware that has nothing left
 * to check.
 */
export async function uploadInvoicePdf(
  rendered: RenderedInvoice,
): Promise<UploadedInvoice> {
  const utapi = new UTApi();

  const file = new File([new Uint8Array(rendered.buffer)], rendered.fileName, {
    type: "application/pdf",
  });

  const result = await utapi.uploadFiles(file);

  if (result.error || !result.data) {
    throw new InvoicePdfError(
      `UploadThing rejected the invoice PDF: ${result.error?.message ?? "unknown error"}`,
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

export class InvoicePdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoicePdfError";
  }
}
