/**
 * CARRIER RULES THAT ARE OURS, NOT THE VENDOR'S
 * -----------------------------------------------------------------------------
 * A vendor will happily quote a courier that cannot legally or contractually
 * carry the consignment. Where we know that in advance, the quote has to go
 * before the customer ever sees it: a rate that is withdrawn at booking is
 * worse than a rate that was never shown, because by then the customer has
 * chosen it and, on the domestic flow, is one click from paying for it.
 *
 * ── WHY THIS IS APPLIED IN THE ADAPTER AND NOT AT A CALL SITE ───────────────
 * Domestic quotes are requested from three places: the rate calculator, the
 * booking wizard's service step, and lib/booking/domesticCourierResolve.ts,
 * which re-quotes a lane at BOOKING time to recover the vendor's courier id.
 * If the three disagreed about which couriers are eligible, the third would
 * fail to find the service the customer paid for and the booking would stall
 * with the money already taken. Applying the rules inside every domestic
 * adapter's own fetchRates makes that impossible to get wrong: there is one
 * code path, and a new call site inherits it without knowing it exists.
 *
 * Pure and free of `server-only` so utils/domesticCarrierRules.test.ts can
 * exercise the boundaries directly.
 */

import type { CanonicalRateRequest, RateQuote } from "@/lib/rate-adapters/core/types";

/**
 * SHADOWFAX WILL NOT CARRY HIGH-VALUE CONSIGNMENTS.
 *
 * Above this declared invoice value the service is not offered, so quoting it
 * sells something that cannot be booked. The cap is on the value of the GOODS,
 * which is what the courier is liable for, and not on the freight.
 *
 * The comparison is strictly greater-than: a consignment invoiced at exactly
 * this figure is still eligible.
 */
export const SHADOWFAX_MAX_DECLARED_VALUE = 5000;

/** Matched as a whole word, so a courier merely containing the letters is safe. */
const SHADOWFAX_PATTERN = /\bshadowfax\b/i;

/**
 * Apply every domestic eligibility rule to one vendor's quotes.
 *
 * ── WHY AN ABSENT VALUE DOES NOT TRIGGER THE RULE ───────────────────────────
 * `declaredValue` is optional on the canonical request, and the Shipmozo
 * adapter substitutes a neutral dummy when pricing without one. Reading that
 * dummy as a real invoice value would hide Shadowfax from every caller that
 * simply did not collect a figure — the rate calculator did exactly that until
 * an invoice-value field was added to it. So the rule fires only on a value we
 * were actually given: no value means no judgement, and the courier stays.
 */
export function applyDomesticCarrierRules(
  quotes: RateQuote[],
  request: CanonicalRateRequest,
): RateQuote[] {
  const declaredValue = request.shipment.declaredValue;

  const overShadowfaxCap =
    typeof declaredValue === "number" &&
    Number.isFinite(declaredValue) &&
    declaredValue > SHADOWFAX_MAX_DECLARED_VALUE;

  if (!overShadowfaxCap) return quotes;

  return quotes.filter((quote) => !SHADOWFAX_PATTERN.test(quote.productName ?? ""));
}
