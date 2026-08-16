/**
 * lib/rateQuotations/config.ts
 *
 * Pure, shared vocabulary for the generated rate-card history: page sizes, sort
 * fields, the audience filter and the row shape. Safe to import from client and
 * server alike — no "server-only", no prisma, no JSX.
 *
 * Same split as lib/quotes/config.ts, and for the same reason: the table
 * component and the server action have to agree on what a row is, and a shape
 * defined twice is a shape that drifts.
 */

// ---------------------------------------------------------------------------
// Pagination + sorting
// ---------------------------------------------------------------------------

export const RATE_QUOTATION_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_RATE_QUOTATION_PAGE_SIZE = 25;

export type RateQuotationSortField =
  | "createdAt"
  | "cardNumber"
  | "preparedFor"
  | "validUntil";

export const RATE_QUOTATION_SORT_FIELDS: readonly RateQuotationSortField[] = [
  "createdAt",
  "cardNumber",
  "preparedFor",
  "validUntil",
];

export const DEFAULT_RATE_QUOTATION_SORT: RateQuotationSortField = "createdAt";

export function coerceRateQuotationSortField(
  value: unknown,
): RateQuotationSortField {
  return RATE_QUOTATION_SORT_FIELDS.includes(value as RateQuotationSortField)
    ? (value as RateQuotationSortField)
    : DEFAULT_RATE_QUOTATION_SORT;
}

// ---------------------------------------------------------------------------
// Audience filter
// ---------------------------------------------------------------------------

/**
 * The filter that matters on this table.
 *
 * A customer card and an internal cost card look similar in a list and mean
 * completely different things, so the filter is offered first and the audience
 * is a column rather than something you have to open the file to learn.
 */
export const RATE_QUOTATION_AUDIENCE_FILTERS = [
  "ALL",
  "CUSTOMER",
  "INTERNAL",
] as const;

export type RateQuotationAudienceFilter =
  (typeof RATE_QUOTATION_AUDIENCE_FILTERS)[number];

export const RATE_QUOTATION_AUDIENCE_FILTER_LABELS: Record<
  RateQuotationAudienceFilter,
  string
> = {
  ALL: "All audiences",
  CUSTOMER: "Customer",
  INTERNAL: "Internal (cost)",
};

export function coerceRateQuotationAudienceFilter(
  value: unknown,
): RateQuotationAudienceFilter {
  return RATE_QUOTATION_AUDIENCE_FILTERS.includes(
    value as RateQuotationAudienceFilter,
  )
    ? (value as RateQuotationAudienceFilter)
    : "ALL";
}

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

/**
 * One generated workbook, flattened for a table.
 *
 * `fileUrl` is null on every internal card by design, not by accident — those
 * are never stored. The table says so in words rather than showing a broken
 * link, because "no file" here is a deliberate policy and reads as a bug
 * otherwise.
 */
export interface RateQuotationRow {
  id: string;
  cardNumber: string;
  audience: "CUSTOMER" | "INTERNAL";
  layout: "BY_SERVICE" | "CHEAPEST";

  preparedFor: string | null;
  clientId: string | null;
  clientName: string | null;

  countryCount: number;
  countryCodes: string[];
  weightCount: number;
  carrierCount: number;
  sheetCount: number;

  markupPercent: number;
  validUntil: string;
  /** True once validUntil has passed. Computed server-side against one clock. */
  expired: boolean;

  generatedByName: string | null;
  fileName: string;
  fileUrl: string | null;
  fileSize: number | null;

  createdAt: string;
}

export interface RateQuotationListParams {
  page: number;
  pageSize: number;
  sortField: RateQuotationSortField;
  sortDir: "asc" | "desc";
  audience: RateQuotationAudienceFilter;
  search?: string;
}

export interface RateQuotationPage {
  rows: RateQuotationRow[];
  total: number;
  /** The page actually served. Clamped, so a stale ?page= does not show blank. */
  page: number;
  pageSize: number;
  pageCount: number;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export const RATE_QUOTATION_LAYOUT_LABELS: Record<
  RateQuotationRow["layout"],
  string
> = {
  BY_SERVICE: "Per carrier",
  CHEAPEST: "Best rate",
};

/** Bytes to something a person reads. Null renders as a dash at the call site. */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
