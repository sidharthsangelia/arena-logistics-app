/**
 * lib/publicApi/countries.ts
 * -----------------------------------------------------------------------------
 * Turns the ISO country code a partner sends into the full country NAME the
 * vendors want.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The canonical address carries both `countryCode` (ISO alpha-2) and an
 * optional `country` (full name), and the adapters are split on which one they
 * read. sKart is sent the name and nothing else. Shipmozo resolves the name (or
 * the code) against its own catalogue to get a numeric id. ShipGlobal and
 * Aramex read the code.
 *
 * Our own rate calculator has always filled both fields because its country
 * picker holds names, so the split never showed. A partner posting JSON has no
 * such picker: they send the code, `country` arrives undefined, and the sources
 * that rate on the name quietly return nothing. Deriving the name here is what
 * makes a code-only request produce the same quotes as the calculator's.
 *
 * ── WHY THE CODE WINS OVER A SUPPLIED NAME ──────────────────────────────────
 * `countryCode` is required and validated; `country` is optional free text. A
 * caller who sends "UAE" or "USA" is sending something no vendor catalogue
 * lists, and honouring it would make their quote depend on their spelling. So
 * the name is derived from the code whenever we know the code, and a supplied
 * name is used only for a code we have no entry for. Same code in, same request
 * out to every vendor, every time.
 */

import { COUNTRIES } from "@/utils/data";

/**
 * Upper-cased because that is the form every vendor has been sent since the
 * rate calculator shipped, and Shipmozo's matching upper-cases both sides.
 */
const NAME_BY_CODE = new Map<string, string>(
  COUNTRIES.map((c) => [c.code.toUpperCase(), c.name.toUpperCase()]),
);

/**
 * The country name to put on a canonical address, or undefined when we hold no
 * name for the code and the caller supplied none.
 *
 * Undefined is a legitimate answer, not a failure: the adapters that need a
 * name already fall back to the code, and refusing the request here would mean
 * this file deciding which countries we serve. The vendors decide that.
 */
export function vendorCountryName(
  countryCode: string,
  supplied?: string,
): string | undefined {
  const derived = NAME_BY_CODE.get(countryCode.trim().toUpperCase());
  if (derived) return derived;

  const explicit = supplied?.trim();
  return explicit ? explicit.toUpperCase() : undefined;
}

/** Test seam: whether we can name this code without the caller's help. */
export function hasCountryName(countryCode: string): boolean {
  return NAME_BY_CODE.has(countryCode.trim().toUpperCase());
}
