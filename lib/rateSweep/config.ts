/**
 * lib/rateSweep/config.ts
 *
 * THE DEFINITION OF THE MATRIX.
 *
 * Everything the scheduled sweep asks the vendors is decided here: which
 * countries, at which postcode, at which weights, in which box, from where.
 * Nothing else in the sweep contains a country, a weight or a dimension.
 *
 * ── WHY THIS IS A FILE AND NOT A TABLE ──────────────────────────────────────
 * An admin screen for editing the matrix would be friendlier and would be the
 * wrong call. A canonical postcode is not a preference, it is the definition of
 * what every cached number MEANS: change London's postcode from SW1A to a
 * Highlands one and every GB row silently starts describing a different
 * question, with nothing in the data to say so. That belongs in a commit
 * somebody reviewed, next to the reasoning, not in a text input.
 *
 * ── WHEN YOU CHANGE ANYTHING HERE ───────────────────────────────────────────
 * Bump SWEEP_CONFIG_VERSION if the change makes new rows incomparable with old
 * ones: a slab value moved, a postcode changed, the box formula changed, the
 * declared value or purpose changed. Do NOT bump it for a comment, or for
 * adding a country (existing lanes stay exactly as comparable as they were).
 *
 * Every run stores both the version and a full copy of the config it used, so
 * a trend query can refuse to cross a version boundary and an old row can still
 * be read years after this file has moved on.
 */

import { INTERNATIONAL_VOLUMETRIC_DIVISOR } from "@/lib/pricing/chargeableWeight";

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * Date-prefixed and sequenced, so two changes on one day are still ordered and
 * the value sorts chronologically in a GROUP BY.
 */
export const SWEEP_CONFIG_VERSION = "2026-08-15.1";

// ---------------------------------------------------------------------------
// Origin
// ---------------------------------------------------------------------------

/**
 * Every swept row is quoted from here.
 *
 * Deliberately a copy of FIRST_MILE_HUBS[0] in lib/booking/firstMile.ts rather
 * than an import of it: that module is about a booking in progress and pulls in
 * the wizard's form types, which a background job has no business loading. The
 * copy is held honest by a test that fails if the hub ever moves, so the
 * duplication cannot rot silently.
 */
export const SWEEP_ORIGIN = {
  pincode: "110077",
  city: "New Delhi",
  countryCode: "IN",
  country: "India",
  line1: "KH. NO. 174, Dhulsiras, Dwarka, Phase-2, Sector-24",
} as const;

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

export interface SweepCountry {
  /** ISO 3166-1 alpha-2. The row key. */
  code: string;
  /**
   * Full English name. Not decoration: sKart matches on an uppercased full
   * name and Shipmozo resolves its numeric country id by name or code, so a
   * wrong spelling here is a lane that never returns anything.
   */
  name: string;
  /** Capital city, per the agreed rule. */
  city: string;
  /** The canonical postcode every row for this country is quoted at. */
  postcode: string;
  /**
   * True where the country has no postal system and the value above is a
   * placeholder sent only because the vendor's API demands the field.
   *
   * This is the first thing to check if a Gulf lane comes back empty. It is
   * stored on every call row rather than only living here, so the explanation
   * travels with the data.
   */
  syntheticPostcode?: boolean;
  /**
   * Why this country is in the matrix. "volume" means it earns its place in
   * the 80%; "coverage" means it is there so the grid spans a region. Kept
   * because the first question anyone asks of a 20-row list is "why these".
   */
  reason: "volume" | "coverage";
}

/**
 * The destination list. Capital-city postcodes throughout.
 *
 * ── THE KNOWN WEAKNESS ──────────────────────────────────────────────────────
 * A capital is not always the commercial centre, and express carriers price
 * zones, not countries. Canberra is not Sydney, Pretoria is not Johannesburg,
 * and Washington DC is not New York. Rows for those three describe a real lane
 * that is not the busiest lane. The rule is consistent and every row says which
 * postcode produced it, which is what makes it safe: a lane that looks wrong
 * against a live quote is one line to change here.
 */
export const SWEEP_COUNTRIES: readonly SweepCountry[] = [
  // North America
  { code: "US", name: "United States", city: "Washington", postcode: "20001", reason: "volume" },
  { code: "CA", name: "Canada", city: "Ottawa", postcode: "K1A 0A6", reason: "volume" },

  // United Kingdom and Europe
  { code: "GB", name: "United Kingdom", city: "London", postcode: "SW1A 1AA", reason: "volume" },
  { code: "DE", name: "Germany", city: "Berlin", postcode: "10115", reason: "volume" },
  { code: "FR", name: "France", city: "Paris", postcode: "75001", reason: "volume" },
  { code: "NL", name: "Netherlands", city: "Amsterdam", postcode: "1011 AB", reason: "volume" },
  { code: "IT", name: "Italy", city: "Rome", postcode: "00118", reason: "volume" },
  { code: "ES", name: "Spain", city: "Madrid", postcode: "28001", reason: "coverage" },

  // Asia
  { code: "CN", name: "China", city: "Beijing", postcode: "100000", reason: "volume" },
  {
    code: "HK",
    name: "Hong Kong",
    city: "Hong Kong",
    postcode: "00000",
    syntheticPostcode: true,
    reason: "volume",
  },

  // Gulf
  {
    code: "AE",
    name: "United Arab Emirates",
    city: "Abu Dhabi",
    postcode: "00000",
    syntheticPostcode: true,
    reason: "volume",
  },
  { code: "SA", name: "Saudi Arabia", city: "Riyadh", postcode: "11564", reason: "volume" },
  {
    code: "QA",
    name: "Qatar",
    city: "Doha",
    postcode: "00000",
    syntheticPostcode: true,
    reason: "volume",
  },
  { code: "KW", name: "Kuwait", city: "Kuwait City", postcode: "13001", reason: "volume" },
  { code: "OM", name: "Oman", city: "Muscat", postcode: "100", reason: "volume" },

  // Asia Pacific
  { code: "SG", name: "Singapore", city: "Singapore", postcode: "018956", reason: "volume" },
  { code: "MY", name: "Malaysia", city: "Kuala Lumpur", postcode: "50050", reason: "coverage" },
  { code: "JP", name: "Japan", city: "Tokyo", postcode: "100-0001", reason: "coverage" },
  { code: "TH", name: "Thailand", city: "Bangkok", postcode: "10200", reason: "volume" },
  { code: "AU", name: "Australia", city: "Canberra", postcode: "2600", reason: "volume" },
  { code: "NZ", name: "New Zealand", city: "Wellington", postcode: "6011", reason: "coverage" },

  // Africa
  { code: "ZA", name: "South Africa", city: "Pretoria", postcode: "0002", reason: "coverage" },
  { code: "LK", name: "Sri Lanka", city: "Colombo", postcode: "00100", reason: "coverage" },
  { code: "KE", name: "Kenya", city: "Nairobi", postcode: "00100", reason: "coverage" },
  { code: "NG", name: "Nigeria", city: "Abuja", postcode: "900001", reason: "coverage" },

  // South America
  { code: "BR", name: "Brazil", city: "Brasilia", postcode: "70040-010", reason: "coverage" },
] as const;

// ---------------------------------------------------------------------------
// Weight ladder
// ---------------------------------------------------------------------------

/**
 * Thirty chargeable weights in kg, log-spaced.
 *
 * Dense below 5kg because that is where most parcels sit AND where the price
 * per kg moves fastest, so a straight-line interpolation between two samples is
 * least wrong there. Coarse above 20kg because those curves flatten and an
 * extra sample buys almost nothing.
 *
 * Ascending, and every value distinct. Both are asserted in the tests, because
 * a duplicate would violate the call table's unique key mid-run and a
 * descending pair would quietly break interpolation.
 */
export const WEIGHT_SLABS_KG: readonly number[] = [
  0.25, 0.5, 0.75, 1,
  1.25, 1.5, 1.75, 2,
  2.5, 3, 3.5, 4, 4.5, 5,
  6, 7, 8, 9, 10,
  12, 14, 16, 18, 20,
  25, 30, 40, 50, 75, 100,
] as const;

// ---------------------------------------------------------------------------
// The box
// ---------------------------------------------------------------------------

/**
 * Identifies the formula below, stored on every row.
 *
 * It exists so bulky-shipment profiles can be added later as extra rows rather
 * than as a re-key of every existing one: the day someone wants to know what a
 * light, voluminous 5kg costs, that is a second profile against the same slab,
 * and every query already groups by this column.
 */
export const BOX_PROFILE = "cube-half-vol";

export interface NominalBox {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/**
 * The box a slab is quoted in: a cube sized so its volumetric weight lands at
 * roughly HALF the actual weight.
 *
 * ── WHY A BOX AT ALL ────────────────────────────────────────────────────────
 * sKart, ShipGlobal and Aramex are told the chargeable weight directly. Shipmozo
 * is not: it takes real dimensions and computes volumetric itself, then charges
 * on max(actual, volumetric). Send it no dimensions and it cannot quote; send it
 * a big box and the slab silently becomes a different, heavier slab, so the row
 * labelled 2kg would hold the price of 6kg.
 *
 * ── WHY HALF, AND NOT AS SMALL AS POSSIBLE ──────────────────────────────────
 * Volumetric has to stay strictly under actual, or the slab stops meaning what
 * the column says. A 1x1x1 box guarantees that and describes a shipment made of
 * neutronium, which a vendor is entitled to reject and which makes the stored
 * dimensions useless as a record of what was asked. Half the threshold is
 * comfortably under, survives rounding up to whole centimetres, and describes a
 * dense but physically ordinary parcel: 9cm at 250g, 63cm at 100kg.
 *
 *   volumetric = side^3 / 5000, and we want that to equal weight / 2
 *   so side = cbrt(2500 * weight)
 *
 * Dimensions come back as whole centimetres because Shipmozo rounds up to
 * integers anyway. Doing it here means the number stored is exactly the number
 * sent, which is the whole point of storing it.
 */
export function nominalBoxForWeight(weightKg: number): NominalBox {
  const safeWeight = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0.5;

  const side = Math.max(
    1,
    Math.ceil(Math.cbrt((INTERNATIONAL_VOLUMETRIC_DIVISOR / 2) * safeWeight)),
  );

  return { lengthCm: side, widthCm: side, heightCm: side };
}

/**
 * The invariant the box formula exists to satisfy, as a function, so the tests
 * can assert it across the whole ladder rather than at a few sampled points.
 * If this is ever false for a slab, that slab's rows are mislabelled.
 */
export function volumetricWeightOf(box: NominalBox): number {
  return (
    (box.lengthCm * box.widthCm * box.heightCm) /
    INTERNATIONAL_VOLUMETRIC_DIVISOR
  );
}

// ---------------------------------------------------------------------------
// Shipmozo's extra axes
// ---------------------------------------------------------------------------

/**
 * Shipmozo prices differently by export purpose and uses the declared value for
 * its duty maths. Both are pinned to one canonical config, so there is exactly
 * one Shipmozo row per lane and slab.
 *
 * The consequence, which matters when reading the data: any duty-driven part of
 * a Shipmozo breakdown is only valid NEAR this declared value. A quotation built
 * off these rows for a consignment worth ten times as much will understate duty.
 * That is acceptable for an indicative sheet and is not acceptable for a price
 * anyone is charged, which is the same reason bookings quote live.
 *
 * Changing either value is a SWEEP_CONFIG_VERSION bump: it changes what the
 * numbers mean, not just what they are.
 */
export const SWEEP_SHIPMENT_PURPOSE = "SCSB4" as const;
export const SWEEP_DECLARED_VALUE = 50_000;

// ---------------------------------------------------------------------------
// Pacing
// ---------------------------------------------------------------------------

/**
 * Calls per minute, per vendor.
 *
 * ── sKart IS NOT A GUESS ────────────────────────────────────────────────────
 * sKart's responses carry `ratelimit-policy: 10;w=60`. Ten a minute, published
 * by them, and the booking path already throttles to eight for the same reason
 * (lib/booking-adapters/vendors/skart/skart.booking.client.ts). Eight here too:
 * the sweep runs at 01:00 when nothing else is competing for that budget, and
 * the two extra calls of headroom absorb a retry without tipping into a 429.
 *
 * ── THE OTHERS ARE ─────────────────────────────────────────────────────────
 * Nobody else documents a limit. Your own vendor-api-docs/shipglobal.md lists
 * it as an open question to their tech team. Thirty a minute is a deliberately
 * unambitious guess at an undocumented ceiling, and the adaptive backoff below
 * means being wrong costs time rather than a blocked account. Raise these once
 * a few runs have gone by without a single RATE_LIMITED row, not before.
 */
export const DEFAULT_CALLS_PER_MINUTE = 30;

export const VENDOR_CALLS_PER_MINUTE: Readonly<Record<string, number>> = {
  skart: 8,
};

export function callsPerMinuteFor(vendorId: string): number {
  return VENDOR_CALLS_PER_MINUTE[vendorId] ?? DEFAULT_CALLS_PER_MINUTE;
}

/** Milliseconds to wait between two calls to the same vendor. */
export function pacingDelayMsFor(vendorId: string): number {
  return Math.ceil(60_000 / callsPerMinuteFor(vendorId));
}

/**
 * ── WHAT HAPPENS ON A 429 ───────────────────────────────────────────────────
 * Nothing in this file. The backoff is structural rather than a number here,
 * and that is worth understanding before anyone adds a decay factor back.
 *
 * The lane function runs with `concurrency: { limit: 1, key: vendorId }`, so
 * exactly one lane per vendor is ever in flight. A rate-limited cell throws
 * RetryAfterError carrying the vendor's own Retry-After, which suspends that
 * run for as long as they asked. Because that run holds the vendor's only
 * concurrency slot while it waits, every other lane for that vendor waits too.
 *
 * One 429 therefore pauses the whole vendor, for exactly the interval the
 * vendor named, using machinery that survives a deploy and a crash. A
 * hand-rolled pace decay would have to be recomputed identically on every
 * replay to stay deterministic, and would still only slow the one lane that
 * happened to see the 429.
 */

/** How long to wait when a vendor rate-limits us without saying for how long. */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

// ---------------------------------------------------------------------------
// Health thresholds
// ---------------------------------------------------------------------------

/**
 * A vendor failing more than this share of its attempted calls gets an alert
 * and marks the run PARTIAL.
 *
 * NO_SERVICE is excluded from the numerator on purpose. A vendor that does not
 * fly to Brazil says so on all thirty Brazilian slabs, which is 5% of its matrix
 * answered correctly; counting that as failure would put every honest vendor
 * permanently in alarm and train everyone to ignore the alert.
 */
export const VENDOR_FAILURE_ALERT_RATIO = 0.2;

/**
 * A vendor returning nothing usable at all is always worth waking up for, no
 * matter what the ratio says. This is the credentials-expired case, and it is
 * the one that quietly costs you a week of stale quotes if nobody notices.
 */
export const ALERT_ON_ZERO_ROWS = true;

/**
 * Successful calls keep their raw vendor body this long, then it is nulled and
 * rawPrunedAt is stamped. Failures keep theirs forever: a failure is the row
 * somebody opens months later asking what actually came back.
 *
 * Without this the raw column alone is roughly a gigabyte a year.
 */
export const RAW_RESPONSE_RETENTION_DAYS = 30;

/**
 * How old a row may be before a quotation must not use it. Five days is the
 * cadence, so anything past seven means a sweep was missed and nobody noticed.
 */
export const MAX_QUOTABLE_AGE_DAYS = 7;

// ---------------------------------------------------------------------------
// Derived shape
// ---------------------------------------------------------------------------

export interface SweepLane {
  vendorId: string;
  country: SweepCountry;
}

/** One Inngest run each: every vendor against every country. */
export function expandLanes(vendorIds: readonly string[]): SweepLane[] {
  const lanes: SweepLane[] = [];

  for (const vendorId of vendorIds) {
    for (const country of SWEEP_COUNTRIES) {
      lanes.push({ vendorId, country });
    }
  }

  return lanes;
}

export function plannedCallCount(vendorCount: number): number {
  return vendorCount * SWEEP_COUNTRIES.length * WEIGHT_SLABS_KG.length;
}

/**
 * Roughly how long one vendor needs for its whole share, in minutes. Used to
 * size the finalise backstop, and worth reading before changing the cadence:
 * sKart at eight a minute is the long pole by a wide margin; every other vendor
 * finishes in a fraction of its time. Both numbers move when a country is added,
 * so read them off this function rather than off this comment.
 */
export function estimatedVendorMinutes(vendorId: string): number {
  const calls = SWEEP_COUNTRIES.length * WEIGHT_SLABS_KG.length;
  return Math.ceil(calls / callsPerMinuteFor(vendorId));
}

/**
 * The provenance blob stored on every run. Deliberately a plain snapshot rather
 * than a reference to this module: in two years this file will say something
 * different and the run row still has to explain itself.
 */
export function snapshotSweepConfig() {
  return {
    version: SWEEP_CONFIG_VERSION,
    origin: SWEEP_ORIGIN,
    countries: SWEEP_COUNTRIES.map((c) => ({
      code: c.code,
      name: c.name,
      city: c.city,
      postcode: c.postcode,
      syntheticPostcode: c.syntheticPostcode ?? false,
    })),
    weightSlabsKg: [...WEIGHT_SLABS_KG],
    boxProfile: BOX_PROFILE,
    volumetricDivisor: INTERNATIONAL_VOLUMETRIC_DIVISOR,
    shipmentPurpose: SWEEP_SHIPMENT_PURPOSE,
    declaredValue: SWEEP_DECLARED_VALUE,
    pacing: {
      default: DEFAULT_CALLS_PER_MINUTE,
      perVendor: VENDOR_CALLS_PER_MINUTE,
    },
  };
}
