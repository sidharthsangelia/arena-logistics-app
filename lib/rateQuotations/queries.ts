/**
 * lib/rateQuotations/queries.ts
 *
 * Read and write for the generated rate-card history.
 *
 * Kept out of the "use server" action file for the same reason as
 * lib/quotes/adminQueries.ts: that file exports functions only, and the
 * where/orderBy building deserves to be readable in one piece.
 *
 * Nothing here is org-scoped. Rate cards are Arena's own documents, built by
 * Arena staff from Arena's cost book, which is exactly why every caller gates
 * on Arena membership first.
 */

import "server-only";

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/utils/db";

import {
  DEFAULT_RATE_QUOTATION_PAGE_SIZE,
  RATE_QUOTATION_PAGE_SIZE_OPTIONS,
  coerceRateQuotationAudienceFilter,
  coerceRateQuotationSortField,
  type RateQuotationListParams,
  type RateQuotationPage,
  type RateQuotationRow,
  type RateQuotationSortField,
} from "./config";

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

/**
 * The next card number, as ARQ-YYYY-NNNN.
 *
 * Per-year sequence rather than one running forever: a number that resets each
 * January says at a glance how much of this year's work a card represents, and
 * it keeps the number short enough to read down a phone.
 *
 * Derived from the highest existing number in the year rather than a counter
 * row, because there is no concurrent generation to speak of here — one staff
 * member clicking a button — and a counter row is a second thing to keep
 * correct. The unique index on cardNumber is the actual guarantee: if two ever
 * did collide, the insert fails loudly rather than issuing a duplicate.
 */
async function nextCardNumber(year: number): Promise<string> {
  const prefix = `ARQ-${year}-`;

  const latest = await prisma.rateQuotation.findFirst({
    where: { cardNumber: { startsWith: prefix } },
    orderBy: { cardNumber: "desc" },
    select: { cardNumber: true },
  });

  const previous = latest ? Number(latest.cardNumber.slice(prefix.length)) : 0;
  const next = Number.isFinite(previous) ? previous + 1 : 1;

  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface RecordQuotationInput {
  runId: string;
  audience: "CUSTOMER" | "INTERNAL";
  layout: "BY_SERVICE" | "CHEAPEST";

  countryCodes: string[];
  weightsKg: number[];
  carriers: string[];

  markupPercent: number;
  validityDays: number;
  validUntil: Date;
  includeDutyUnpaid: boolean;
  includeRestricted: boolean;

  preparedFor: string;
  clientId: string | null;

  generatedByUserId: string;
  generatedByName: string | null;

  fileName: string;
  /** Null for internal cards. See lib/rateSweep/excel/storage.ts. */
  fileUrl: string | null;
  fileKey: string | null;
  fileSize: number | null;

  carrierCount: number;
  sheetCount: number;
}

/**
 * Write the history row for one generated workbook.
 *
 * Always an insert. Regenerating the same settings makes a second row, because
 * "what did we actually send them in June" is the question a rate dispute turns
 * on and updating in place destroys the answer.
 */
export async function recordRateQuotation(
  input: RecordQuotationInput,
): Promise<{ id: string; cardNumber: string }> {
  const cardNumber = await nextCardNumber(new Date().getFullYear());

  const row = await prisma.rateQuotation.create({
    data: {
      cardNumber,
      runId: input.runId,
      audience: input.audience,
      layout: input.layout,
      countryCodes: input.countryCodes,
      weightsKg: input.weightsKg,
      carriers: input.carriers,
      markupPercent: input.markupPercent,
      validityDays: input.validityDays,
      validUntil: input.validUntil,
      includeDutyUnpaid: input.includeDutyUnpaid,
      includeRestricted: input.includeRestricted,
      preparedFor: input.preparedFor || null,
      clientId: input.clientId,
      generatedByUserId: input.generatedByUserId,
      generatedByName: input.generatedByName,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      fileKey: input.fileKey,
      fileSize: input.fileSize,
      carrierCount: input.carrierCount,
      sheetCount: input.sheetCount,
    },
    select: { id: true, cardNumber: true },
  });

  return row;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function coercePage(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.floor(value as number)
    : 1;
}

function coercePageSize(value: number | undefined): number {
  return (RATE_QUOTATION_PAGE_SIZE_OPTIONS as readonly number[]).includes(
    value as number,
  )
    ? (value as number)
    : DEFAULT_RATE_QUOTATION_PAGE_SIZE;
}

function buildWhere(opts: {
  audience: ReturnType<typeof coerceRateQuotationAudienceFilter>;
  search: string;
}): Prisma.RateQuotationWhereInput {
  const where: Prisma.RateQuotationWhereInput = {};

  if (opts.audience !== "ALL") where.audience = opts.audience;

  if (opts.search) {
    const contains = { contains: opts.search, mode: "insensitive" as const };

    where.OR = [
      { cardNumber: contains },
      { preparedFor: contains },
      { generatedByName: contains },
      { client: { companyName: contains } },
      // Country codes are stored uppercase, so a lowercase search for "de"
      // would otherwise miss every card covering Germany.
      { countryCodes: { has: opts.search.toUpperCase() } },
    ];
  }

  return where;
}

function buildOrderBy(
  field: RateQuotationSortField,
  dir: "asc" | "desc",
): Prisma.RateQuotationOrderByWithRelationInput[] {
  const primary: Prisma.RateQuotationOrderByWithRelationInput = { [field]: dir };

  // createdAt as a tiebreak so two cards generated in the same minute keep a
  // stable order between pages rather than swapping places on a refetch.
  return field === "createdAt" ? [primary] : [primary, { createdAt: "desc" }];
}

export async function getRateQuotationsPage(
  params: RateQuotationListParams,
): Promise<RateQuotationPage> {
  const page = coercePage(params.page);
  const pageSize = coercePageSize(params.pageSize);
  const sortField = coerceRateQuotationSortField(params.sortField);
  const sortDir = params.sortDir === "asc" ? "asc" : "desc";
  const audience = coerceRateQuotationAudienceFilter(params.audience);
  const search = (params.search ?? "").trim();

  const where = buildWhere({ audience, search });

  const [total, rows] = await Promise.all([
    prisma.rateQuotation.count({ where }),
    prisma.rateQuotation.findMany({
      where,
      orderBy: buildOrderBy(sortField, sortDir),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        cardNumber: true,
        audience: true,
        layout: true,
        preparedFor: true,
        clientId: true,
        client: { select: { companyName: true } },
        countryCodes: true,
        weightsKg: true,
        carriers: true,
        carrierCount: true,
        sheetCount: true,
        markupPercent: true,
        validUntil: true,
        generatedByName: true,
        fileName: true,
        fileUrl: true,
        fileSize: true,
        createdAt: true,
      },
    }),
  ]);

  // One clock for the whole page. Computing expiry per row in the client would
  // let two rows on the same screen disagree about what "today" is.
  const now = Date.now();

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    total,
    page,
    pageSize,
    pageCount,
    rows: rows.map(
      (row): RateQuotationRow => ({
        id: row.id,
        cardNumber: row.cardNumber,
        audience: row.audience,
        layout: row.layout,
        preparedFor: row.preparedFor,
        clientId: row.clientId,
        clientName: row.client?.companyName ?? null,
        countryCodes: row.countryCodes,
        countryCount: row.countryCodes.length,
        weightCount: row.weightsKg.length,
        carrierCount: row.carrierCount,
        sheetCount: row.sheetCount,
        markupPercent: Number(row.markupPercent),
        validUntil: row.validUntil.toISOString(),
        expired: row.validUntil.getTime() < now,
        generatedByName: row.generatedByName,
        fileName: row.fileName,
        fileUrl: row.fileUrl,
        fileSize: row.fileSize,
        createdAt: row.createdAt.toISOString(),
      }),
    ),
  };
}
