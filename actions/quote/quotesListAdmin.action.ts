"use server";

import { prisma } from "@/utils/db";
import type { EmailEvent, Prisma, QuoteStatus } from "@/generated/prisma";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
 

const PAGE_SIZE = 25;

// Same shape as the tenant-scoped QuoteRow, plus the org the quote belongs
// to — needed once results span multiple tenants so ops can tell which
// business associate each row is for.
export interface AdminQuoteRow {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  vendorName: string;
  productName: string;
  currency: string;
  quotedTotal: number;
  lastEmailEvent: EmailEvent | null;
  markupPercent: number;
  tatDays: number | null;
  pdfUrl: string | null;
  validUntil: string;
  createdAt: string;
  org: {
    id: string;
    name: string;
    slug: string;
  };
  client: {
    id: string;
    companyName: string;
    contactName: string | null;
  } | null;
  isExpired: boolean;
}

export interface AdminQuoteListResult {
  quotes: AdminQuoteRow[];
  total: number;
}

export async function getAllQuotesAction(params: {
  q?: string;
  status?: QuoteStatus | "";
  page?: number;
}): Promise<AdminQuoteListResult> {
  // Arena Dashboard is the company-internal view across every tenant org.
  // Unlike getQuotesAction (tenant-scoped), there is intentionally no orgId
  // filter below — this lets ops search every business associate's quotes
  // from one place.
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const query = params.q?.trim() ?? "";
  const page = Math.max(1, params.page ?? 1);
  const skip = (page - 1) * PAGE_SIZE;
  const now = new Date();

  const where: Prisma.QuoteWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(query
      ? {
          OR: [
            { quoteNumber: { contains: query, mode: "insensitive" } },
            { vendorName: { contains: query, mode: "insensitive" } },
            { productName: { contains: query, mode: "insensitive" } },
            { client: { companyName: { contains: query, mode: "insensitive" } } },
            { org: { name: { contains: query, mode: "insensitive" } } },
            { org: { slug: { contains: query, mode: "insensitive" } } },
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
        emailEvents: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { event: true },
        },
        org: {
          select: { id: true, name: true, slug: true },
        },
        client: {
          select: { id: true, companyName: true, contactName: true },
        },
      },
    }),
    prisma.quote.count({ where }),
  ]);

  const quotes: AdminQuoteRow[] = rows.map((r) => ({
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
    lastEmailEvent: r.emailEvents[0]?.event ?? null,
    validUntil: r.validUntil.toISOString(),
    createdAt: r.createdAt.toISOString(),
    org: r.org,
    client: r.client,
    isExpired: r.validUntil < now && r.status === "DRAFT",
  }));

  return { quotes, total };
}