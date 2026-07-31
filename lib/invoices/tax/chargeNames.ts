/**
 * lib/invoices/tax/chargeNames.ts
 *
 * Turns a vendor's own charge label into something a customer should read on an
 * invoice.
 *
 * PURE MODULE. Shared by the generator and any UI that wants to preview a
 * breakdown.
 *
 * Two jobs, and the second is the important one:
 *
 *   1. Make the line legible. "FREIGHT" is not a description; "International air
 *      freight" is.
 *   2. Make sure no vendor string ever reaches a customer. carrierBranding.md is
 *      explicit that sourcing vendors are not disclosed, and charge names are a
 *      side door: skart passes `charge_name` straight through from its API, so a
 *      vendor is free to start returning "Shipmozo handling" tomorrow and it
 *      would print on a tax document without anyone deciding to.
 *
 * The guard is therefore an allowlist, not a blocklist. Anything not recognised
 * collapses into a single generic line rather than being tidied up and printed,
 * because tidying up an unknown string still prints the unknown string.
 */

import { ShipmentMode } from "@/generated/prisma";

/** What an unrecognised charge becomes. Deliberately says nothing specific. */
export const UNMAPPED_CHARGE_DESCRIPTION = "Handling and surcharges";

/**
 * Known vendor charge names, normalised (lower-cased, punctuation and spacing
 * collapsed), mapped to what the customer sees.
 *
 * Add to this list when a vendor introduces a charge type. The consequence of
 * NOT adding one is only that the amount is described generically; it is never
 * dropped, and the invoice still totals correctly.
 */
const CHARGE_DESCRIPTIONS: Record<string, string> = {
  freight: "Freight charges",
  "freight charges": "Freight charges",
  "base freight": "Freight charges",
  "air freight": "Air freight charges",
  shipping: "Freight charges",

  "fuel surcharge": "Fuel surcharge",
  fuel: "Fuel surcharge",
  fsc: "Fuel surcharge",

  "overhead charges": "Handling charges",
  overhead: "Handling charges",
  handling: "Handling charges",
  "handling charges": "Handling charges",
  "documentation charges": "Documentation charges",
  documentation: "Documentation charges",
  "awb charges": "Airway bill charges",
  awb: "Airway bill charges",

  "cod charges": "Cash on delivery charges",
  cod: "Cash on delivery charges",
  "rto charges": "Return to origin charges",

  insurance: "Insurance",
  "insurance charges": "Insurance",
  "risk surcharge": "Risk surcharge",

  "oda charges": "Out of delivery area charges",
  oda: "Out of delivery area charges",
  "remote area surcharge": "Remote area surcharge",

  "pickup charges": "Pickup charges",
  pickup: "Pickup charges",
  "delivery charges": "Delivery charges",
};

function normalise(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
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
    if (!mapped) return UNMAPPED_CHARGE_DESCRIPTION;

    // Freight gets the route treatment; everything else keeps its plain label.
    return mapped === "Freight charges" || mapped === "Air freight charges"
      ? freightDescription
      : mapped;
  };
}

/** True when this name would print generically. Useful for tests and audits. */
export function isMappedChargeName(rawName: string): boolean {
  return normalise(rawName ?? "") in CHARGE_DESCRIPTIONS;
}
