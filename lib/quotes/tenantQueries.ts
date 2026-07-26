/**
 * lib/quotes/tenantQueries.ts
 *
 * The read side of a tenant's own quotes list. Mirrors adminQueries.ts field for
 * field; the one difference is the hard orgId filter, which is never optional and
 * never comes from the caller's params.
 */

import "server-only";

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import {
  DEFAULT_QUOTE_PAGE_SIZE,
  QUOTE_PAGE_SIZE_OPTIONS,
  coerceQuoteSortField,
  coerceQuoteStatusFilter,
  type QuoteListParams,
  type QuotePage,
  type QuoteRow,
  type QuoteSortField,
  type QuoteStatusFilter,
} from "./config";

function coercePage(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.floor(value as number)
    : 1;
}

function coercePageSize(value: number | undefined): number {
  return (QUOTE_PAGE_SIZE_OPTIONS as readonly number[]).includes(value as number)
    ? (value as number)
    : DEFAULT_QUOTE_PAGE_SIZE;
}

function buildWhere(opts: {
  orgId: string;
  status: QuoteStatusFilter;
  search: string;
}): Prisma.QuoteWhereInput {
  // orgId is set first and is never derived from user input. Everything below
  // narrows within the caller's own org.
  const where: Prisma.QuoteWhereInput = { orgId: opts.orgId };

  if (opts.status !== "ALL") where.status = opts.status;

  if (opts.search) {
    where.OR = [
      { quoteNumber: { contains: opts.search, mode: "insensitive" } },
      { vendorName: { contains: opts.search, mode: "insensitive" } },
      { productName: { contains: opts.search, mode: "insensitive" } },
      { client: { companyName: { contains: opts.search, mode: "insensitive" } } },
    ];
  }

  return where;
}

function buildOrderBy(
  field: QuoteSortField,
  dir: "asc" | "desc",
): Prisma.QuoteOrderByWithRelationInput[] {
  const primary: Prisma.QuoteOrderByWithRelationInput =
    field === "clientName" ? { client: { companyName: dir } } : { [field]: dir };

  // createdAt is the tiebreaker so equal values keep a stable order across pages.
  return field === "createdAt" ? [primary] : [primary, { createdAt: "desc" }];
}

export async function getTenantQuotesPage(
  orgId: string,
  params: QuoteListParams,
): Promise<QuotePage> {
  const requestedPage = coercePage(params.page);
  const pageSize = coercePageSize(params.pageSize);
  const sortField = coerceQuoteSortField(params.sortField);
  const sortDir: "asc" | "desc" = params.sortDir === "asc" ? "asc" : "desc";
  const status = coerceQuoteStatusFilter(params.status);
  const search = params.search?.trim() ?? "";

  const where = buildWhere({ orgId, status, search });
  const orderBy = buildOrderBy(sortField, sortDir);
  const now = new Date();

  const findPage = (targetPage: number) =>
    prisma.quote.findMany({
      where,
      orderBy,
      skip: (targetPage - 1) * pageSize,
      take: pageSize,
      // Explicit select: requestSnapshot and chargesSnapshot are large JSON blobs
      // this table never renders.
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
        client: { select: { id: true, companyName: true, contactName: true } },
      },
    });

  const [firstAttempt, total] = await Promise.all([
    findPage(requestedPage),
    prisma.quote.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // A bookmark can ask for a page that no longer exists, e.g. after deleting the
  // last few quotes. Falling back to the last real page keeps that from reading
  // as "you have no quotes".
  const page = Math.min(requestedPage, pageCount);
  const rows = page === requestedPage ? firstAttempt : await findPage(page);

  const mapped: QuoteRow[] = rows.map((r) => ({
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
    client: r.client,
    isExpired: r.validUntil < now && r.status === "DRAFT",
  }));

  return { rows: mapped, total, pageCount, page, pageSize };
}
