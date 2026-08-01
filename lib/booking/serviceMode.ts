/**
 * Surface vs air for a domestic courier product.
 *
 * Shipmozo returns 15-16 products for a typical India → India route and the
 * only thing separating a two-day flight from a week on a truck is the product
 * name: "Delhivery Air 0.5 Kg" next to "Delhivery Surface 0.5 Kg". Nothing in
 * the payload carries the mode as a field, so the name is all we have.
 *
 * The rule is deliberately one-sided. Air is the labelled case — a courier that
 * flies says so in the product name — so anything without an air marker is
 * treated as surface. That way a new surface product we have never seen still
 * lands somewhere sensible, and the failure mode of an unrecognised name is
 * "shown as surface" rather than "hidden from both tabs".
 *
 * MOVIN is the exception that is not keyword-driven by accident: it is an
 * air-network operator, so every MOVIN product is air whether or not the word
 * appears in its name.
 */

export type ServiceMode = "air" | "surface";

export const SERVICE_MODE_LABEL: Record<ServiceMode, string> = {
  air: "Air",
  surface: "Surface",
};

/**
 * Tokens that mean "this one flies". Matched as whole words against the
 * normalised name, never as substrings — "Aircel", "repair" and "chair" would
 * all otherwise read as air.
 */
const AIR_TOKENS = new Set([
  "air",
  "airs",
  "airmail",
  "aircargo",
  "aviation",
  "flight",
  // MOVIN, spelled either way. Air-only network.
  "movin",
  "moving",
]);

/** Lowercase, and split on anything that is not a letter or a digit. */
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Classify a courier product name.
 *
 * Air when the name carries an air marker, surface otherwise. Blank or unknown
 * names fall through to surface, which is the conservative default: it keeps
 * the option visible and does not promise a delivery speed we can't back.
 */
export function classifyServiceMode(productName: string): ServiceMode {
  for (const token of tokenize(productName ?? "")) {
    if (AIR_TOKENS.has(token)) return "air";
  }
  return "surface";
}
