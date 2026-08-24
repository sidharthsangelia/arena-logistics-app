/**
 * lib/rateSweep/excel/data.ts
 *
 * Turns a QuotationSpec into the rows a workbook needs: one price per
 * (carrier, country, weight), already marked up, already masked, ready to place
 * in a cell.
 *
 * ── EVERY PRICING DECISION LIVES HERE ───────────────────────────────────────
 * The workbook builder does layout and nothing else. It never applies markup,
 * never picks a winner, never decides whether a vendor name may be shown. Those
 * are the decisions that can lose money or leak our cost book, and they are
 * kept in one file where they can be read together and tested without opening a
 * spreadsheet.
 *
 * ── WHAT IS EXCLUDED FROM A QUOTATION, AND WHY ──────────────────────────────
 *   non-INR rows        nothing here invents an exchange rate
 *   duty-unpaid rows    they undercut duty-paid rates and leave the customer a
 *                       customs bill at the door (opt-in via the spec)
 *   restricted rows     "Gifts only" and "B2B only" cannot be sold for a
 *                       general consignment (opt-in via the spec)
 *
 * Each exclusion is counted and reported back, because a quietly thinner sheet
 * is worse than a thinner sheet somebody was told about.
 *
 * ── TRANSIT TIME IS NOT CARRIED AT ALL ──────────────────────────────────────
 * A rate card states prices and nothing about how long a shipment takes. The
 * carrier's tatDays is deliberately not selected here and is not on
 * PricedOption, so the workbook builder has no number it could print even by
 * accident. Transit is answered on a call, against the specific lane and
 * booking date, and is never written into a document a customer can hold us to.
 * Do not add it back.
 */

import "server-only";

import { Prisma, RateDutyMode } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { applyMarkup } from "@/lib/pricing/markup";
import { brandServiceName } from "@/lib/branding/serviceName";
import type { RateQuote } from "@/lib/rate-adapters/core/types";

import { carrierLabel, isOwnBrandNetwork } from "../carrier";
import { MAX_QUOTABLE_AGE_DAYS, SWEEP_COUNTRIES } from "../config";
import type { QuotationSpec } from "./spec";

/** One priced option: a carrier, on a lane, at a weight. */
export interface PricedOption {
  carrier: string;
  carrierName: string;
  countryCode: string;
  weightKg: number;
  /** Already masked for the audience. Never the raw vendor label on a customer file. */
  serviceName: string;
  /** Null on a customer file. The sourcing vendor is not the customer's business. */
  vendorId: string | null;
  /** Already marked up for the audience. */
  price: number;
  dutyPaid: boolean;
  pickupIncluded: boolean | null;
}

export interface QuotationData {
  runId: string;
  capturedAt: Date;
  /** True when the underlying sweep is older than we would quote from. */
  stale: boolean;
  ageDays: number;

  countries: { code: string; name: string; city: string; syntheticPostcode: boolean }[];
  weights: number[];
  /** Carrier codes present in the data, in the order sheets should appear. */
  carriers: string[];

  /** Best option per carrier per lane per weight. Keyed `CARRIER|CC|KG`. */
  best: Map<string, PricedOption>;
  /** Best option overall per lane per weight, any carrier. Keyed `CC|KG`. */
  cheapest: Map<string, PricedOption>;

  excluded: {
    nonInr: number;
    dutyUnpaid: number;
    restricted: number;
  };
}

export function optionKey(carrier: string, countryCode: string, weightKg: number): string {
  return `${carrier}|${countryCode}|${weightKg}`;
}

export function laneKey(countryCode: string, weightKg: number): string {
  return `${countryCode}|${weightKg}`;
}

/**
 * Carrier sheet order: the four names a customer recognises first, then
 * everything else alphabetically, then own-brand networks last.
 *
 * Not cosmetic. A customer opening the file scans the tab bar for the carrier
 * they already ship with, and finding it third rather than ninth is the
 * difference between a document that feels made for them and one they have to
 * search.
 */
const CARRIER_SHEET_ORDER = ["DHL", "FEDEX", "UPS", "ARAMEX"];

/**
 * The single carrier code every reseller own-brand network collapses into on a
 * customer file.
 *
 * ShipGlobal's network and Shipmozo's network are two different vendors, which
 * matters enormously to us and not at all to the customer: both are sold as
 * Arena's own economy service, and carrierBranding.md says the vendor behind
 * them is never named. Keeping them as two rows would put "which of Arena's two
 * economy services is this" in front of a customer who has no way to answer it,
 * and would name the vendors in a tab title, undoing the masking in the most
 * visible place in the workbook.
 *
 * So they become one sheet holding the better of the two per lane. Internal
 * files keep them separate, because there the difference is the whole point.
 */
export const CUSTOMER_OWN_BRAND_CARRIER = "ARENA_OWN";
export const CUSTOMER_OWN_BRAND_LABEL = "Arena Economy";

function carrierRank(code: string): number {
  const known = CARRIER_SHEET_ORDER.indexOf(code);
  if (known >= 0) return known;
  // Own-brand networks last: they are our consolidated products, and a customer
  // comparing carriers wants the carriers first.
  return isOwnBrandNetwork(code) || code === CUSTOMER_OWN_BRAND_CARRIER ? 900 : 100;
}

export async function loadQuotationData(spec: QuotationSpec): Promise<QuotationData> {
  const run = spec.runId
    ? await prisma.rateSweepRun.findUnique({
        where: { id: spec.runId },
        select: { id: true, startedAt: true },
      })
    : await prisma.rateSweepRun.findFirst({
        where: {
          status: { in: ["COMPLETED", "PARTIAL"] },
          snapshotCount: { gt: 0 },
        },
        orderBy: { startedAt: "desc" },
        select: { id: true, startedAt: true },
      });

  if (!run) {
    throw new Error("No completed rate sweep to build a quotation from.");
  }

  const rows = await prisma.vendorRateSnapshot.findMany({
    where: {
      runId: run.id,
      destCountryCode: { in: spec.countryCodes },
      weightKg: { in: spec.weightsKg.map((w) => new Prisma.Decimal(w)) },
    },
    // Cheapest first, so the first row seen for a key is the winner and no
    // second pass is needed anywhere below.
    orderBy: { totalWithTax: "asc" },
    select: {
      carrier: true,
      vendorId: true,
      productName: true,
      destCountryCode: true,
      weightKg: true,
      currency: true,
      isComparable: true,
      totalWithTax: true,
      totalWithoutTax: true,
      dutyMode: true,
      contentType: true,
      pickupIncluded: true,
      restrictionNote: true,
    },
  });

  const excluded = { nonInr: 0, dutyUnpaid: 0, restricted: 0 };

  const best = new Map<string, PricedOption>();
  const cheapest = new Map<string, PricedOption>();
  const carriersSeen = new Set<string>();

  for (const row of rows) {
    if (!row.isComparable) {
      excluded.nonInr += 1;
      continue;
    }
    if (!spec.includeDutyUnpaid && row.dutyMode === RateDutyMode.DUTY_UNPAID) {
      excluded.dutyUnpaid += 1;
      continue;
    }
    if (!spec.includeRestricted && row.restrictionNote) {
      excluded.restricted += 1;
      continue;
    }

    const weightKg = Number(row.weightKg);
    const isCustomer = spec.audience === "CUSTOMER";

    const price = isCustomer
      ? priceForCustomer(row.totalWithTax, row.totalWithoutTax, spec.markupPercent)
      : Number(row.totalWithTax);

    // Both reseller networks become one Arena service on a customer file. Done
    // here rather than at render time so the "best per carrier" map already
    // holds the better of the two and the sheet builder never sees the split.
    const collapse = isCustomer && isOwnBrandNetwork(row.carrier);
    const carrier = collapse ? CUSTOMER_OWN_BRAND_CARRIER : row.carrier;

    const option: PricedOption = {
      carrier,
      carrierName: collapse ? CUSTOMER_OWN_BRAND_LABEL : carrierLabel(row.carrier),
      countryCode: row.destCountryCode,
      weightKg,
      // On a customer file the sourcing vendor's own-brand services read as
      // Arena, per carrierBranding.md. Big-4 carrier names pass through
      // untouched, which is what makes the per-carrier sheets meaningful.
      serviceName: isCustomer ? brandServiceName(row.productName) : row.productName,
      vendorId: isCustomer ? null : row.vendorId,
      price,
      dutyPaid: row.dutyMode === RateDutyMode.DUTY_PAID,
      pickupIncluded: row.pickupIncluded,
    };

    carriersSeen.add(carrier);

    const byCarrier = optionKey(carrier, row.destCountryCode, weightKg);
    if (!best.has(byCarrier)) best.set(byCarrier, option);

    const byLane = laneKey(row.destCountryCode, weightKg);
    if (!cheapest.has(byLane)) cheapest.set(byLane, option);
  }

  // Honour an explicit carrier choice, but only for carriers that produced
  // something: a sheet of empty cells looks like a broken file, not like a
  // carrier that does not fly the lane.
  //
  // With no explicit choice, thin carriers are dropped. USPS and Australia Post
  // reach exactly one of the selected countries each, and a tab whose grid is
  // one populated column beside four columns of dashes reads as a broken
  // document rather than as an honest statement of coverage. Nothing is lost by
  // dropping them: the Summary sheet always shows the cheapest option per lane
  // whatever carrier it belongs to, so a genuinely good single-country rate
  // still appears where a reader would look for it.
  const requested = spec.carriers.length > 0
    ? spec.carriers.filter((code) => carriersSeen.has(code))
    : [...carriersSeen].filter(
        (code) => countryCoverage(code, best, spec) >= minimumCoverage(spec),
      );

  const carriers = requested.sort((a, b) => {
    const rank = carrierRank(a) - carrierRank(b);
    return rank !== 0 ? rank : carrierLabel(a).localeCompare(carrierLabel(b));
  });

  const ageDays = Math.floor((Date.now() - run.startedAt.getTime()) / 86_400_000);

  const countries = spec.countryCodes
    .map((code) => SWEEP_COUNTRIES.find((c) => c.code === code))
    .filter((c): c is (typeof SWEEP_COUNTRIES)[number] => Boolean(c))
    .map((c) => ({
      code: c.code,
      name: c.name,
      city: c.city,
      syntheticPostcode: c.syntheticPostcode === true,
    }));

  return {
    runId: run.id,
    capturedAt: run.startedAt,
    stale: ageDays > MAX_QUOTABLE_AGE_DAYS,
    ageDays,
    countries,
    weights: [...spec.weightsKg].sort((a, b) => a - b),
    carriers,
    best,
    cheapest,
    excluded,
  };
}

/**
 * How many of the selected countries this carrier reaches at any weight.
 *
 * Counted from the priced options rather than from the raw rows, so a carrier
 * whose only rates were filtered out (duty-unpaid, restricted) counts as
 * unreachable, which is what it is for this workbook.
 */
function countryCoverage(
  carrier: string,
  best: Map<string, PricedOption>,
  spec: QuotationSpec,
): number {
  let reached = 0;

  for (const country of spec.countryCodes) {
    const any = spec.weightsKg.some((weight) =>
      best.has(optionKey(carrier, country, weight)),
    );
    if (any) reached += 1;
  }

  return reached;
}

/**
 * Half the selected countries, and always at least two.
 *
 * The floor matters at small selections: quoting two countries should not let a
 * carrier through on the strength of one, because that is the same lopsided
 * sheet the rule exists to prevent.
 */
function minimumCoverage(spec: QuotationSpec): number {
  return Math.max(2, Math.ceil(spec.countryCodes.length / 2));
}

/**
 * Customer price for one stored rate.
 *
 * Routed through lib/pricing/markup.ts rather than multiplying here, so a rate
 * card and the live calculator cannot show a customer two different prices for
 * the same lane. That module works on a RateQuote, so the stored row is shaped
 * into the minimum one it needs; it only reads the totals and the charge lines,
 * and an empty charge array is a case it already handles.
 *
 * Rounded up to the whole rupee. A quotation with paise on it looks
 * machine-generated, and rounding UP means the printed number is never below
 * what the maths gives.
 */
function priceForCustomer(
  totalWithTax: Prisma.Decimal,
  totalWithoutTax: Prisma.Decimal,
  markupPercent: number,
): number {
  const quote = {
    vendorId: "",
    vendorName: "",
    productName: "",
    courierId: null,
    currency: "INR",
    totalWithTax: Number(totalWithTax),
    totalWithoutTax: Number(totalWithoutTax),
    tatDays: 0,
    charges: [],
  } as unknown as RateQuote;

  return Math.ceil(applyMarkup(quote, markupPercent).totalWithTax);
}
