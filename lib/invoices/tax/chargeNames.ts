/**
 * lib/invoices/tax/chargeNames.ts
 *
 * Turns a vendor's own charge label into something a customer should read on an
 * invoice.
 *
 * PURE MODULE. Shared by the generator and any UI that wants to preview a
 * breakdown.
 *
 * Three jobs, and they pull against each other:
 *
 *   1. Make the line legible. "FREIGHT" is not a description; "International air
 *      freight" is.
 *   2. Show the customer every charge they paid for. A breakdown that folds four
 *      distinct surcharges into one anonymous line is not a breakdown, it is a
 *      total with extra steps.
 *   3. Make sure no vendor string ever reaches a customer. carrierBranding.md is
 *      explicit that sourcing vendors are not disclosed, and charge names are a
 *      side door: skart passes `charge_name` straight through from its API, and
 *      shipmozo passes `overhead_charges_details[].name`, so a vendor is free to
 *      start returning "Shipmozo handling" tomorrow and it would print on a tax
 *      document without anyone deciding to.
 *
 * ── HOW THE THREE ARE RECONCILED ────────────────────────────────────────────
 * An earlier version was a strict allowlist: anything unrecognised became one
 * shared "Handling and surcharges" line. That is airtight on (3) and fails (2),
 * because vendors invent surcharge names constantly and every new one silently
 * disappeared into the same bucket, merged with the others.
 *
 * So the check is now on the SHAPE of the label rather than on membership of a
 * list. A name passes through, tidied, when it looks like an ordinary charge
 * description: plain words, nothing brand-like, nothing that reads as an
 * internal code. Anything that fails that test still collapses into the generic
 * line, and known names still get their curated wording.
 *
 * The failure mode is bounded in the right direction: an unrecognised but
 * well-formed surcharge prints under the vendor's plain wording, and anything
 * that could carry a vendor's identity prints generically. No charge is ever
 * dropped, and the invoice totals the same either way.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { ShipmentMode } from "@/generated/prisma";

/** What a charge becomes when its label cannot be shown. */
export const UNMAPPED_CHARGE_DESCRIPTION = "Other charges";

/**
 * Known vendor charge names, normalised (lower-cased, punctuation and spacing
 * collapsed), mapped to what the customer sees.
 *
 * Being in this list buys curated wording, not permission to print: an unknown
 * name that passes the shape check below prints too. Add entries when a vendor
 * introduces a charge whose own wording is unclear, cryptic or abbreviated.
 */
const CHARGE_DESCRIPTIONS: Record<string, string> = {
  // Freight. These are the ones that get the route appended.
  freight: "Freight charges",
  "freight charges": "Freight charges",
  "base freight": "Freight charges",
  "air freight": "Air freight charges",
  "shipping charges": "Freight charges",
  shipping: "Freight charges",
  "forward charges": "Freight charges",
  // ShipGlobal's `price.logistic_fee` — their word for the freight line.
  "logistic fee": "Freight charges",
  "logistic charges": "Freight charges",

  // Fuel.
  "fuel surcharge": "Fuel surcharge",
  "fuel charges": "Fuel surcharge",
  fuel: "Fuel surcharge",
  fsc: "Fuel surcharge",

  // Handling and paperwork.
  "overhead charges": "Handling charges",
  overhead: "Handling charges",
  handling: "Handling charges",
  "handling charges": "Handling charges",
  "documentation charges": "Documentation charges",
  documentation: "Documentation charges",
  docket: "Documentation charges",
  "docket charges": "Documentation charges",
  "awb charges": "Airway bill charges",
  awb: "Airway bill charges",
  "awb fee": "Airway bill charges",

  // Cash on delivery and returns.
  "cod charges": "Cash on delivery charges",
  cod: "Cash on delivery charges",
  "cod fee": "Cash on delivery charges",
  "rto charges": "Return to origin charges",
  rto: "Return to origin charges",

  // Cover.
  insurance: "Insurance",
  "insurance charges": "Insurance",
  "risk surcharge": "Risk surcharge",
  "owner risk": "Owner risk charges",

  // Location surcharges.
  "oda charges": "Out of delivery area charges",
  oda: "Out of delivery area charges",
  "remote area surcharge": "Remote area surcharge",
  ras: "Remote area surcharge",
  "remote area": "Remote area surcharge",

  // Pickup and delivery legs.
  "pickup charges": "Pickup charges",
  pickup: "Pickup charges",
  "delivery charges": "Delivery charges",
  "appointment delivery": "Appointment delivery charges",

  // Seasonal and regulatory.
  "peak surcharge": "Peak season surcharge",
  "peak season surcharge": "Peak season surcharge",
  "demand surcharge": "Peak season surcharge",
  "green tax": "Environmental surcharge",
  "emergency situation surcharge": "Emergency situation surcharge",
  ess: "Emergency situation surcharge",
  "security surcharge": "Security surcharge",
  "screening charges": "Security screening charges",

  // Weight and dimension adjustments.
  "overweight charges": "Overweight surcharge",
  "oversize charges": "Oversize surcharge",
  "volumetric charges": "Volumetric weight charges",
  "additional weight": "Additional weight charges",
};

/**
 * Tokens that must never appear in a printed charge description.
 *
 * Sourcing vendors first, because that is the disclosure rule. Then the words a
 * vendor uses for ITS OWN economics: an invoice line saying "margin" or "vendor
 * cost" tells the customer what Arena paid, which is the same leak by a
 * different door.
 *
 * Matched on whole words after normalisation, so "express" is not caught by
 * "xpress" and a legitimate description is not blocked by a substring.
 */
const FORBIDDEN_TOKENS = new Set([
  // Sourcing vendors and the carriers behind them.
  "shipmozo",
  "shipglobal",
  "skart",
  "aramex",
  "dhl",
  "fedex",
  "ups",
  "tnt",
  "dtdc",
  "delhivery",
  "bluedart",
  "blue",
  "dart",
  "ekart",
  "xpressbees",
  "shadowfax",
  "ecom",
  "smartr",
  "gati",
  "safexpress",
  "professional",
  "trackon",
  "amazon",
  "shiprocket",
  "nimbuspost",
  "pickrr",
  "vamaship",
  // Arena's own economics.
  "vendor",
  "cost",
  "margin",
  "markup",
  "commission",
  "profit",
  "purchase",
  "buying",
  "buy",
  "net",
  "wallet",
  "b2b",
  "partner",
  "reseller",
]);

/**
 * A label may print when it carries no vendor identity and reads as words
 * rather than as an internal code.
 *
 * ── WHERE THE LINE IS DRAWN, AND WHY IT MOVED ───────────────────────────────
 * An earlier version also required every word to be purely alphabetic. That
 * read as prudent and was wrong in practice: real charge labels carry digits
 * and symbols all the time ("GST 5%", "Freight @ 120/kg", "Airport charges
 * (origin)"), and each one was being thrown into the generic bucket. The
 * customer lost the breakdown to protect against a risk the forbidden-token
 * check below was already handling.
 *
 * So the branding guard is the token list, which is the check that actually
 * matters. This function only additionally insists the label contains real
 * words, so a bare code like "CHG_001" does not print as "Chg 001".
 * ────────────────────────────────────────────────────────────────────────────
 */
function isPrintableLabel(normalised: string): boolean {
  if (!normalised) return false;
  if (normalised.length > 48) return false;

  const words = normalised.split(" ");
  if (words.length > 6) return false;

  if (words.some((word) => FORBIDDEN_TOKENS.has(word))) return false;

  // A bare run of digits is a serial, not a description: "CHG_001" is an
  // internal code and printing it as "Chg 001" helps nobody. A digit attached
  // to a word is fine, so "Freight 120kg" survives.
  if (words.some((word) => /^\d+$/.test(word))) return false;

  // And at least one actual word, so "X1 22" cannot get through either.
  return words.some((word) => /^[a-z]{3,}$/.test(word));
}

function normalise(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * "peak season surcharge" to "Peak season surcharge". Sentence case, not title
 * case: an invoice full of Capitalised Words looks like a spreadsheet export,
 * and the curated descriptions above are written in sentence case too, so a
 * mixed document would be obvious.
 *
 * Acronyms the customer would otherwise not recognise are uppercased.
 */
const ACRONYMS = new Set(["gst", "awb", "cod", "oda", "rto", "ras", "vat"]);

function toDescription(normalised: string): string {
  const words = normalised.split(" ").map((word, i) => {
    if (ACRONYMS.has(word)) return word.toUpperCase();
    return i === 0 ? word[0].toUpperCase() + word.slice(1) : word;
  });

  return words.join(" ");
}

/**
 * The freight line is the one worth naming precisely, because it is the bulk of
 * every invoice and "Freight charges" tells the customer nothing about what they
 * bought. Given a route it becomes "International air freight, Delhi to Dubai".
 */
export function makeChargeDescriber(context?: {
  mode?: ShipmentMode;
  originCity?: string | null;
  destinationCity?: string | null;
}): (rawName: string) => string {
  const isDomestic = context?.mode === ShipmentMode.DOMESTIC;
  const origin = context?.originCity?.trim();
  const destination = context?.destinationCity?.trim();
  const route = origin && destination ? `, ${origin} to ${destination}` : "";

  const freightDescription = isDomestic
    ? `Domestic courier services${route}`
    : `International air freight${route}`;

  return (rawName: string): string => {
    const key = normalise(rawName ?? "");
    if (!key) return UNMAPPED_CHARGE_DESCRIPTION;

    const mapped = CHARGE_DESCRIPTIONS[key];

    if (mapped) {
      // Freight gets the route treatment; everything else keeps its label.
      return mapped === "Freight charges" || mapped === "Air freight charges"
        ? freightDescription
        : mapped;
    }

    // Unknown, but well formed: the customer paid for it, so show it.
    return isPrintableLabel(key)
      ? toDescription(key)
      : UNMAPPED_CHARGE_DESCRIPTION;
  };
}

/** True when this name has curated wording. Useful for tests and audits. */
export function isMappedChargeName(rawName: string): boolean {
  return normalise(rawName ?? "") in CHARGE_DESCRIPTIONS;
}

/**
 * True when this name would print generically. The one to watch in an audit: a
 * name here is either a genuinely odd vendor string or a curated entry someone
 * should add above.
 */
export function isSuppressedChargeName(rawName: string): boolean {
  const key = normalise(rawName ?? "");
  return !(key in CHARGE_DESCRIPTIONS) && !isPrintableLabel(key);
}
