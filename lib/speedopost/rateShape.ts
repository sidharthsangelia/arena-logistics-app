/**
 * lib/speedopost/rateShape.ts
 * -----------------------------------------------------------------------------
 * The two translations at the heart of SpeedoPost rating, as pure functions:
 * a canonical rate request becomes their payloads, and their priced providers
 * become canonical quotes.
 *
 * Kept out of the adapter and free of any `server-only` import so it can be
 * unit tested directly. The adapter is then only what it should be: request in,
 * HTTP out, response in, quotes out.
 *
 * ── THE TWO THINGS MOST WORTH GETTING RIGHT HERE ────────────────────────────
 *
 *   1. THE TAX SPLIT. SpeedoPost returns two different response shapes for the
 *      same endpoint, and only one of them carries GST. When there is genuinely
 *      no tax information we report none, rather than de-grossing at an assumed
 *      18% — the split lands on a customer's tax invoice, and an invented
 *      figure there is a number nobody can reconcile against the carrier.
 *
 *   2. THE BREAKDOWN ADDING UP. Their surcharge list is long, open-ended, and
 *      only partly documented. Itemising the fields we know and stopping there
 *      would print a breakdown that silently falls short of the price charged.
 *      Anything unaccounted for becomes one honest "Other charges" line.
 */

import type {
  CanonicalChargeBreakdown,
  CanonicalRateRequest,
  RateQuote,
} from "@/lib/rate-adapters/core/types";
import {
  computeShipmentWeights,
  normalizePackages,
} from "@/lib/pricing/chargeableWeight";
import { speedoPostServiceName } from "./courierCatalogue";
import type {
  SpeedoPostOrderType,
  SpeedoPostRateDimension,
  SpeedoPostRateOption,
  SpeedoPostRatePayload,
} from "./types";

// --- CONFIG -------------------------------------------------------------------

/**
 * WHICH SPEEDOPOST NETWORKS WE PRICE.
 *
 * B2C is the parcel couriers, B2B the freight operators — different providers
 * at different prices, and `orderType` is required on every rate call, so each
 * network needs its own call.
 *
 * B2C IS OFF as of 2026-09-05. Our account's B2C rate card answers
 * "Base Rate not found." on every lane and weight tried (Mumbai → Delhi at
 * 0.5kg and 2kg, Bengaluru → Chennai at 1kg, Delhi → Kolkata at 5kg), while B2B
 * prices all of them. It priced in August, so this is a change on SpeedoPost's
 * side, not ours. Calling it anyway bought nothing and cost a round trip plus a
 * warning line on every single domestic search.
 *
 * Put "B2C" back the moment SpeedoPost restores the card — everything
 * downstream (the payload builder, the segment mapper, the " Freight" suffix,
 * the cross-segment de-duplication) still handles both and is still tested for
 * both, so this list is the only thing that has to change.
 */
export const SPEEDOPOST_SEGMENTS: SpeedoPostOrderType[] = ["B2B"];

/**
 * Charge fields in the extended breakdown, in the order a reader expects them,
 * with labels a customer can understand.
 *
 * `dphCharge` and `csdCharges` keep their vendor abbreviations: neither is
 * expanded anywhere in SpeedoPost's documentation, and a plausible-sounding
 * guess printed on an invoice line is worse than an unfamiliar acronym.
 */
const CHARGE_LABELS: { field: keyof SpeedoPostRateOption; label: string }[] = [
  { field: "freightCharge", label: "Freight" },
  { field: "fscCharge", label: "Fuel surcharge" },
  { field: "fuelCharge", label: "Fuel" },
  { field: "rovCharge", label: "Risk of value" },
  { field: "insuranceCharge", label: "Insurance" },
  { field: "codCharge", label: "COD collection" },
  { field: "odaCharge", label: "Out of delivery area" },
  { field: "firstMileCharge", label: "First mile" },
  { field: "waybillCharge", label: "Waybill" },
  { field: "handlingCharge", label: "Handling" },
  { field: "appointmentCharge", label: "Appointment delivery" },
  { field: "reAttemptCharge", label: "Re-attempt" },
  { field: "nonMetroCharge", label: "Non-metro" },
  { field: "greenCharge", label: "Green levy" },
  { field: "sundayDeliveryCharges", label: "Sunday delivery" },
  { field: "specialDeliveryCharges", label: "Special delivery" },
  { field: "adhocVehicleCharge", label: "Adhoc vehicle" },
  { field: "additionalMachineryCharges", label: "Additional machinery" },
  { field: "additionalManpowerCharges", label: "Additional manpower" },
  { field: "mathadiUnionCharges", label: "Mathadi union" },
  { field: "demurrageCharges", label: "Demurrage" },
  { field: "dphCharge", label: "DPH" },
  { field: "csdCharges", label: "CSD" },
  { field: "additionalCharge", label: "Additional" },
];

/** Below this, the itemised lines are treated as adding up to the sub-total. */
const CHARGE_RECONCILE_TOLERANCE = 0.5;

const CURRENCY = "INR";

// --- REQUEST ------------------------------------------------------------------

/**
 * One canonical request becomes one payload per segment.
 *
 * Throws on data SpeedoPost cannot price at all. That is deliberate: the base
 * adapter turns a throw into a clean vendor error, whereas sending a request we
 * know is incomplete spends a round trip to be told the same thing in worse
 * words.
 */
export function buildSpeedoPostRatePayloads(
  input: CanonicalRateRequest,
): { orderType: SpeedoPostOrderType; payload: SpeedoPostRatePayload }[] {
  const sourcePin = (input.origin.pincode ?? "").trim();
  const consigneePin = (input.destination.pincode ?? "").trim();

  if (!sourcePin || !consigneePin) {
    throw new Error("SpeedoPost requires both pickup and delivery pincodes.");
  }

  // SpeedoPost takes ONE total weight plus a per-box dimension array, so the
  // canonical packages are sent as-is for volume and summed for weight. The
  // ACTUAL weight goes on the wire, not our chargeable one: they return their
  // own `chargeWeight`, and rating on our figure would price a consignment
  // different from the one they will carry.
  const packages = normalizePackages({
    packages: input.shipment.packages,
    weight: input.shipment.weight,
    quantity: input.shipment.quantity,
    dimensions: input.shipment.dimensions,
  });
  const weights = computeShipmentWeights(packages);

  const dimensions: SpeedoPostRateDimension[] = packages.map((pkg) => ({
    // Rounded UP. A box declared smaller than it is gets re-measured at the hub
    // and the customer is surcharged weeks later.
    length: Math.max(1, Math.ceil(pkg.lengthCm)),
    width: Math.max(1, Math.ceil(pkg.widthCm)),
    height: Math.max(1, Math.ceil(pkg.heightCm)),
    count: Math.max(1, Math.trunc(pkg.quantity) || 1),
  }));

  if (dimensions.length === 0) {
    throw new Error("SpeedoPost requires at least one package dimension.");
  }

  // Cash on delivery is priced, never bolted on afterwards: the collection fee
  // differs per provider, so a COD shipment quoted prepaid shows the customer a
  // price they will not pay. Same rule as the Shipmozo domestic adapter.
  const isCod = input.shipment.paymentType === "COD";
  const codAmount = isCod
    ? Math.max(
        0,
        Math.round(input.shipment.codAmount ?? input.shipment.declaredValue ?? 0),
      )
    : 0;

  // Their weight field is KG, unlike Shipmozo's grams. Rounded to 3 places so a
  // floating-point tail never reaches the wire as 2.4000000000000004.
  const weight = Math.max(0.001, round(weights.totalActualKg, 3));

  return SPEEDOPOST_SEGMENTS.map((orderType) => ({
    orderType,
    payload: {
      orderType,
      sourcePin,
      consigneePin,
      weight,
      paymentMode: isCod ? "COD" : "PP",
      codAmount,
      dimensions,
    },
  }));
}

// --- RESPONSE -----------------------------------------------------------------

/**
 * One segment's priced providers become canonical quotes.
 *
 * Options with no usable total are dropped. A zero-rupee quote is not a free
 * shipment, it is a provider that failed to price the lane.
 *
 * De-duplication happens afterwards, on the DISPLAYED NAME, in
 * `dedupeSpeedoPostQuotes`. See the note there for why the provider code is the
 * wrong key.
 */
export function mapSpeedoPostSegment(
  options: SpeedoPostRateOption[],
  orderType: SpeedoPostOrderType,
  vendor: { vendorId: string; vendorName: string },
): RateQuote[] {
  return (options ?? [])
    .filter((option) => toNumber(option.totalCharge) > 0)
    .map((option) => mapSpeedoPostOption(option, orderType, vendor));
}

/**
 * Collapse quotes a customer cannot tell apart.
 *
 * ── WHY THE KEY IS THE NAME AND NOT THE PROVIDER CODE ───────────────────────
 * Live traffic returns FOUR Blue Dart entries on one lane, under four distinct
 * provider codes and two repeated names, all at exactly the same price:
 *
 *     69477 Bluedart_PNK   567.73      69479 Bluedart_PNK   567.73
 *     69478 Bluedart_DEL   567.73      69480 Bluedart_DEL   567.73
 *
 * The suffixes are origin-hub codes, which the catalogue strips, so all four
 * display as one name. De-duplicating on the provider code would leave four
 * identical cards on the results list, and worse: `quoteKey` in the pickers is
 * `vendorId-productName-totalWithTax`, so identical name AND price means
 * identical key. Two quotes sharing a key break React's list identity and make
 * selecting one appear to select the other.
 *
 * Keeping the cheapest is also the honest answer to the customer. They cannot
 * distinguish these options, so showing the dearest one helps nobody.
 *
 * ── WHY TIES BREAK ON THE PROVIDER CODE ─────────────────────────────────────
 * `lib/booking/domesticCourierResolve.ts` recovers a courier id by re-quoting
 * the lane and matching on the stored product name. If two options tie on price
 * and we simply kept whichever arrived first, a reshuffled response would hand
 * back a DIFFERENT provider code for the same displayed service. Breaking ties
 * on the lowest code makes the choice independent of their ordering.
 */
export function dedupeSpeedoPostQuotes(quotes: RateQuote[]): RateQuote[] {
  const best = new Map<string, RateQuote>();

  for (const quote of quotes) {
    const key = quote.productName.trim().toLowerCase();
    const existing = best.get(key);
    if (!existing || isBetterQuote(quote, existing)) best.set(key, quote);
  }

  return Array.from(best.values());
}

/** Cheaper wins; on a tie, the lower provider code wins. */
function isBetterQuote(candidate: RateQuote, incumbent: RateQuote): boolean {
  if (candidate.totalWithTax !== incumbent.totalWithTax) {
    return candidate.totalWithTax < incumbent.totalWithTax;
  }
  return compareCourierIds(candidate.courierId, incumbent.courierId) < 0;
}

/**
 * Order two provider codes.
 *
 * Numerically when both are numbers, which they are in every response seen so
 * far. A plain string comparison would call "32220237" lower than "3765884",
 * because it stops at the second character. That is still deterministic, which
 * is what the tie-break actually needs, but it makes "the lowest code wins"
 * false and the choice impossible to predict by reading the response.
 */
function compareCourierIds(a: string | null | undefined, b: string | null | undefined): number {
  const left = (a ?? "").trim();
  const right = (b ?? "").trim();

  const leftNum = Number(left);
  const rightNum = Number(right);
  if (left && right && Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
    return leftNum - rightNum;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

/** One priced provider → one canonical quote. */
export function mapSpeedoPostOption(
  option: SpeedoPostRateOption,
  orderType: SpeedoPostOrderType,
  vendor: { vendorId: string; vendorName: string },
): RateQuote {
  const totalWithTax = round(toNumber(option.totalCharge), 2);
  const gst = resolveGst(option, totalWithTax);
  const subTotal =
    option.subTotalCharge !== undefined
      ? round(toNumber(option.subTotalCharge), 2)
      : round(Math.max(0, totalWithTax - gst), 2);

  return {
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    productName: speedoPostServiceName(option.serviceProviderName, orderType),
    currency: CURRENCY,
    totalWithTax,
    totalWithoutTax: subTotal,
    // SpeedoPost publishes no transit time on either response shape. 0 is the
    // canonical "unknown", which the pickers render as "transit time on
    // confirmation" and sort last under "fastest first".
    tatDays: 0,
    charges: buildCharges(option, subTotal, gst),
    // The provider code is what a CreateOrder call will need to book this exact
    // service. The segment is recoverable from it via the ServiceProvider
    // catalogue, which groups codes by B2C and B2B.
    courierId:
      option.serviceProviderCode != null
        ? String(option.serviceProviderCode).trim() || null
        : null,
  };
}

/**
 * The tax inside `totalCharge`, in descending order of trust:
 *
 *   1. `gstAmount` is given. Use it.
 *   2. Only `gstPercent` is given. Derive it — from the sub-total when there is
 *      one, otherwise by de-grossing the total.
 *   3. Neither. Return 0, so the quote reports no tax split at all. That is the
 *      honest answer; see the note at the top of this file.
 */
export function resolveGst(
  option: SpeedoPostRateOption,
  totalWithTax: number,
): number {
  if (option.gstAmount !== undefined) {
    return round(Math.max(0, toNumber(option.gstAmount)), 2);
  }

  const percent = toNumber(option.gstPercent);
  if (!(percent > 0)) return 0;

  if (option.subTotalCharge !== undefined) {
    return round(toNumber(option.subTotalCharge) * (percent / 100), 2);
  }
  return round(totalWithTax * (percent / (100 + percent)), 2);
}

/** The breakdown behind the price. See the reconciliation note at the top. */
export function buildCharges(
  option: SpeedoPostRateOption,
  subTotal: number,
  gst: number,
): CanonicalChargeBreakdown[] {
  const charges: CanonicalChargeBreakdown[] = [];

  for (const { field, label } of CHARGE_LABELS) {
    const amount = round(toNumber(option[field]), 2);
    if (amount > 0) charges.push({ name: label, amount, currency: CURRENCY });
  }

  if (charges.length === 0) {
    // The minimal response shape: one total and nothing else. A single freight
    // line is the whole truth we have about it.
    if (subTotal > 0) {
      charges.push({ name: "Freight", amount: subTotal, currency: CURRENCY });
    }
  } else {
    const itemised = charges.reduce((sum, c) => sum + c.amount, 0);
    const unaccounted = round(subTotal - itemised, 2);
    if (unaccounted > CHARGE_RECONCILE_TOLERANCE) {
      charges.push({
        name: "Other charges",
        amount: unaccounted,
        currency: CURRENCY,
      });
    }
  }

  if (gst > 0) {
    charges.push({ name: "GST", amount: gst, currency: CURRENCY, taxAmount: gst });
  }

  return charges;
}

// --- HELPERS ------------------------------------------------------------------

/** Tolerant number reading — SpeedoPost types the same field both ways. */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function round(n: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}
