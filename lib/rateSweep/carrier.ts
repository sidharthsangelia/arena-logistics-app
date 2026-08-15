/**
 * lib/rateSweep/carrier.ts
 *
 * Turns a vendor's free-text service label into the two things a comparison
 * needs: WHO actually carries the parcel, and WHAT the price includes.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Three vendors resell FedEx and each spells it differently: "FEDEX DEL"
 * (sKart), "Fedex" (ShipGlobal), "Fedex DL - with Pickup" (Shipmozo). Grouping
 * on the raw label makes those three carriers instead of one, so the question
 * the sweep exists to answer — "whose FedEx is cheapest to the US at 5kg" — is
 * unanswerable in SQL. This module is the normalisation that makes it a
 * GROUP BY.
 *
 * ── WHY THE ATTRIBUTES MATTER AS MUCH AS THE CARRIER ────────────────────────
 * A duty-paid rate and a duty-unpaid rate are not two prices for the same
 * thing; the cheaper one leaves a customs bill for the customer on delivery.
 * Same for a documents rate quoted against a parcel. Ranking those together
 * produces a quotation that is wrong in a way nobody notices until the shipment
 * lands, so dutyMode and contentType are extracted and every fair comparison
 * filters on them.
 *
 * ── PURE ON PURPOSE ─────────────────────────────────────────────────────────
 * No imports from the DB or from "server-only": this runs at sweep time inside
 * a transaction, in a backfill script, and in tests. The rules are code rather
 * than a DB table because changing one silently rewrites the meaning of every
 * historical row, and that deserves a diff and a review.
 *
 * ── RELATIONSHIP TO lib/carrierLogo.ts ──────────────────────────────────────
 * That module answers a presentation question ("which logo, and may we rebrand
 * this") over four carriers. This one answers an analytical question over every
 * carrier that appears in the data. They deliberately share an ordering
 * principle — carrier before reseller, Aramex first because it is also a vendor
 * name — but not a rule table: adding a carrier here must never change what a
 * customer is allowed to see, and vice versa.
 */

/** Whether a price includes destination duties and taxes. */
export type SweepDutyMode = "DUTY_PAID" | "DUTY_UNPAID" | "UNKNOWN";

/** Whether a service carries documents or goods. Priced differently. */
export type SweepContentType = "DOCUMENTS" | "NON_DOCUMENTS" | "UNKNOWN";

export interface ServiceClassification {
  /** Normalised carrier code, or "OTHER" when nothing matched. */
  carrier: string;
  dutyMode: SweepDutyMode;
  contentType: SweepContentType;
  /** True/false when the label says so, null when it does not mention pickup. */
  pickupIncluded: boolean | null;
  /** Human-readable caveats parsed out of the label. Null when there are none. */
  restrictionNote: string | null;
}

/** Nothing in the label identified a carrier. These land on the review list. */
export const UNMAPPED_CARRIER = "OTHER";

interface CarrierRule {
  code: string;
  pattern: RegExp;
  /** Display name for the admin screens. */
  label: string;
  /**
   * True when this is a reseller's own consolidated network rather than a
   * carrier you could book directly. Comparing two of these across vendors is
   * meaningless — they are different products, not the same product sourced two
   * ways — so the UI marks them and the cross-vendor queries exclude them.
   */
  ownBrand?: boolean;
}

/**
 * Ordered. First match wins, and the order encodes three real decisions.
 *
 *   1. ARAMEX is first because it is both a carrier and one of our vendors.
 *      sKart's "Aramex Exp DEL", Shipmozo's "Aramex Premium - with Pickup" and
 *      our own direct "Aramex Express" must all land on the same code — that
 *      comparison ("where is our own Aramex account beaten by a reseller's") is
 *      one of the things this whole exercise is for.
 *
 *   2. Real carriers are matched BEFORE reseller brands, so ShipGlobal's
 *      "ShipGlobal Premium UPS Ground" and "ShipGlobal USPS Special" file under
 *      UPS and USPS. The parcel is flown by whoever the label names; the
 *      reseller is already recorded in vendorId, so filing by carrier loses
 *      nothing and gains the comparison.
 *
 *   3. USPS is listed before UPS. The UPS pattern is case-sensitive and word-
 *      bounded so it cannot match inside "USPS" anyway, but relying on that
 *      silently would make a later relaxation of the UPS rule a wrong answer
 *      instead of a compile error.
 */
const CARRIER_RULES: readonly CarrierRule[] = [
  { code: "ARAMEX", label: "Aramex", pattern: /\baramex\b/i },
  { code: "DHL", label: "DHL", pattern: /\bdhl\b/i },
  { code: "FEDEX", label: "FedEx", pattern: /fed\s?ex/i },
  { code: "USPS", label: "USPS", pattern: /\busps\b/i },
  // Case-sensitive on purpose, matching lib/carrierLogo.ts: a lowercase "ups"
  // inside another word must never match.
  { code: "UPS", label: "UPS", pattern: /\bUPS\b/ },
  { code: "DPD", label: "DPD", pattern: /\bdpd\b/i },
  { code: "CANADA_POST", label: "Canada Post", pattern: /\b(?:canada|ca)\s*post\b/i },
  { code: "AUSTRALIA_POST", label: "Australia Post", pattern: /\b(?:australia|aus|au)\s*post\b/i },
  { code: "ROYAL_MAIL", label: "Royal Mail", pattern: /\broyal\s*mail\b/i },
  { code: "EMIRATES", label: "Emirates", pattern: /\bemirates\b/i },
  { code: "DELHIVERY", label: "Delhivery", pattern: /\bdelhivery\b/i },
  { code: "XPRESSBEES", label: "Xpressbees", pattern: /\bxpressbees\b/i },
  // Reseller own-brand networks, last. A label that named a real carrier has
  // already matched above.
  {
    code: "SHIPGLOBAL",
    label: "ShipGlobal network",
    pattern: /\bship\s?global\b/i,
    ownBrand: true,
  },
  {
    code: "SHIPMOZO",
    label: "Shipmozo network",
    pattern: /\bshipmozo\b/i,
    ownBrand: true,
  },
];

/** Lookup for the admin screens. Built once; the rule list never changes. */
const CARRIER_BY_CODE = new Map(CARRIER_RULES.map((rule) => [rule.code, rule]));

export function carrierLabel(code: string): string {
  return CARRIER_BY_CODE.get(code)?.label ?? "Unmapped";
}

/**
 * True for a reseller's own consolidated network.
 *
 * Cross-vendor carrier comparison excludes these: "is ShipGlobal's ShipGlobal
 * Direct cheaper than Shipmozo's Sky Saver" is a real question, but it is a
 * different question from "whose FedEx is cheapest", and mixing them into one
 * table invites reading the first as an answer to the second.
 */
export function isOwnBrandNetwork(code: string): boolean {
  return CARRIER_BY_CODE.get(code)?.ownBrand === true;
}

/** Every carrier code the rules can produce, plus the unmapped bucket. */
export function knownCarrierCodes(): string[] {
  return [...CARRIER_RULES.map((rule) => rule.code), UNMAPPED_CARRIER];
}

export function detectCarrier(productName: string | null | undefined): string {
  const name = (productName ?? "").trim();
  if (!name) return UNMAPPED_CARRIER;

  return CARRIER_RULES.find((rule) => rule.pattern.test(name))?.code ?? UNMAPPED_CARRIER;
}

// ---------------------------------------------------------------------------
// Service attributes
// ---------------------------------------------------------------------------

/**
 * Duty-unpaid is checked first.
 *
 * "DDU" and "duty paid" cannot both match the same label, but the ordering is
 * the cheap insurance: the failure mode of getting this backwards is a
 * quotation that looks competitive because it silently excluded the duty, and
 * the customer discovers it at the door.
 */
function detectDutyMode(name: string): SweepDutyMode {
  if (/\bddu\b/i.test(name) || /\bduty\s*(?:un|not\s*)paid\b/i.test(name)) {
    return "DUTY_UNPAID";
  }
  if (/\bddp\b/i.test(name) || /\bduty\s*paid\b/i.test(name)) {
    return "DUTY_PAID";
  }
  return "UNKNOWN";
}

/** Non-documents first: "Non-Documents" contains "Documents". */
function detectContentType(name: string): SweepContentType {
  if (/\bnon[-\s]?doc(?:ument)?s?\b/i.test(name)) return "NON_DOCUMENTS";
  if (/\bdoc(?:ument)?s?\b/i.test(name)) return "DOCUMENTS";
  return "UNKNOWN";
}

/**
 * Null, not false, when the label says nothing.
 *
 * Most services do not mention pickup at all, and recording those as "no
 * pickup" would invent a fact about what the price covers. A three-state answer
 * is honest and the quotation layer can ask separately when it matters.
 */
function detectPickup(name: string): boolean | null {
  if (/\bwith\s*pick[-\s]?up\b/i.test(name)) return true;
  if (/\b(?:no|without)\s*pick[-\s]?up\b/i.test(name)) return false;
  // Shipmozo's "Self" services are self-drop at their hub. Narrow on purpose:
  // the token has to stand alone, so "Self" in a longer word never matches.
  if (/\bself\b/i.test(name) && !/\bself\s*pick[-\s]?up\b/i.test(name)) return false;
  return null;
}

/**
 * Caveats that decide whether a rate may appear in a general quotation at all.
 *
 * A "Gifts Only" rate quoted for a commercial consignment will be rejected at
 * the vendor's own booking step at best, and seized at customs at worst. These
 * are parsed from the label because that is the only place vendors state them.
 *
 * Destination locking is deliberately NOT parsed here. Some labels carry a
 * destination token ("UPS World DEL USA") but plenty of country-specific
 * services do not say so, and "DEL" in most sKart labels is the Delhi ORIGIN,
 * not a destination. The reliable answer comes from the data instead: a product
 * that only ever appears for one country is country-locked, which is a
 * COUNT(DISTINCT destCountryCode) and cannot be fooled by a naming convention.
 */
const RESTRICTION_RULES: readonly { pattern: RegExp; note: string }[] = [
  { pattern: /\bgifts?\s*only\b/i, note: "Gifts only" },
  { pattern: /\bb2b\b/i, note: "B2B only" },
  { pattern: /\bb2c\b/i, note: "B2C only" },
  { pattern: /\be[-\s]?com(?:merce)?\b/i, note: "Ecommerce consignments" },
  { pattern: /\bcommercial\b/i, note: "Commercial consignments" },
  { pattern: /\bsample\b/i, note: "Samples" },
];

function detectRestrictions(name: string): string | null {
  const notes = RESTRICTION_RULES.filter((rule) => rule.pattern.test(name)).map(
    (rule) => rule.note,
  );
  return notes.length > 0 ? notes.join("; ") : null;
}

/**
 * The whole classification for one service label.
 *
 * Called once per stored rate at sweep time, and once per existing row by the
 * backfill. Cheap enough to run inline: a dozen regex tests on a short string.
 */
export function classifyService(
  productName: string | null | undefined,
): ServiceClassification {
  const name = (productName ?? "").trim();

  return {
    carrier: detectCarrier(name),
    dutyMode: detectDutyMode(name),
    contentType: detectContentType(name),
    pickupIncluded: detectPickup(name),
    restrictionNote: detectRestrictions(name),
  };
}
