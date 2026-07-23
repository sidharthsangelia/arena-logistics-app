"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import type { RateQuote, RateRequest } from "@/lib/types";
import type { ClientInfo } from "@/components/rate-calculator/QuoteSheet";

// ---------------------------------------------------------------------------
// Tenant context
// ---------------------------------------------------------------------------

async function getTenantOrg(): Promise<{
  id: string;
  isBusinessAssociate: boolean;
  isArena: boolean;
}> {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) throw new Error("No active organisation in session.");

  const org = await prisma.org.findUnique({
    where: { clerkOrgId },
    select: { id: true, isBusinessAssociate: true },
  });
  if (!org) throw new Error(`Org not found for clerkOrgId: ${clerkOrgId}`);
  return {
    ...org,
    isArena: clerkOrgId === process.env.ARENA_ORG_ID,
  };
}

async function getDbOrgId(): Promise<string> {
  return (await getTenantOrg()).id;
}

// Derived monetary fields are computed identically on create and update so a
// re-saved quote can never drift from a freshly-created one.
function computeQuoteTotals(quote: RateQuote, markupPercent: number) {
  const factor = 1 + markupPercent / 100;
  const subtotal = quote.totalWithoutTax;
  const total = quote.totalWithTax;
  const tax = total - subtotal;
  const quotedTotal = total * factor;

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 7);

  return { subtotal, total, tax, quotedTotal, validUntil };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SaveQuoteInput {
  quoteNumber:   string;
  quote:         RateQuote;
  request:       RateRequest;
  client:        ClientInfo;
  markupPercent: number;
  pdfUrl?:       string | null;
  pdfKey?:       string | null;
}

export type SaveQuoteResult =
  | { success: true; quoteId: string }
  | { success: false; message: string };

export type RetryQuotePdfResult =
  | { success: true }
  | { success: false; message: string };

// ---------------------------------------------------------------------------
// saveQuoteAction
// ---------------------------------------------------------------------------

export async function saveQuoteAction(
  input: SaveQuoteInput,
): Promise<SaveQuoteResult> {
  try {
    const org = await getTenantOrg();

    // Quoting is a Business-Associate feature (Arena staff excepted). Standard
    // orgs only view rates — mirror the UI gate authoritatively so a crafted
    // request can't create a quote the org shouldn't have.
    if (!org.isArena && !org.isBusinessAssociate) {
      return {
        success: false,
        message: "Only Business Associates can generate quotes.",
      };
    }

    const orgId = org.id;

    const { quoteNumber, quote, request, client, markupPercent, pdfUrl, pdfKey } = input;

    const { subtotal, total, tax, quotedTotal, validUntil } = computeQuoteTotals(
      quote,
      markupPercent,
    );

    const saved = await prisma.quote.create({
      data: {
        orgId,
        quoteNumber,
        vendorId:    quote.vendorId,
        vendorName:  quote.vendorName,
        productName: quote.productName,
        currency:    quote.currency,
        subtotal,
        tax,
        total,
        markupPercent,
        quotedTotal,
        tatDays:          quote.tatDays > 0 ? quote.tatDays : null,
        chargesSnapshot:  quote.charges as object[],
        requestSnapshot:  request as object,
        pdfUrl:           pdfUrl ?? null,
        pdfKey:           pdfKey ?? null,
        validUntil,
        status:    "DRAFT",
        clientId:  client.clientId ?? null,
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
// updateQuoteAction
// ---------------------------------------------------------------------------
// Re-saving a quote after an edit (markup / client / shipment) updates the
// existing row rather than creating a duplicate. The quote number is stable
// for the lifetime of the sheet, so it is not touched here. The PDF is
// re-uploaded separately (via the quotePdf uploader), which refreshes
// pdfUrl/pdfKey through updateQuotePdfAction — so those are left untouched too.

export async function updateQuoteAction(
  quoteId: string,
  input: SaveQuoteInput,
): Promise<SaveQuoteResult> {
  try {
    const org = await getTenantOrg();

    if (!org.isArena && !org.isBusinessAssociate) {
      return {
        success: false,
        message: "Only Business Associates can generate quotes.",
      };
    }

    const { quote, request, client, markupPercent } = input;

    const { subtotal, total, tax, quotedTotal, validUntil } = computeQuoteTotals(
      quote,
      markupPercent,
    );

    const updated = await prisma.quote.update({
      // orgId in the filter guarantees a tenant can only update its own quote.
      where: { id: quoteId, orgId: org.id },
      data: {
        vendorId:        quote.vendorId,
        vendorName:      quote.vendorName,
        productName:     quote.productName,
        currency:        quote.currency,
        subtotal,
        tax,
        total,
        markupPercent,
        quotedTotal,
        tatDays:         quote.tatDays > 0 ? quote.tatDays : null,
        chargesSnapshot: quote.charges as object[],
        requestSnapshot: request as object,
        validUntil,
        clientId:        client.clientId ?? null,
      },
      select: { id: true },
    });

    revalidatePath("/quotes");
    return { success: true, quoteId: updated.id };
  } catch (error) {
    console.error("updateQuoteAction", error);
    return { success: false, message: "Failed to update quote." };
  }
}

// ---------------------------------------------------------------------------
// updateQuotePdfAction
// ---------------------------------------------------------------------------
// Paste this into your quotes.action.ts — replaces updateQuotePdfAction

export interface UpdateQuotePdfInput {
  quoteId: string;
  pdfUrl:  string;
  pdfKey:  string;
  // orgId can be supplied directly (from UploadThing metadata) OR
  // resolved from the session when called from a normal server action.
  orgId?:  string;
}

export type UpdateQuotePdfResult =
  | { success: true }
  | { success: false; message: string };

export async function updateQuotePdfAction(
  input: UpdateQuotePdfInput,
): Promise<UpdateQuotePdfResult> {
  try {
    // Use the supplied orgId if present (UploadThing callback context),
    // otherwise resolve from the Clerk session (normal server action context).
    const orgId = input.orgId ?? (await getDbOrgId());

    await prisma.quote.update({
      where: { id: input.quoteId, orgId },
      data: {
        pdfUrl: input.pdfUrl,
        pdfKey: input.pdfKey,
      },
    });

    revalidatePath("/quotes");
    return { success: true };
  } catch (error) {
    console.error("updateQuotePdfAction", error);
    return { success: false, message: "Failed to update PDF record." };
  }
}

// ---------------------------------------------------------------------------
// bulkDeleteQuotesAction
// ---------------------------------------------------------------------------

export async function bulkDeleteQuotesAction(
  ids: string[],
): Promise<{ success: true } | { success: false; message: string }> {
  try {
    const orgId = await getDbOrgId();

    // orgId in where clause ensures only this org's quotes are deleted
    await prisma.quote.deleteMany({
      where: { id: { in: ids }, orgId },
    });

    revalidatePath("/quotes");
    return { success: true };
  } catch (error) {
    console.error("bulkDeleteQuotesAction", error);
    return { success: false, message: "Failed to delete quotes." };
  }
}

// ---------------------------------------------------------------------------
// getQuoteForPdfRetryAction
// ---------------------------------------------------------------------------

export async function getQuoteForPdfRetryAction(quoteId: string): Promise<
  | {
      success: true;
      quote: {
        id:              string;
        quoteNumber:     string;
        vendorName:      string;
        productName:     string;
        currency:        string;
        markupPercent:   number;
        chargesSnapshot: object[];
        requestSnapshot: object;
        client: {
          companyName:  string;
          contactName:  string | null;
          email:        string | null;
          phone:        string | null;
          addressLine1: string | null;
          city:         string | null;
          country:      string | null;
        } | null;
      };
    }
  | { success: false; message: string }
> {
  try {
    const orgId = await getDbOrgId();

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, orgId },   // findFirst with orgId — not findUnique
      select: {
        id:              true,
        quoteNumber:     true,
        vendorName:      true,
        productName:     true,
        currency:        true,
        markupPercent:   true,
        chargesSnapshot: true,
        requestSnapshot: true,
        pdfUrl:          true,
        client: {
          select: {
            companyName:  true,
            contactName:  true,
            email:        true,
            phone:        true,
            addressLine1: true,
            city:         true,
            country:      true,
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
        markupPercent:   Number(quote.markupPercent),
        chargesSnapshot: quote.chargesSnapshot as object[],
        requestSnapshot: quote.requestSnapshot as object,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch quote.";
    return { success: false, message };
  }
}