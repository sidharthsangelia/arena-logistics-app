/**
 * lib/publicApi/postcodes.ts
 * -----------------------------------------------------------------------------
 * Which destinations genuinely have no postal code, so that requiring one from
 * a caller would be requiring them to invent it.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `destination.pincode` is required on the international endpoint, because
 * several carriers rate door delivery by postcode and a country-level guess is
 * the difference between a quote and a quote that holds. But a hard requirement
 * would break the Gulf and Hong Kong, where there is no postal system to quote
 * from. A caller shipping to Dubai has nothing to send.
 *
 * So the rule is: required, unless the destination is a country on this list,
 * in which case we send SYNTHETIC_POSTCODE on the caller's behalf. Their form
 * never has to special-case anything.
 *
 * ── WHY "00000" AND NOT AN EMPTY STRING ─────────────────────────────────────
 * The same value the rate sweep already sends for exactly these countries
 * (SWEEP_COUNTRIES marks them `syntheticPostcode`). Several vendor APIs demand
 * the field be present and reject an empty one, which is why the sweep settled
 * on a placeholder rather than omitting it. Matching that value means a live
 * quote and a swept row describe the same request.
 *
 * ── THIS LIST IS A CONVENIENCE, NOT AN AUTHORITY ────────────────────────────
 * It is the UPU's "no postal code in use" set, which moves: Ireland had no
 * codes until Eircode arrived in 2015, and is deliberately NOT here. Being
 * wrong in one direction costs a caller a 422 they can fix by sending "00000"
 * themselves, which is always accepted. Being wrong in the other direction
 * costs nothing at all, since a synthetic postcode is what the lane would have
 * carried anyway. Neither failure is expensive, which is why a static list is
 * the right weight of solution here.
 */

/** What we send when a country has no postal system. Matches the rate sweep. */
export const SYNTHETIC_POSTCODE = "00000";

/**
 * ISO 3166-1 alpha-2 codes with no postal code system in general use.
 *
 * Kept as a flat sorted set rather than grouped by region: the only question
 * ever asked of it is membership, and grouping would invite the list to be read
 * as a coverage statement, which it is not.
 */
const NO_POSTCODE_COUNTRIES = new Set<string>([
  "AE", // United Arab Emirates
  "AG", // Antigua and Barbuda
  "AO", // Angola
  "AW", // Aruba
  "BF", // Burkina Faso
  "BI", // Burundi
  "BJ", // Benin
  "BO", // Bolivia
  "BS", // Bahamas
  "BW", // Botswana
  "BZ", // Belize
  "CD", // Congo (Kinshasa)
  "CF", // Central African Republic
  "CG", // Congo (Brazzaville)
  "CI", // Cote d'Ivoire
  "CK", // Cook Islands
  "CM", // Cameroon
  "DJ", // Djibouti
  "DM", // Dominica
  "ER", // Eritrea
  "FJ", // Fiji
  "GA", // Gabon
  "GD", // Grenada
  "GH", // Ghana
  "GM", // Gambia
  "GQ", // Equatorial Guinea
  "GY", // Guyana
  "HK", // Hong Kong
  "KI", // Kiribati
  "KM", // Comoros
  "KN", // Saint Kitts and Nevis
  "KP", // North Korea
  "LC", // Saint Lucia
  "ML", // Mali
  "MO", // Macau
  "MR", // Mauritania
  "MW", // Malawi
  "NR", // Nauru
  "PA", // Panama
  "QA", // Qatar
  "RW", // Rwanda
  "SB", // Solomon Islands
  "SC", // Seychelles
  "SL", // Sierra Leone
  "SR", // Suriname
  "ST", // Sao Tome and Principe
  "SY", // Syria
  "TD", // Chad
  "TG", // Togo
  "TL", // Timor-Leste
  "TO", // Tonga
  "TV", // Tuvalu
  "TZ", // Tanzania
  "UG", // Uganda
  "VU", // Vanuatu
  "WS", // Samoa
  "YE", // Yemen
  "ZW", // Zimbabwe
]);

/**
 * True when this destination has no postal system, so a missing pincode is a
 * fact about the country rather than a gap in the request.
 */
export function countryHasNoPostcode(countryCode: string | null | undefined): boolean {
  const code = (countryCode ?? "").trim().toUpperCase();
  if (code.length !== 2) return false;
  return NO_POSTCODE_COUNTRIES.has(code);
}

/** Exported for the test that keeps this in step with the rate sweep's view. */
export function noPostcodeCountryCodes(): string[] {
  return [...NO_POSTCODE_COUNTRIES].sort();
}
