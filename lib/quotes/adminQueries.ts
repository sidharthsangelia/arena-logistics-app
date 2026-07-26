/**
 * lib/quotes/adminQueries.ts
 *
 * The read side of the Arena-side quotes list. Separated from the action so the
 * "use server" file exports functions only, and so the `where`/`orderBy`
 * building lives somewhere it can be read in one piece.
 *
 * Scope note: there is intentionally no orgId filter here. This is the
 * company-internal view across every tenant, which is exactly why the action
 * that calls it gates on Arena membership.
 */

import "server-only";

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import {
  DEFAULT_QUOTE_PAGE_SIZE,
  QUOTE_PAGE_SIZE_OPTIONS,
  coerceAdminQuoteSortField,
  coerceQuoteStatusFilter,
  type AdminQuoteListParams,
  type AdminQuotePage,
  type AdminQuoteRow,
  type AdminQuoteSortField,
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
  status: ReturnType<typeof coerceQuoteStatusFilter>;
  search: string;
}): Prisma.QuoteWhereInput {
  const where: Prisma.QuoteWhereInput = {};

  if (opts.status !== "ALL") where.status = opts.status;

  if (opts.search) {
    where.OR = [
      { quoteNumber: { contains: opts.search, mode: "insensitive" } },
      { vendorName: { contains: opts.search, mode: "insensitive" } },
      { productName: { contains: opts.search, mode: "insensitive" } },
      { client: { companyName: { contains: opts.search, mode: "insensitive" } } },
      { org: { name: { contains: opts.search, mode: "insensitive" } } },
      { org: { slug: { contains: opts.search, mode: "insensitive" } } },
    ];
  }

  return where;
}

function buildOrderBy(
  field: AdminQuoteSortField,
  dir: "asc" | "desc",
): Prisma.QuoteOrderByWithRelationInput[] {
  const primary: Prisma.QuoteOrderByWithRelationInput =
    field === "orgName"
      ? { org: { name: dir } }
      : field === "clientName"
        ? { client: { companyName: dir } }
        : { [field]: dir };

  // createdAt is the tiebreaker so equal values (same status, same org, same
  // total) keep a stable order across pages instead of shuffling.
  return field === "createdAt" ? [primary] : [primary, { createdAt: "desc" }];
}

export async function getAdminQuotesPage(
  params: AdminQuoteListParams,
): Promise<AdminQuotePage> {
  const requestedPage = coercePage(params.page);
  const pageSize = coercePageSize(params.pageSize);
  const sortField = coerceAdminQuoteSortField(params.sortField);
  const sortDir: "asc" | "desc" = params.sortDir === "asc" ? "asc" : "desc";
  const status = coerceQuoteStatusFilter(params.status);
  const search = params.search?.trim() ?? "";

  const where = buildWhere({ status, search });
  const orderBy = buildOrderBy(sortField, sortDir);
  const now = new Date();

  const findPage = (targetPage: number) =>
    prisma.quote.findMany({
      where,
      orderBy,
      skip: (targetPage - 1) * pageSize,
      take: pageSize,
      // Explicit select: requestSnapshot and chargesSnapshot are large JSON
      // blobs that this table never renders, and pulling them would dominate the
      // response size.
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
        org: { select: { id: true, name: true, slug: true } },
        client: { select: { id: true, companyName: true, contactName: true } },
      },
    });

  const [firstAttempt, total] = await Promise.all([
    findPage(requestedPage),
    prisma.quote.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // A bookmark or a stale link can ask for a page that no longer exists, e.g.
  // page 3 of a list that has since shrunk to one page. Returning that empty page
  // would read as "no quotes exist", so fall back to the last real page. Costs a
  // second query only in that rare case, which is why the count is not awaited
  // ahead of the rows.
  const page = Math.min(requestedPage, pageCount);
  const rows = page === requestedPage ? firstAttempt : await findPage(page);

  const mapped: AdminQuoteRow[] = rows.map((r) => ({
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

  return { rows: mapped, total, pageCount, page, pageSize };
}
