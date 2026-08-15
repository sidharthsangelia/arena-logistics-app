/**
 * lib/rateSweep/execute.ts
 *
 * One cell of the matrix: ask the vendor, classify what came back, write it
 * down. Called once per weight slab by the lane function, thousands of times a
 * night, unattended.
 *
 * ── THE RULE THIS FILE OBEYS ────────────────────────────────────────────────
 * A cell that produced no quote is still written. Always.
 *
 * The tempting version of this code skips the row when there is nothing to
 * store, and it produces a table where absence is ambiguous: "sKart has no row
 * for 40kg to Brazil" could mean sKart does not fly it, or that sKart was down,
 * or that the sweep never got that far. Those need three different responses and
 * the data cannot tell them apart. So every attempt lands as a row with a status
 * on it, and absence means one thing only: never attempted.
 *
 * ── WHAT RETRIES, AND WHAT DOES NOT ─────────────────────────────────────────
 * The adapters classify their own failures (lib/rate-adapters/core/errors.ts).
 * This module acts on that classification:
 *
 *   NO_SERVICE     write it, move on. Retrying cannot change a lane that does
 *                  not exist, and a sweep that retried every unserved lane
 *                  three times would triple its own cost for nothing.
 *   AUTH_ERROR     write it, and tell the caller to stop this vendor for the
 *                  whole run. Continuing means six hundred more failures and,
 *                  on some vendors, a lockout.
 *   RATE_LIMITED   write it, and tell the caller to slow down.
 *   everything else  throw, so Inngest's durable retry has a go.
 *
 * That last line is why this function throws at all rather than returning a
 * status for every case: a transient 5xx should be retried by the platform that
 * is good at retrying, with its own backoff, rather than by a loop written here.
 */

import "server-only";

import * as Sentry from "@sentry/nextjs";

import {
  Prisma,
  RateContentType,
  RateDutyMode,
  RateSweepCallStatus,
  ShipmentMode,
} from "@/generated/prisma";
import { prisma } from "@/utils/db";
import type { BaseVendorAdapter } from "@/lib/rate-adapters/core/base.adapter";
import type { RateQuote, VendorError } from "@/lib/rate-adapters/core/types";
import type { RateErrorKind } from "@/lib/rate-adapters/core/errors";
import { makeChargeDescriber } from "@/lib/invoices/tax/chargeNames";

import { classifyService } from "./carrier";
import { isTerminalKind, statusForErrorKind } from "./classify";
import { buildSweepRequest, describeCell, type SweepCell } from "./request";

/**
 * Charge labels are canonicalised WITHOUT a route.
 *
 * makeChargeDescriber appends "Delhi to Dubai" to freight lines when given
 * cities, which is right on an invoice and wrong here: it would give every lane
 * its own spelling of "freight" and make the one query this table exists for,
 * grouping a surcharge across countries over time, return twenty groups instead
 * of one. Built once at module scope since it has no per-call state.
 */
const describeCharge = makeChargeDescriber({ mode: ShipmentMode.INTERNATIONAL });

/** What the lane function needs to know to decide how to carry on. */
export interface SweepCellOutcome {
  status: RateSweepCallStatus;
  quoteCount: number;
  /** Set on RATE_LIMITED when the vendor named a wait. */
  retryAfterSeconds?: number;
  /** True when this vendor should be abandoned for the rest of the run. */
  stopVendor: boolean;
}

export interface ExecuteSweepCellInput {
  runId: string;
  adapter: Pick<BaseVendorAdapter<unknown, unknown>, "vendorId" | "vendorName" | "fetchRates">;
  cell: SweepCell;
  /** Inngest's attempt counter, recorded so a flaky lane is visible in the data. */
  attempt?: number;
}

/**
 * Ask one vendor for one cell and persist the result.
 *
 * Throws on a retriable vendor failure, having first written the failure row.
 * The row is written before the throw on purpose: if the retries are exhausted
 * the row is the only evidence left of what happened, and a row that only
 * appears on success is a row that is missing exactly when it matters.
 */
export async function executeSweepCell(
  input: ExecuteSweepCellInput,
): Promise<SweepCellOutcome> {
  const { runId, adapter, cell, attempt = 1 } = input;

  const descriptor = describeCell(cell);
  const request = buildSweepRequest(cell);

  const startedAt = Date.now();
  const result = await adapter.fetchRates(request);
  const latencyMs = Date.now() - startedAt;

  const error = result.error;
  const quotes = result.quotes ?? [];

  // A vendor can answer 200 with an empty product list. That is a soft "no
  // service" in everything but name, and recording it as OK-with-zero-quotes
  // would make "did this lane produce anything" a two-column question.
  if (!error && quotes.length === 0) {
    await persistCall({
      runId,
      adapter,
      descriptor,
      status: RateSweepCallStatus.NO_SERVICE,
      latencyMs,
      attempt,
      errorKind: "NO_SERVICE",
      errorMessage: "Vendor returned no products for this lane and weight.",
      quotes: [],
      rawResponse: null,
    });

    return { status: RateSweepCallStatus.NO_SERVICE, quoteCount: 0, stopVendor: false };
  }

  if (error) {
    const status = statusForErrorKind(error.kind);

    await persistCall({
      runId,
      adapter,
      descriptor,
      status,
      latencyMs,
      attempt,
      errorKind: error.kind ?? "UNKNOWN",
      errorMessage: truncate(error.message, 1000),
      httpStatus: error.status ?? null,
      quotes: [],
      rawResponse: null,
    });

    // Retriable failures become exceptions so Inngest's durable retry owns the
    // backoff. The row above is already committed, so a retry that eventually
    // succeeds overwrites it through the unique key and a retry that never
    // succeeds leaves the last failure on record.
    if (error.retriable !== false && !isTerminalKind(error.kind)) {
      throw new SweepCellRetriableError(
        `${adapter.vendorId} ${cell.country.code} ${cell.weightKg}kg: ${error.message}`,
        { kind: error.kind ?? "UNKNOWN", retryAfterSeconds: error.retryAfterSeconds },
      );
    }

    return {
      status,
      quoteCount: 0,
      retryAfterSeconds: error.retryAfterSeconds,
      stopVendor: status === RateSweepCallStatus.AUTH_ERROR,
    };
  }

  await persistCall({
    runId,
    adapter,
    descriptor,
    status: RateSweepCallStatus.OK,
    latencyMs,
    attempt,
    quotes,
    rawResponse: null,
  });

  return { status: RateSweepCallStatus.OK, quoteCount: quotes.length, stopVendor: false };
}

/**
 * A vendor failure worth retrying. Named so the lane function can tell it from a
 * bug in our own code, which must not be swallowed as "the vendor was flaky".
 */
export class SweepCellRetriableError extends Error {
  readonly kind: RateErrorKind;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    opts: { kind: RateErrorKind; retryAfterSeconds?: number },
  ) {
    super(message);
    this.name = "SweepCellRetriableError";
    this.kind = opts.kind;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

/** Written when a vendor has been stopped and its remaining cells are skipped. */
export async function recordSkippedCell(params: {
  runId: string;
  vendorId: string;
  vendorName: string;
  cell: SweepCell;
  reason: string;
}): Promise<void> {
  await persistCall({
    runId: params.runId,
    adapter: { vendorId: params.vendorId, vendorName: params.vendorName },
    descriptor: describeCell(params.cell),
    status: RateSweepCallStatus.SKIPPED,
    attempt: 0,
    errorKind: "SKIPPED",
    errorMessage: truncate(params.reason, 1000),
    quotes: [],
    rawResponse: null,
  });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface PersistCallInput {
  runId: string;
  adapter: { vendorId: string; vendorName: string };
  descriptor: ReturnType<typeof describeCell>;
  status: RateSweepCallStatus;
  latencyMs?: number;
  attempt: number;
  errorKind?: string;
  errorMessage?: string;
  httpStatus?: number | null;
  quotes: RateQuote[];
  rawResponse: Prisma.InputJsonValue | null;
}

/**
 * Write the call and, when there were quotes, its snapshots and their charges.
 *
 * ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
 * Keyed on the call's natural identity, so a step that made its HTTP call and
 * then died before committing produces one row on the retry, not two. Duplicate
 * rows here would not be a cosmetic problem: every aggregate in the admin
 * screens and every average in the analysis would double-count them.
 *
 * The child rows are deleted and rewritten rather than upserted individually.
 * A retry can legitimately return a different set of products than the first
 * attempt did, and reconciling two sets by identity would need a natural key on
 * a product that vendors do not reliably give one.
 *
 * All of it in one transaction: a call marked OK whose snapshots are missing is
 * worse than no row at all, because it counts as a success everywhere.
 */
async function persistCall(input: PersistCallInput): Promise<void> {
  const { runId, adapter, descriptor, quotes } = input;

  const callData = {
    vendorName: adapter.vendorName,
    originPincode: descriptor.originPincode,
    destCity: descriptor.destCity,
    syntheticPostcode: descriptor.syntheticPostcode,
    boxLengthCm: new Prisma.Decimal(descriptor.box.lengthCm),
    boxWidthCm: new Prisma.Decimal(descriptor.box.widthCm),
    boxHeightCm: new Prisma.Decimal(descriptor.box.heightCm),
    declaredValue: new Prisma.Decimal(descriptor.declaredValue),
    status: input.status,
    httpStatus: input.httpStatus ?? null,
    errorKind: input.errorKind ?? null,
    errorMessage: input.errorMessage ?? null,
    attempts: input.attempt,
    latencyMs: input.latencyMs ?? null,
    quoteCount: quotes.length,
    rawResponse: input.rawResponse ?? Prisma.DbNull,
  };

  await prisma.$transaction(async (tx) => {
    const call = await tx.rateSweepCall.upsert({
      where: {
        sweep_call_identity: {
          runId,
          vendorId: adapter.vendorId,
          destCountryCode: descriptor.destCountryCode,
          destPostcode: descriptor.destPostcode,
          weightKg: new Prisma.Decimal(descriptor.weightKg),
          boxProfile: descriptor.boxProfile,
          shipmentPurpose: descriptor.shipmentPurpose,
        },
      },
      create: {
        runId,
        vendorId: adapter.vendorId,
        destCountryCode: descriptor.destCountryCode,
        destPostcode: descriptor.destPostcode,
        weightKg: new Prisma.Decimal(descriptor.weightKg),
        boxProfile: descriptor.boxProfile,
        shipmentPurpose: descriptor.shipmentPurpose,
        ...callData,
      },
      update: callData,
      select: { id: true },
    });

    // Clears whatever a previous attempt wrote. Cascades to the charges.
    await tx.vendorRateSnapshot.deleteMany({ where: { callId: call.id } });

    for (const quote of quotes) {
      const totalWithTax = safeAmount(quote.totalWithTax);
      const totalWithoutTax = safeAmount(quote.totalWithoutTax);
      const currency = (quote.currency || "INR").toUpperCase();
      const productName = quote.productName || adapter.vendorName;

      // Normalised here, at write time, from the label the vendor just gave us.
      // Three vendors resell FedEx under three spellings, so without this the
      // question the sweep exists to answer — whose FedEx is cheapest on this
      // lane — cannot be expressed as a GROUP BY. See ./carrier.ts.
      const service = classifyService(productName);

      await tx.vendorRateSnapshot.create({
        data: {
          runId,
          callId: call.id,
          vendorId: adapter.vendorId,
          vendorName: adapter.vendorName,
          productName,
          courierId: quote.courierId ?? null,

          carrier: service.carrier,
          dutyMode: service.dutyMode as RateDutyMode,
          contentType: service.contentType as RateContentType,
          pickupIncluded: service.pickupIncluded,
          restrictionNote: service.restrictionNote,

          originPincode: descriptor.originPincode,
          destCountryCode: descriptor.destCountryCode,
          destPostcode: descriptor.destPostcode,
          weightKg: new Prisma.Decimal(descriptor.weightKg),
          boxProfile: descriptor.boxProfile,

          currency,
          // Only INR rows are safely comparable with each other. Aramex can
          // quote in something else, and a cheapest-of query that put 400 USD
          // against 4000 INR would be confidently wrong rather than merely
          // unhelpful. Nothing here invents an exchange rate.
          isComparable: currency === "INR",

          totalWithTax: new Prisma.Decimal(totalWithTax),
          totalWithoutTax: new Prisma.Decimal(totalWithoutTax),
          // Derived once at write time rather than as an expression in every
          // query. Clamped at zero because a vendor whose pre-tax total exceeds
          // its post-tax total has given us nonsense, and a negative tax column
          // would poison every SUM downstream.
          taxAmount: new Prisma.Decimal(
            Math.max(0, round2(totalWithTax - totalWithoutTax)),
          ),

          tatDays: Number.isFinite(quote.tatDays) ? Math.max(0, Math.trunc(quote.tatDays)) : 0,

          charges: {
            create: (quote.charges ?? []).map((charge, index) => ({
              name: truncate(charge.name ?? "", 200),
              canonicalName: describeCharge(charge.name ?? ""),
              amount: new Prisma.Decimal(safeAmount(charge.amount)),
              currency: (charge.currency || currency).toUpperCase(),
              igst: optionalDecimal(charge.igst),
              cgst: optionalDecimal(charge.cgst),
              sgst: optionalDecimal(charge.sgst),
              taxAmount: optionalDecimal(charge.taxAmount),
              sortOrder: index,
            })),
          },
        },
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Coercion
// ---------------------------------------------------------------------------

/**
 * Vendors have returned nulls, empty strings and NaN in amount fields. A NaN
 * reaching a Decimal column throws inside the transaction and loses the whole
 * call, including the rows that were fine, so every number is coerced here.
 */
function safeAmount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // Guards the Decimal(14,2) column. A vendor returning a number this large is
  // returning a bug, and it should not take the transaction down with it.
  if (Math.abs(n) > 999_999_999_99) return 0;
  return round2(n);
}

function optionalDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(round2(n));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function truncate(value: string, max: number): string {
  const clean = (value ?? "").trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

/**
 * Reports a vendor error to Sentry with enough context to act on, without the
 * raw error object: `VendorError.raw` holds the original thrown value, and for
 * sKart that can be an error carrying the request body, which carries their
 * username and password.
 */
export function reportVendorError(
  error: VendorError,
  context: { runId: string; countryCode: string; weightKg: number },
): void {
  Sentry.captureMessage(`Rate sweep: ${error.vendorId} ${error.kind ?? "UNKNOWN"}`, {
    level: error.kind === "AUTH_ERROR" ? "error" : "warning",
    tags: {
      location: "rateSweep",
      vendorId: error.vendorId,
      errorKind: error.kind ?? "UNKNOWN",
    },
    extra: {
      runId: context.runId,
      countryCode: context.countryCode,
      weightKg: context.weightKg,
      message: error.message,
      status: error.status,
    },
  });
}
