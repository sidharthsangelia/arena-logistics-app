/**
 * lib/quotes/config.ts
 *
 * Pure, shared configuration for both quote tables: the tenant's own list and
 * the Arena-side cross-tenant list. Safe to import from client and server alike:
 * no "server-only", no prisma, no JSX.
 *
 * Both views read the same page sizes, status vocabulary and row shape, so a
 * change to how a status reads or what a row carries lands once. The two differ
 * in exactly one place, the sortable columns: only the Arena view can sort by
 * organisation, because only it spans more than one.
 */

import type { EmailEvent, QuoteStatus } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Pagination + sorting
// ---------------------------------------------------------------------------

export const QUOTE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_QUOTE_PAGE_SIZE = 25;

/** Columns both views can sort by. */
export type QuoteSortField =
  | "createdAt"
  | "quoteNumber"
  | "status"
  | "quotedTotal"
  | "validUntil"
  | "clientName";

export const QUOTE_SORT_FIELDS: readonly QuoteSortField[] = [
  "createdAt",
  "quoteNumber",
  "status",
  "quotedTotal",
  "validUntil",
  "clientName",
];

export const DEFAULT_QUOTE_SORT: QuoteSortField = "createdAt";

export function coerceQuoteSortField(value: unknown): QuoteSortField {
  return QUOTE_SORT_FIELDS.includes(value as QuoteSortField)
    ? (value as QuoteSortField)
    : DEFAULT_QUOTE_SORT;
}

/** The tenant columns plus organisation, which only exists across tenants. */
export type AdminQuoteSortField =
  | "createdAt"
  | "quoteNumber"
  | "status"
  | "quotedTotal"
  | "validUntil"
  | "orgName"
  | "clientName";

export const ADMIN_QUOTE_SORT_FIELDS: readonly AdminQuoteSortField[] = [
  "createdAt",
  "quoteNumber",
  "status",
  "quotedTotal",
  "validUntil",
  "orgName",
  "clientName",
];

export const DEFAULT_ADMIN_QUOTE_SORT: AdminQuoteSortField = "createdAt";

export function coerceAdminQuoteSortField(value: unknown): AdminQuoteSortField {
  return ADMIN_QUOTE_SORT_FIELDS.includes(value as AdminQuoteSortField)
    ? (value as AdminQuoteSortField)
    : DEFAULT_ADMIN_QUOTE_SORT;
}

// ---------------------------------------------------------------------------
// Status filter
// ---------------------------------------------------------------------------

export const QUOTE_STATUS_FILTERS = [
  "ALL",
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type QuoteStatusFilter = (typeof QUOTE_STATUS_FILTERS)[number];

export const QUOTE_STATUS_FILTER_LABELS: Record<QuoteStatusFilter, string> = {
  ALL: "All statuses",
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

export function coerceQuoteStatusFilter(value: unknown): QuoteStatusFilter {
  return (QUOTE_STATUS_FILTERS as readonly string[]).includes(value as string)
    ? (value as QuoteStatusFilter)
    : "ALL";
}

// ---------------------------------------------------------------------------
// Row DTOs
// ---------------------------------------------------------------------------

/**
 * One row of the tenant's own quotes table.
 *
 * Dates are ISO strings and money is a plain number: the tables are client
 * components, so nothing here may be a Decimal or a Date.
 */
export interface QuoteRow {
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
  client: {
    id: string;
    companyName: string;
    contactName: string | null;
  } | null;
  /** A draft whose validity window has already closed. */
  isExpired: boolean;
}

/**
 * One row of the Arena quotes table: the tenant row plus the org the quote
 * belongs to, which is what lets ops tell whose quote they are looking at once
 * results span every business associate.
 */
export interface AdminQuoteRow extends QuoteRow {
  org: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface QuoteListParams {
  page?: number;
  pageSize?: number;
  sortField?: QuoteSortField;
  sortDir?: "asc" | "desc";
  status?: QuoteStatusFilter;
  search?: string;
}

export interface AdminQuoteListParams extends Omit<QuoteListParams, "sortField"> {
  sortField?: AdminQuoteSortField;
}

export interface QuotePage {
  rows: QuoteRow[];
  total: number;
  pageCount: number;
  page: number;
  pageSize: number;
}

export interface AdminQuotePage extends Omit<QuotePage, "rows"> {
  rows: AdminQuoteRow[];
}
