/**
 * SHIPGLOBAL ADAPTER
 * -----------------------------------------------------------------------------
 * Handles all ShipGlobal API communication and data transformation for the
 * International Rate Calculator.
 *
 * One endpoint is involved:
 *   POST /apiv1/rates/calculate   → every service ShipGlobal can quote, in one
 *                                   shot. No country-id lookup, no second call.
 *
 * This is the only file in the codebase that knows about ShipGlobal's API
 * contract. If ShipGlobal changes their API, only this file and its sibling
 * .types.ts change.
 *
 * THREE THINGS ABOUT THIS VENDOR THAT DRIVE THE CODE BELOW
 * -----------------------------------------------------------------------------
 * 1. NO DIMENSIONS IN THE REQUEST. ShipGlobal accepts a single
 *    `package_weight` and nothing else about the box, so it cannot compute
 *    volumetric weight itself. Per the rule the other single-weight adapters
 *    follow (skart, aramex), the shipment is collapsed here to ONE chargeable
 *    weight via lib/pricing/chargeableWeight (per-package max, then sum) and
 *    THAT is what gets sent. Sending raw actual weight would under-charge every
 *    volumetric-heavy box and could put the sell price below vendor cost.
 *
 * 2. PRICES ARE PRE-GST. `subtotal_fee` is the service total before tax;
 *    ShipGlobal bills GST on top. So the adapter derives the tax line itself at
 *    SHIPGLOBAL_GST_PERCENT (default 18) rather than passing a vendor tax field
 *    through, because there isn't one. Confirmed with the business owner.
 *
 * 3. `price` IS AN OPEN BAG. Their sample only ever contains `logistic_fee`,
 *    but the key set belongs to them. Every numeric entry becomes its own
 *    charge line, and whatever gap remains between those lines and
 *    `subtotal_fee` becomes a single "OTHER CHARGES" line — so the breakdown
 *    always sums to the pre-tax total no matter what keys they invent.
 */

import { BaseVendorAdapter } from "../../core/base.adapter";
import type {
  CanonicalChargeBreakdown,
  CanonicalRateRequest,
  RateQuote,
} from "../../core/types";
import {
  shipGlobalRateResponseSchema,
  type ShipGlobalRateRequest,
  type ShipGlobalRateResponse,
  type ShipGlobalService,
} from "./shipglobal.types";
import {
  computeShipmentWeights,
  normalizePackages,
} from "@/lib/pricing/chargeableWeight";

// --- CONFIG -------------------------------------------------------------------
// Credentials live in env vars; never hard-code them.

const SHIPGLOBAL_API_URL =
  process.env.SHIPGLOBAL_API_URL ??
  "https://app.shipglobal.in/apiv1/rates/calculate";

const SHIPGLOBAL_USERNAME = process.env.SHIPGLOBAL_USERNAME ?? "";
const SHIPGLOBAL_PASSWORD = process.env.SHIPGLOBAL_PASSWORD ?? "";

/**
 * GST applied on top of `subtotal_fee`. Env-overridable so a rate change is a
 * config edit, not a deploy. Falls back to 18 for any unusable value.
 */
const SHIPGLOBAL_GST_PERCENT = (() => {
  const raw = Number(process.env.SHIPGLOBAL_GST_PERCENT);
  return Number.isFinite(raw) && raw >= 0 ? raw : 18;
})();

/**
 * Every vendor is called in parallel and the service waits for ALL of them
 * (Promise.allSettled), so one hung upstream would hold the whole rate search
 * open. A bounded wait turns that into one clean vendorError next to three
 * good quotes.
 */
const SHIPGLOBAL_TIMEOUT_MS = (() => {
  const raw = Number(process.env.SHIPGLOBAL_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 20_000;
})();

export const SHIPGLOBAL_VENDOR_ID = "shipglobal";
export const SHIPGLOBAL_VENDOR_NAME = "ShipGlobal";

// --- ADAPTER ------------------------------------------------------------------

export class ShipGlobalAdapter extends BaseVendorAdapter<
  ShipGlobalRateRequest,
  ShipGlobalRateResponse
> {
  readonly vendorId = SHIPGLOBAL_VENDOR_ID;
  readonly vendorName = SHIPGLOBAL_VENDOR_NAME;

  // -- Step 1: Canonical → Vendor -------------------------------------------

  protected transformRequest(
    input: CanonicalRateRequest,
  ): ShipGlobalRateRequest {
    // Registered but unconfigured is the normal state until credentials land.
    // Failing here (before the network call) makes it one explicit, readable
    // vendorError rather than a 401 the reader has to interpret.
    if (!SHIPGLOBAL_USERNAME || !SHIPGLOBAL_PASSWORD) {
      throw new Error(
        "ShipGlobal credentials are not configured. Set SHIPGLOBAL_USERNAME and SHIPGLOBAL_PASSWORD.",
      );
    }

    const countryCode = input.destination.countryCode?.trim().toUpperCase();
    if (!countryCode || countryCode.length !== 2) {
      throw new Error(
        `ShipGlobal needs a 2-letter destination country code, received "${input.destination.countryCode ?? ""}".`,
      );
    }

    const packages = normalizePackages({
      packages: input.shipment.packages,
      weight: input.shipment.weight,
      quantity: input.shipment.quantity,
      dimensions: input.shipment.dimensions,
    });
    const weights = computeShipmentWeights(packages);

    return {
      // Normalised chargeable weight (kg) — the billable figure, not raw
      // actual. Three decimals keeps grams exact without sending float noise.
      package_weight: trimTrailingZeros(weights.totalChargeableKg.toFixed(3)),
      country_iso_code_2: countryCode,
      // Deliberately permissive: plenty of destinations have no postcode, and
      // the business decision is to let ShipGlobal reject the lane itself
      // rather than us pre-emptively dropping a quote we might have got.
      postcode: input.destination.pincode?.trim().toUpperCase() ?? "",
    };
  }

  // -- Step 2: HTTP call ----------------------------------------------------

  protected async callVendorApi(
    request: ShipGlobalRateRequest,
  ): Promise<ShipGlobalRateResponse> {
    let res: Response;

    try {
      res = await fetch(SHIPGLOBAL_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: basicAuthHeader(
            SHIPGLOBAL_USERNAME,
            SHIPGLOBAL_PASSWORD,
          ),
        },
        body: JSON.stringify(request),
        cache: "no-store",
        signal: AbortSignal.timeout(SHIPGLOBAL_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(
          `ShipGlobal did not respond within ${SHIPGLOBAL_TIMEOUT_MS}ms.`,
        );
      }
      throw err;
    }

    const rawBody = await res.text();

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `ShipGlobal rejected the credentials (${res.status}). Check SHIPGLOBAL_USERNAME / SHIPGLOBAL_PASSWORD.`,
      );
    }

    if (!res.ok) {
      throw new Error(
        `ShipGlobal API returned ${res.status} ${res.statusText}: ${truncate(rawBody)}`,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new Error(
        `Failed to parse ShipGlobal response: ${truncate(rawBody)}`,
      );
    }

    const parsed = shipGlobalRateResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `ShipGlobal response did not match the expected shape: ${formatZodIssues(parsed.error)}`,
      );
    }

    // `success: false` is their soft failure (unserviceable lane, bad
    // postcode). It arrives with HTTP 200, so it has to be checked explicitly.
    if (parsed.data.success === false) {
      throw new Error(
        `ShipGlobal API error: ${parsed.data.message || parsed.data.error || "Unknown error"}`,
      );
    }

    return parsed.data;
  }

  // -- Step 3: Vendor → Canonical -------------------------------------------

  protected transformResponse(response: ShipGlobalRateResponse): RateQuote[] {
    const currency = normaliseCurrency(response.currency);

    return (response.services ?? [])
      .map((service) =>
        mapShipGlobalServiceToQuote(service, {
          currency,
          gstPercent: SHIPGLOBAL_GST_PERCENT,
          vendorId: this.vendorId,
          vendorName: this.vendorName,
        }),
      )
      .filter((quote): quote is RateQuote => quote !== null);
  }
}

// --- PURE MAPPING -------------------------------------------------------------
// Exported as free functions rather than private methods so the pricing maths
// is unit-testable without constructing an adapter or touching the network.
// See utils/shipglobalRates.test.ts.

export interface ShipGlobalMapOptions {
  currency: string;
  gstPercent: number;
  vendorId: string;
  vendorName: string;
}

/**
 * One ShipGlobal service → one canonical RateQuote.
 *
 * Returns null for a service that cannot be priced (non-positive
 * `subtotal_fee`), which is how ShipGlobal signals an unavailable lane for that
 * product. A zero-rupee quote reaching the calculator would look like a bug to
 * a customer and would sort to the top of the cheapest-first list.
 */
export function mapShipGlobalServiceToQuote(
  service: ShipGlobalService,
  options: ShipGlobalMapOptions,
): RateQuote | null {
  const base = round2(service.subtotal_fee);
  if (!(base > 0)) return null;

  const { currency, gstPercent } = options;
  const gst = round2((base * gstPercent) / 100);

  const charges: CanonicalChargeBreakdown[] = buildChargeLines(
    service,
    base,
    currency,
  );

  if (gst > 0) {
    charges.push({
      name: "GST",
      amount: gst,
      currency,
      taxAmount: gst,
    });
  }

  return {
    vendorId: options.vendorId,
    vendorName: options.vendorName,
    productName: service.title.trim(),
    currency,
    totalWithTax: round2(base + gst),
    totalWithoutTax: base,
    tatDays: parseTransitDays(service.transit_time),
    charges,
    // ShipGlobal identifies a service by its title only — no stable id in the
    // rate response — so there is nothing honest to put here.
    courierId: null,
  };
}

/**
 * Turns the `price` bag into charge lines that ALWAYS sum to the pre-tax total.
 *
 * The invariant matters: markup, the quote PDF and the tax invoice all render
 * this breakdown next to the total, and a breakdown that does not add up reads
 * as a pricing error even when the total is right.
 *
 * Two escape hatches keep the invariant true against a vendor we do not
 * control: an empty/unreadable `price` collapses to a single FREIGHT line, and
 * so does a `price` whose entries OVERSHOOT `subtotal_fee` (which would mean
 * the fee bag includes something the subtotal does not, and we have no basis
 * for guessing which line to trim).
 */
function buildChargeLines(
  service: ShipGlobalService,
  base: number,
  currency: string,
): CanonicalChargeBreakdown[] {
  const lines: CanonicalChargeBreakdown[] = [];
  let itemisedTotal = 0;

  for (const [key, value] of Object.entries(service.price ?? {})) {
    const amount = coerceAmount(value);
    if (amount === null || amount <= 0) continue;

    lines.push({
      name: humaniseChargeKey(key),
      amount: round2(amount),
      currency,
    });
    itemisedTotal = round2(itemisedTotal + amount);
  }

  if (lines.length === 0 || itemisedTotal > base + 0.01) {
    return [{ name: "FREIGHT", amount: base, currency }];
  }

  const residual = round2(base - itemisedTotal);
  if (residual > 0.01) {
    lines.push({ name: "OTHER CHARGES", amount: residual, currency });
  }

  return lines;
}

/**
 * `transit_time` is free text: "7-10 Days", "4 - 7 Days", sometimes "".
 * The first integer is the fastest promised day, which matches how the
 * Shipmozo adapter reads `estimated_delivery` — the calculator sorts and
 * compares TAT across vendors, so the two must mean the same thing.
 * 0 means unknown, per the canonical contract.
 */
export function parseTransitDays(transitTime?: string | null): number {
  if (!transitTime) return 0;
  const match = transitTime.match(/\d+/);
  if (!match) return 0;
  const days = Number.parseInt(match[0], 10);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

/** "logistic_fee" → "LOGISTIC FEE". Matches the SCREAMING style of the other adapters. */
function humaniseChargeKey(key: string): string {
  const cleaned = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.toUpperCase() : "OTHER CHARGES";
}

/** Reads a `price` entry that zod deliberately left as unknown. */
function coerceAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim().replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * ShipGlobal quotes in INR from an Indian account. The field is optional in
 * their response, so a missing or junk value falls back to INR rather than
 * producing a quote with a blank currency.
 */
function normaliseCurrency(currency?: string | null): string {
  const code = currency?.trim().toUpperCase();
  return code && /^[A-Z]{3}$/.test(code) ? code : "INR";
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** "1.500" → "1.5", "20.000" → "20". Their sample sends the short form. */
function trimTrailingZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

/** Vendor error bodies can be a whole HTML page; keep logs readable. */
function truncate(body: string, max = 500): string {
  return body.length > max ? `${body.slice(0, max)}…` : body;
}

function formatZodIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}
