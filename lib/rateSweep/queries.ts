/**
 * lib/rateSweep/queries.ts
 *
 * Reads for the admin rate-sweep screens.
 *
 * All of these are Arena-internal and every one of them exposes raw vendor cost,
 * so nothing here may be called from a tenant surface. The gate is on the pages
 * and the actions rather than in this module, matching how the rest of the app
 * is arranged (utils/arena-auth.ts), but the constraint is worth stating where
 * the queries live: a marked-up price is what a customer sees, and these are the
 * numbers before markup.
 */

import "server-only";

import { cache } from "react";

import {
  Prisma,
  type RateContentType,
  type RateDutyMode,
  RateSweepCallStatus,
  RateSweepStatus,
} from "@/generated/prisma";
import { prisma } from "@/utils/db";

import { UNMAPPED_CARRIER, isOwnBrandNetwork } from "./carrier";
import { MAX_QUOTABLE_AGE_DAYS } from "./config";
import { judgeVendor, type VendorHealth } from "./health";

// ---------------------------------------------------------------------------
// Runs list
// ---------------------------------------------------------------------------

export interface SweepRunRow {
  id: string;
  status: RateSweepStatus;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  durationMinutes: number | null;
  configVersion: string;
  vendorIds: string[];
  laneCount: number;
  lanesCompleted: number;
  plannedCalls: number;
  okCalls: number;
  failedCalls: number;
  snapshotCount: number;
  notes: string | null;
}

export async function listSweepRuns(limit = 25): Promise<SweepRunRow[]> {
  const runs = await prisma.rateSweepRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      trigger: true,
      startedAt: true,
      finishedAt: true,
      configVersion: true,
      vendorIds: true,
      laneCount: true,
      lanesCompleted: true,
      plannedCalls: true,
      okCalls: true,
      failedCalls: true,
      snapshotCount: true,
      notes: true,
    },
  });

  return runs.map((run) => ({
    ...run,
    trigger: run.trigger,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMinutes: run.finishedAt
      ? Math.round(
          (run.finishedAt.getTime() - run.startedAt.getTime()) / 60_000,
        )
      : null,
  }));
}

// ---------------------------------------------------------------------------
// One run
// ---------------------------------------------------------------------------

/**
 * The judgement, plus the status spread the table shows underneath it.
 *
 * The judgement itself comes from lib/rateSweep/health.ts rather than being
 * recomputed here. It used to be recomputed here, with `attempted` as the
 * denominator, which meant this screen showed a vendor a 0% failure rate on a
 * run where it had silently recorded nothing for eleven countries.
 */
export type VendorBreakdownRow = VendorHealth & {
  byStatus: Record<string, number>;
};

export interface SweepRunDetail {
  run: SweepRunRow;
  vendors: VendorBreakdownRow[];
  /** Live progress for a run still in flight. Null once it has finished. */
  progress: { callsMade: number; plannedCalls: number } | null;
}

/**
 * One run, with its per-vendor breakdown.
 *
 * Memoised per request with React's `cache`. The detail screen reads it from
 * four separate Suspense boundaries — the header, the vendor table, the carrier
 * comparison and the matrix browser all need the run's vendor list — and each of
 * those has to be able to ask for it independently or they could not stream
 * independently. De-duplication within one render, not a cache across requests:
 * a sweep in flight changes every few seconds and the screen polls to show it.
 */
export const getSweepRunDetail = cache(async function getSweepRunDetail(
  runId: string,
): Promise<SweepRunDetail | null> {
  const run = await prisma.rateSweepRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      trigger: true,
      startedAt: true,
      finishedAt: true,
      configVersion: true,
      vendorIds: true,
      laneCount: true,
      lanesCompleted: true,
      plannedCalls: true,
      okCalls: true,
      failedCalls: true,
      snapshotCount: true,
      notes: true,
    },
  });

  if (!run) return null;

  const [callGroups, laneGroups, snapshotGroups] = await Promise.all([
    prisma.rateSweepCall.groupBy({
      by: ["vendorId", "status"],
      where: { runId },
      _count: { _all: true },
    }),
    // Lane-level coverage. One more grouped read on an indexed column, and it
    // is the read that makes "this vendor has no USA rows at all" visible on
    // the screen instead of hiding inside a healthy-looking percentage.
    prisma.rateSweepCall.groupBy({
      by: ["vendorId", "destCountryCode"],
      where: { runId },
      _count: { _all: true },
    }),
    prisma.vendorRateSnapshot.groupBy({
      by: ["vendorId"],
      where: { runId },
      _count: { _all: true },
    }),
  ]);

  const snapshotsByVendor = new Map(
    snapshotGroups.map((g) => [g.vendorId, g._count._all]),
  );

  // From the run's own stored plan, so a run swept before a country was added
  // is still judged against the matrix it actually set out to cover.
  const vendorCount = Math.max(1, run.vendorIds.length);
  const expectedPerVendor = Math.floor(run.plannedCalls / vendorCount);
  const lanesPerVendor = Math.floor(run.laneCount / vendorCount);
  const slabsPerLane =
    run.laneCount > 0 ? Math.floor(run.plannedCalls / run.laneCount) : 0;

  // Driven off the run's own vendorIds rather than off whatever happens to have
  // rows, so a vendor that produced nothing at all still appears as a line of
  // zeroes. A vendor that silently vanished from the report is the exact failure
  // this screen exists to make visible.
  const vendors: VendorBreakdownRow[] = run.vendorIds.map((vendorId) => {
    const forVendor = callGroups.filter((g) => g.vendorId === vendorId);

    const byStatus: Record<string, number> = {};
    for (const group of forVendor) {
      byStatus[group.status] = group._count._all;
    }

    const lanes = laneGroups.filter((g) => g.vendorId === vendorId);

    return {
      ...judgeVendor({
        // A sweep in progress is judged on what it has done so far. The full
        // expected-versus-recorded accounting only makes sense once it is over.
        inFlight: run.status === RateSweepStatus.RUNNING,
        vendorId,
        expected: expectedPerVendor,
        attempted: forVendor.reduce((sum, g) => sum + g._count._all, 0),
        ok: byStatus[RateSweepCallStatus.OK] ?? 0,
        noService: byStatus[RateSweepCallStatus.NO_SERVICE] ?? 0,
        snapshots: snapshotsByVendor.get(vendorId) ?? 0,
        lanesExpected: lanesPerVendor,
        lanesWithRows: lanes.length,
        lanesComplete:
          slabsPerLane > 0
            ? lanes.filter((g) => g._count._all >= slabsPerLane).length
            : 0,
      }),
      byStatus,
    };
  });

  const callsMade = vendors.reduce((sum, v) => sum + v.attempted, 0);

  return {
    run: {
      ...run,
      trigger: run.trigger,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      durationMinutes: run.finishedAt
        ? Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 60_000)
        : null,
    },
    vendors,
    progress:
      run.status === RateSweepStatus.RUNNING
        ? { callsMade, plannedCalls: run.plannedCalls }
        : null,
  };
});

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

export interface SweepFailureRow {
  vendorId: string;
  destCountryCode: string;
  weightKg: string;
  status: RateSweepCallStatus;
  errorKind: string | null;
  errorMessage: string | null;
  httpStatus: number | null;
  syntheticPostcode: boolean;
}

/**
 * The failures worth a person's attention, newest first.
 *
 * NO_SERVICE is excluded by default. It is the single most common non-OK status
 * and it is not a problem: a list where nineteen of every twenty rows are
 * "Brazil, as expected, no" is a list nobody scrolls to the bottom of.
 */
export async function listSweepFailures(
  runId: string,
  opts: { includeNoService?: boolean; limit?: number } = {},
): Promise<SweepFailureRow[]> {
  const rows = await prisma.rateSweepCall.findMany({
    where: {
      runId,
      status: opts.includeNoService
        ? { not: RateSweepCallStatus.OK }
        : {
            notIn: [RateSweepCallStatus.OK, RateSweepCallStatus.NO_SERVICE],
          },
    },
    orderBy: [{ vendorId: "asc" }, { destCountryCode: "asc" }, { weightKg: "asc" }],
    take: opts.limit ?? 200,
    select: {
      vendorId: true,
      destCountryCode: true,
      weightKg: true,
      status: true,
      errorKind: true,
      errorMessage: true,
      httpStatus: true,
      syntheticPostcode: true,
    },
  });

  return rows.map((row) => ({ ...row, weightKg: row.weightKg.toString() }));
}

// ---------------------------------------------------------------------------
// The matrix itself
// ---------------------------------------------------------------------------

export interface MatrixRow {
  vendorId: string;
  vendorName: string;
  productName: string;
  carrier: string;
  dutyMode: RateDutyMode;
  contentType: RateContentType;
  pickupIncluded: boolean | null;
  restrictionNote: string | null;
  destCountryCode: string;
  weightKg: string;
  currency: string;
  isComparable: boolean;
  totalWithTax: string;
  totalWithoutTax: string;
  taxAmount: string;
  tatDays: number;
  capturedAt: string;
}

export interface MatrixFilters {
  runId?: string;
  countryCode?: string;
  vendorId?: string;
  /** Normalised carrier code, e.g. "FEDEX". Cuts across vendors. */
  carrier?: string;
  /** Only rows at this exact slab. */
  weightKg?: number;
  /** Cheapest comparable row per lane instead of every row. */
  cheapestOnly?: boolean;
  limit?: number;
}

export async function browseMatrix(filters: MatrixFilters): Promise<MatrixRow[]> {
  const where: Prisma.VendorRateSnapshotWhereInput = {};

  if (filters.runId) where.runId = filters.runId;
  if (filters.countryCode) where.destCountryCode = filters.countryCode;
  if (filters.vendorId) where.vendorId = filters.vendorId;
  if (filters.carrier) where.carrier = filters.carrier;
  if (filters.weightKg !== undefined) {
    where.weightKg = new Prisma.Decimal(filters.weightKg);
  }
  // A cheapest-of list must never mix currencies. Aramex can quote in something
  // other than INR, and nothing in this system invents an exchange rate, so the
  // honest answer is to leave non-INR rows out of the comparison rather than
  // rank them against rupees.
  if (filters.cheapestOnly) where.isComparable = true;

  const rows = await prisma.vendorRateSnapshot.findMany({
    where,
    orderBy: [
      { destCountryCode: "asc" },
      { weightKg: "asc" },
      { totalWithTax: "asc" },
    ],
    take: filters.limit ?? 500,
    select: {
      vendorId: true,
      vendorName: true,
      productName: true,
      carrier: true,
      dutyMode: true,
      contentType: true,
      pickupIncluded: true,
      restrictionNote: true,
      destCountryCode: true,
      weightKg: true,
      currency: true,
      isComparable: true,
      totalWithTax: true,
      totalWithoutTax: true,
      taxAmount: true,
      tatDays: true,
      capturedAt: true,
    },
  });

  const mapped: MatrixRow[] = rows.map((row) => ({
    ...row,
    weightKg: row.weightKg.toString(),
    totalWithTax: row.totalWithTax.toString(),
    totalWithoutTax: row.totalWithoutTax.toString(),
    taxAmount: row.taxAmount.toString(),
    capturedAt: row.capturedAt.toISOString(),
  }));

  if (!filters.cheapestOnly) return mapped;

  // Already sorted cheapest-first within each (country, weight), so the first
  // row seen for a key is the winner. Done here rather than as a DISTINCT ON in
  // SQL because the row cap above is applied before this, and a database-side
  // dedupe would silently change what the cap means.
  const seen = new Set<string>();
  return mapped.filter((row) => {
    const key = `${row.destCountryCode}:${row.weightKg}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Carrier comparison
// ---------------------------------------------------------------------------

export interface CarrierComparisonCell {
  carrier: string;
  /** Cheapest comparable price this vendor has for this carrier on this lane. */
  byVendor: Record<string, { totalWithTax: string; productName: string; tatDays: number }>;
  /** The vendorId holding the cheapest of them. */
  bestVendorId: string | null;
}

/**
 * "Whose FedEx is cheapest to the US at 5kg", for every carrier at once.
 *
 * This is the question the whole carrier column exists for, and the reason it
 * cannot be a groupBy: Prisma's groupBy cannot also return the productName that
 * produced the minimum, and knowing that a Shipmozo FedEx rate is cheapest is
 * only half an answer without knowing it was the non-documents one.
 *
 * ── WHAT IS DELIBERATELY EXCLUDED ───────────────────────────────────────────
 * Reseller own-brand networks (ShipGlobal Direct, Shipmozo Sky Saver) are left
 * out. Only one vendor sells each of them, so they can never produce a
 * comparison, and a row with a single populated column in a table headed
 * "cheapest across vendors" reads as a win when it is really a monopoly. They
 * are still in the matrix browser, which is where you go to see them.
 *
 * Non-INR rows are excluded for the usual reason: nothing here invents an
 * exchange rate.
 */
export async function compareCarriers(params: {
  runId: string;
  countryCode: string;
  weightKg: number;
  /** Compare like with like: pass a duty mode to avoid ranking DDU against DDP. */
  dutyMode?: RateDutyMode;
}): Promise<CarrierComparisonCell[]> {
  const rows = await prisma.vendorRateSnapshot.findMany({
    where: {
      runId: params.runId,
      destCountryCode: params.countryCode,
      weightKg: new Prisma.Decimal(params.weightKg),
      isComparable: true,
      ...(params.dutyMode ? { dutyMode: params.dutyMode } : {}),
    },
    orderBy: { totalWithTax: "asc" },
    select: {
      carrier: true,
      vendorId: true,
      productName: true,
      totalWithTax: true,
      tatDays: true,
    },
  });

  const byCarrier = new Map<string, CarrierComparisonCell>();

  // Rows arrive cheapest-first, so the first row seen for a (carrier, vendor)
  // pair is that vendor's best, and the first row seen for a carrier at all is
  // the overall winner. No second pass needed.
  for (const row of rows) {
    if (isOwnBrandNetwork(row.carrier)) continue;

    let cell = byCarrier.get(row.carrier);
    if (!cell) {
      cell = { carrier: row.carrier, byVendor: {}, bestVendorId: row.vendorId };
      byCarrier.set(row.carrier, cell);
    }

    if (!cell.byVendor[row.vendorId]) {
      cell.byVendor[row.vendorId] = {
        totalWithTax: row.totalWithTax.toString(),
        productName: row.productName,
        tatDays: row.tatDays,
      };
    }
  }

  // Carriers offered by more than one vendor first: those are the rows that
  // answer a question, and they are what somebody opened this screen for.
  return [...byCarrier.values()].sort((a, b) => {
    const spread = Object.keys(b.byVendor).length - Object.keys(a.byVendor).length;
    if (spread !== 0) return spread;
    return a.carrier.localeCompare(b.carrier);
  });
}

/**
 * Carrier codes that actually appear in a run, commonest first.
 *
 * Drives the filter chips. Built from the data rather than from the rule list
 * so the filter has no chips that return nothing, and so a carrier that turns
 * up unexpectedly is visible in the UI without a deploy.
 */
export async function listRunCarriers(runId: string): Promise<string[]> {
  const groups = await prisma.vendorRateSnapshot.groupBy({
    by: ["carrier"],
    where: { runId },
    _count: { _all: true },
  });

  return groups
    .sort((a, b) => b._count._all - a._count._all)
    .map((group) => group.carrier);
}

// ---------------------------------------------------------------------------
// The review list
// ---------------------------------------------------------------------------

export interface UnmappedServiceRow {
  vendorId: string;
  productName: string;
  rows: number;
  countries: number;
}

/**
 * Service names that matched no carrier rule.
 *
 * An unmapped name is not an error, but it is the one thing in this system that
 * needs a person to look: either a vendor has started selling a carrier we have
 * no rule for, in which case every one of its rates is missing from the carrier
 * comparison, or it is a reseller product that belongs in OTHER. Silence about
 * it would mean a carrier quietly absent from a quotation sheet.
 *
 * Scoped to one run so the list reflects what a vendor is selling now, not
 * every name ever seen.
 */
export async function listUnmappedServices(
  runId: string,
): Promise<UnmappedServiceRow[]> {
  const rows = await prisma.vendorRateSnapshot.findMany({
    where: { runId, carrier: UNMAPPED_CARRIER },
    select: { vendorId: true, productName: true, destCountryCode: true },
  });

  const grouped = new Map<string, { vendorId: string; productName: string; countries: Set<string>; rows: number }>();

  for (const row of rows) {
    const key = `${row.vendorId}:${row.productName}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.rows += 1;
      existing.countries.add(row.destCountryCode);
    } else {
      grouped.set(key, {
        vendorId: row.vendorId,
        productName: row.productName,
        countries: new Set([row.destCountryCode]),
        rows: 1,
      });
    }
  }

  return [...grouped.values()]
    .map((group) => ({
      vendorId: group.vendorId,
      productName: group.productName,
      rows: group.rows,
      countries: group.countries.size,
    }))
    .sort((a, b) => b.rows - a.rows);
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

/**
 * How old the newest usable data is, and whether that is a problem.
 *
 * The header of the rate-sweep screen reads from this. It answers the question
 * that actually matters day to day, which is not "did last night's run work"
 * but "is what I would quote from right now still true".
 *
 * Wrapped in React's `cache` so the sweeps screen can read it from two separate
 * Suspense boundaries — the banner and the stored-rate count — and still pay for
 * one round trip. Per request, not across requests: this is de-duplication, not
 * caching, and a value this page exists to keep honest must never be stale.
 */
export const getMatrixFreshness = cache(async function getMatrixFreshness(): Promise<{
  lastGoodRunAt: string | null;
  ageDays: number | null;
  stale: boolean;
  totalSnapshots: number;
}> {
  const [lastGood, total] = await Promise.all([
    prisma.rateSweepRun.findFirst({
      where: {
        status: { in: [RateSweepStatus.COMPLETED, RateSweepStatus.PARTIAL] },
        snapshotCount: { gt: 0 },
      },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    prisma.vendorRateSnapshot.count(),
  ]);

  if (!lastGood) {
    return { lastGoodRunAt: null, ageDays: null, stale: true, totalSnapshots: total };
  }

  const ageDays = (Date.now() - lastGood.startedAt.getTime()) / 86_400_000;

  return {
    lastGoodRunAt: lastGood.startedAt.toISOString(),
    ageDays: Math.floor(ageDays),
    stale: ageDays > MAX_QUOTABLE_AGE_DAYS,
    totalSnapshots: total,
  };
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Every snapshot of a run as CSV rows, flattened for a spreadsheet or a
 * notebook.
 *
 * Streams nothing and paginates nothing: a run is roughly 7,000 rows, which is
 * a couple of megabytes and well inside what a single response can carry. If
 * the matrix ever grows an order of magnitude this becomes a cursor loop, and
 * the row cap here is what will make that obvious rather than silent.
 */
export const CSV_EXPORT_ROW_CAP = 50_000;

export async function exportRunCsv(runId: string): Promise<string> {
  const rows = await prisma.vendorRateSnapshot.findMany({
    where: { runId },
    orderBy: [
      { destCountryCode: "asc" },
      { weightKg: "asc" },
      { vendorId: "asc" },
    ],
    take: CSV_EXPORT_ROW_CAP,
    select: {
      capturedAt: true,
      vendorId: true,
      productName: true,
      carrier: true,
      dutyMode: true,
      contentType: true,
      pickupIncluded: true,
      restrictionNote: true,
      originPincode: true,
      destCountryCode: true,
      destPostcode: true,
      weightKg: true,
      boxProfile: true,
      currency: true,
      isComparable: true,
      totalWithoutTax: true,
      taxAmount: true,
      totalWithTax: true,
      tatDays: true,
    },
  });

  // carrier sits next to product_name on purpose: the whole reason to open this
  // file in a spreadsheet is to pivot on it, and a column you have to hunt for
  // is a column people re-derive by hand.
  const header = [
    "captured_at",
    "vendor_id",
    "product_name",
    "carrier",
    "duty_mode",
    "content_type",
    "pickup_included",
    "restriction",
    "origin_pincode",
    "dest_country",
    "dest_postcode",
    "weight_kg",
    "box_profile",
    "currency",
    "comparable",
    "total_without_tax",
    "tax_amount",
    "total_with_tax",
    "tat_days",
  ];

  const lines = [header.join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.capturedAt.toISOString(),
        csvCell(row.vendorId),
        csvCell(row.productName),
        csvCell(row.carrier),
        row.dutyMode,
        row.contentType,
        // Three states, and the blank is meaningful: the label did not say.
        row.pickupIncluded === null ? "" : row.pickupIncluded ? "yes" : "no",
        csvCell(row.restrictionNote ?? ""),
        csvCell(row.originPincode),
        row.destCountryCode,
        csvCell(row.destPostcode),
        row.weightKg.toString(),
        csvCell(row.boxProfile),
        row.currency,
        row.isComparable ? "yes" : "no",
        row.totalWithoutTax.toString(),
        row.taxAmount.toString(),
        row.totalWithTax.toString(),
        String(row.tatDays),
      ].join(","),
    );
  }

  return lines.join("\n");
}

/**
 * Quotes a cell and neutralises formula injection.
 *
 * A vendor controls productName. A value starting with =, +, - or @ is executed
 * as a formula when the file is opened in Excel or Sheets, so a vendor could put
 * one in a product label and have it run on an Arena machine. Prefixing with an
 * apostrophe is the standard defence and costs nothing to read.
 */
function csvCell(value: string): string {
  const raw = value ?? "";
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}
