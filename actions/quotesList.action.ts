"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/utils/db";
import type { Prisma, QuoteStatus } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

// The shape returned to the page / components. Prisma Decimal is serialised
// to string by Next.js Server Actions — we convert to number here so
// components never deal with Decimal objects.
export interface QuoteRow {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  vendorName: string;
  productName: string;
  currency: string;
  quotedTotal: number;
  markupPercent: number;
  tatDays: number | null;
  pdfUrl: string | null;
  validUntil: string;   // ISO string — Dates are not serialisable across the boundary
  createdAt: string;
  client: {
    id: string;
    companyName: string;
    contactName: string | null;
  } | null;
  // Derived
  isExpired: boolean;
}

export interface QuoteListResult {
  quotes: QuoteRow[];
  total: number;
}

// ---------------------------------------------------------------------------
// getQuotesAction
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

export async function getQuotesAction(params: {
  q?: string;
  status?: QuoteStatus | "";
  page?: number;
}): Promise<QuoteListResult> {
  const query = params.q?.trim() ?? "";
  const page  = Math.max(1, params.page ?? 1);
  const skip  = (page - 1) * PAGE_SIZE;
  const now   = new Date();

  const where: Prisma.QuoteWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(query
      ? {
          OR: [
            { quoteNumber: { contains: query, mode: "insensitive" } },
            { vendorName:  { contains: query, mode: "insensitive" } },
            { productName: { contains: query, mode: "insensitive" } },
            {
              client: {
                companyName: { contains: query, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        vendorName: true,
        productName: true,
        currency: true,
        quotedTotal: true,
        markupPercent: true,
        tatDays: true,
        pdfUrl: true,
        validUntil: true,
        createdAt: true,
        client: {
          select: {
            id: true,
            companyName: true,
            contactName: true,
          },
        },
      },
    }),
    prisma.quote.count({ where }),
  ]);

  const quotes: QuoteRow[] = rows.map((r) => ({
    id: r.id,
    quoteNumber: r.quoteNumber,
    status: r.status,
    vendorName: r.vendorName,
    productName: r.productName,
    currency: r.currency,
    quotedTotal: Number(r.quotedTotal),
    markupPercent: Number(r.markupPercent),
    tatDays: r.tatDays,
    pdfUrl: r.pdfUrl,
    validUntil: r.validUntil.toISOString(),
    createdAt: r.createdAt.toISOString(),
    client: r.client,
    isExpired: r.validUntil < now && r.status === "DRAFT",
  }));

  return { quotes, total };
}

// ---------------------------------------------------------------------------
// updateQuoteStatusAction
// ---------------------------------------------------------------------------

type ActionResult =
  | { success: true }
  | { success: false; message: string };

export async function updateQuoteStatusAction(
  id: string,
  status: QuoteStatus,
): Promise<ActionResult> {
  try {
    await prisma.quote.update({ where: { id }, data: { status } });
    revalidatePath("/quotes");
    return { success: true };
  } catch (error) {
    console.error("updateQuoteStatusAction", error);
    return { success: false, message: "Failed to update status." };
  }
}

// ---------------------------------------------------------------------------
// deleteQuoteAction
// ---------------------------------------------------------------------------

export async function deleteQuoteAction(id: string): Promise<ActionResult> {
  try {
    // Hard delete — quotes are financial records so you may want to
    // switch this to a soft delete (add deletedAt to the schema) later.
    await prisma.quote.delete({ where: { id } });
    revalidatePath("/quotes");
    return { success: true };
  } catch (error) {
    console.error("deleteQuoteAction", error);
    return { success: false, message: "Failed to delete quote." };
  }
}