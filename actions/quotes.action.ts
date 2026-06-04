"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/utils/db";
import type { RateQuote, RateRequest } from "@/lib/types";
import type { ClientInfo } from "@/components/rate-calculator/QuoteSheet";

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface SaveQuoteInput {
  quoteNumber: string;
  quote: RateQuote;
  request: RateRequest;
  client: ClientInfo;          // carries clientId if an existing client was selected
  markupPercent: number;
  pdfUrl?: string | null;      // UploadThing CDN URL (may arrive later via updateQuotePdfAction)
  pdfKey?: string | null;
}

export type SaveQuoteResult =
  | { success: true; quoteId: string }
  | { success: false; message: string };


  export type RetryQuotePdfResult =
  | { success: true }
  | { success: false; message: string };

// ---------------------------------------------------------------------------
// saveQuoteAction
//
// Persists the quote to the DB. If clientId is present on ClientInfo the
// quote is linked to that existing client. Otherwise the quote is saved with
// clientId = null (ad-hoc quote).
//
// The chargesSnapshot and requestSnapshot fields give us a self-contained
// audit trail — useful if carrier pricing models change in the future.
// ---------------------------------------------------------------------------

export async function saveQuoteAction(
  input: SaveQuoteInput,
): Promise<SaveQuoteResult> {
  try {
    const {
      quoteNumber,
      quote,
      request,
      client,
      markupPercent,
      pdfUrl,
      pdfKey,
    } = input;

    const factor = 1 + markupPercent / 100;
    const subtotal = quote.totalWithoutTax;
    const total = quote.totalWithTax;
    const tax = total - subtotal;
    const quotedTotal = total * factor;

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    const saved = await prisma.quote.create({
      data: {
        quoteNumber,
        vendorId: quote.vendorId,
        vendorName: quote.vendorName,
        productName: quote.productName,
        currency: quote.currency,
        subtotal,
        tax,
        total,
        markupPercent,
        quotedTotal,
        tatDays: quote.tatDays > 0 ? quote.tatDays : null,
        chargesSnapshot: quote.charges as object[],
        requestSnapshot: request as object,
        pdfUrl: pdfUrl ?? null,
        pdfKey: pdfKey ?? null,
        validUntil,
        status: "DRAFT",
        clientId: client.clientId ?? null,
      },
      select: { id: true },
    });

    revalidatePath("/quotes");

    return { success: true, quoteId: saved.id };
  } catch (error) {
    console.error("saveQuoteAction", error);
    return { success: false, message: "Failed to save quote." };
  }
}

// ---------------------------------------------------------------------------
// updateQuotePdfAction
//
// Called after UploadThing finishes uploading the PDF. Updates the stored
// URL and key on an existing quote record.
// ---------------------------------------------------------------------------

export interface UpdateQuotePdfInput {
  quoteId: string;
  pdfUrl: string;
  pdfKey: string;
}

export type UpdateQuotePdfResult =
  | { success: true }
  | { success: false; message: string };

export async function updateQuotePdfAction(
  input: UpdateQuotePdfInput,
): Promise<UpdateQuotePdfResult> {
  try {
    await prisma.quote.update({
      where: { id: input.quoteId },
      data: {
        pdfUrl: input.pdfUrl,
        pdfKey: input.pdfKey,
        status: "DRAFT",
      },
    });

    revalidatePath("/quotes");
    return { success: true };
  } catch (error) {
    console.error("updateQuotePdfAction", error);
    return { success: false, message: "Failed to update PDF record." };
  }
}




export async function bulkDeleteQuotesAction(
  ids: string[],
): Promise<{ success: true } | { success: false; message: string }> {
  try {
    await prisma.quote.deleteMany({
      where: { id: { in: ids } },
    });

    revalidatePath("/quotes");
    return { success: true };
  } catch (error) {
    console.error("bulkDeleteQuotesAction", error);
    return { success: false, message: "Failed to delete quotes." };
  }
}



// quotes.action.ts — add this



/**
 * Fetches full quote data needed to regenerate the PDF client-side.
 * The actual PDF generation + upload happens in the browser.
 */
export async function getQuoteForPdfRetryAction(quoteId: string): Promise<
  | {
      success: true;
      quote: {
        id: string;
        quoteNumber: string;
        vendorName: string;
        productName: string;
        currency: string;
        markupPercent: number;
        chargesSnapshot: object[];
        requestSnapshot: object;
        client: {
          companyName: string;
          contactName: string | null;
          email: string | null;
          phone: string | null;
          addressLine1: string | null;
          city: string | null;
          country: string | null;
        } | null;
      };
    }
  | { success: false; message: string }
> {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        quoteNumber: true,
        vendorName: true,
        productName: true,
        currency: true,
        markupPercent: true,
        chargesSnapshot: true,
        requestSnapshot: true,
        pdfUrl: true,
        client: {
          select: {
            companyName: true,
            contactName: true,
            email: true,
            phone: true,
            addressLine1: true,
            city: true,
            country: true,
          },
        },
      },
    });

    if (!quote) return { success: false, message: "Quote not found." };
    if (quote.pdfUrl) return { success: false, message: "Quote already has a PDF." };

    return {
      success: true,
      quote: {
        ...quote,
        markupPercent: Number(quote.markupPercent),
        chargesSnapshot: quote.chargesSnapshot as object[],
        requestSnapshot: quote.requestSnapshot as object,
      },
    };
  } catch (err: any) {
    return { success: false, message: err?.message ?? "Failed to fetch quote." };
  }
}