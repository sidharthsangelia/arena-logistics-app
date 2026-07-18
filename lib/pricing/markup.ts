/**
 * lib/pricing/markup.ts
 * -----------------------------------------------------------------------------
 * Injects the org's (client/BA) markup into a vendor RateQuote.
 *
 * The markup percentage itself comes from `Org.markupPercent` in the DB and is
 * resolved in actions/rates.action.ts — this module is ONLY concerned with how
 * that percentage is applied to a quote. It is the single, shared markup path
 * for BOTH the standalone rate calculator and the booking service step, so the
 * customer sees exactly the same maths everywhere.
 *
 * DESIGN GOALS (why this is written the way it is)
 * ------------------------------------------------
 *  1. Bulletproof: the returned quote is always internally consistent — the
 *     charge lines always sum to the same relationship they had before, and
 *     totalWithTax ≥ totalWithoutTax always holds, no matter what odd charge
 *     shape a vendor returns. It never throws.
 *  2. Hides vendor cost: the customer only ever sees marked-up numbers. We do
 *     NOT emit a separate "vendor cost" or "markup amount" line, and we do NOT
 *     attach those as fields on the quote (an earlier version leaked
 *     `vendorCost`/`markupAmount` onto every quote — removed).
 *  3. Robust to tax drift: because taxes/surcharges vary per lane and per
 *     vendor, the ACTIVE method scales by a single factor and therefore
 *     preserves whatever tax/base ratio the vendor actually returned, rather
 *     than assuming a fixed GST rate.
 *
 * ── MARKUP MODE — READ THIS ──────────────────────────────────────────────
 * Two business interpretations of "apply markup" are implemented below. Only
 * ONE is active at a time. To switch, flip the two lines in `applyMarkup()`:
 * comment the active call, uncomment the alternative. Nothing else changes.
 *
 *   MODE A (ACTIVE)      → applyMarkupFlat
 *       Flat uplift on the grand total. sell = vendorTotal × (1 + markup%).
 *       Every monetary field is scaled by the same factor, so the breakdown
 *       stays perfectly consistent and the vendor's tax ratio is preserved.
 *
 *   MODE B (ALTERNATIVE) → applyMarkupPreTaxGstRecomputed
 *       Markup is applied to the PRE-TAX freight, then GST is recomputed on
 *       the higher base (using the effective GST rate the vendor implied).
 *       Use this if the business must charge GST on its own margin too.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { RateQuote, CanonicalChargeBreakdown } from "@/lib/rate-adapters/core/types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toFactor(markupPercent: number): number {
  const pct = Number(markupPercent);
  if (!Number.isFinite(pct) || pct <= 0) return 1; // no markup / bad input → identity
  return 1 + pct / 100;
}

/**
 * Public entry point. Returns a NEW quote (never mutates the input) with the
 * org markup applied. If markup is 0/invalid, returns the quote unchanged.
 */
export function applyMarkup(quote: RateQuote, markupPercent: number): RateQuote {
  // ── MODE A (ACTIVE): flat uplift on grand total ──
  return applyMarkupFlat(quote, markupPercent);

  // ── MODE B (ALTERNATIVE): pre-tax markup, GST recomputed ──
  // To switch, comment the line above and uncomment the line below.
  // return applyMarkupPreTaxGstRecomputed(quote, markupPercent);
}

// ---------------------------------------------------------------------------
// MODE A — flat uplift on the grand total (uniform scaling)
// ---------------------------------------------------------------------------
// Multiplies every monetary field by the same factor. Because the scale is
// uniform, ALL internal relationships are preserved exactly:
//   - sum(charges) keeps the same proportion to the totals it had before
//   - the vendor's tax/base ratio is untouched (tax scales with base)
//   - totalWithTax ≥ totalWithoutTax stays true
// This is the most defensive option against unpredictable vendor charge
// shapes, which is exactly why it's the default.
// ---------------------------------------------------------------------------

function applyMarkupFlat(quote: RateQuote, markupPercent: number): RateQuote {
  const factor = toFactor(markupPercent);
  if (factor === 1) return quote;

  const scale = (n: number | undefined): number | undefined =>
    n === undefined || n === null ? n : round2(n * factor);

  const charges: CanonicalChargeBreakdown[] = quote.charges.map((c) => ({
    ...c,
    amount: round2(c.amount * factor),
    igst: scale(c.igst),
    cgst: scale(c.cgst),
    sgst: scale(c.sgst),
    taxAmount: scale(c.taxAmount),
  }));

  return {
    ...quote,
    totalWithoutTax: round2(quote.totalWithoutTax * factor),
    totalWithTax: round2(quote.totalWithTax * factor),
    charges,
  };
}

// ---------------------------------------------------------------------------
// MODE B — markup on pre-tax freight, GST recomputed on the higher base
// ---------------------------------------------------------------------------
// Applies the markup to the pre-tax amount, then re-derives tax using the
// EFFECTIVE tax rate the vendor implied (vendorTax / vendorBase) — so we don't
// hard-code a GST percentage that could drift. The charge breakdown is
// rebuilt as a clean two-line sell breakdown (FREIGHT + GST) to keep it
// consistent and free of vendor-cost line items.
//
// Intentionally exported so it's easy to unit-test / swap in, even while the
// flat method is active.
// ---------------------------------------------------------------------------

export function applyMarkupPreTaxGstRecomputed(
  quote: RateQuote,
  markupPercent: number,
): RateQuote {
  const factor = toFactor(markupPercent);
  if (factor === 1) return quote;

  const vendorBase = Number.isFinite(quote.totalWithoutTax)
    ? quote.totalWithoutTax
    : 0;
  const vendorTax = round2(Math.max(0, quote.totalWithTax - vendorBase));
  const effectiveTaxRate = vendorBase > 0 ? vendorTax / vendorBase : 0;

  const sellBase = round2(vendorBase * factor);
  const sellTax = round2(sellBase * effectiveTaxRate);
  const sellTotal = round2(sellBase + sellTax);

  const charges: CanonicalChargeBreakdown[] = [
    { name: "FREIGHT", amount: sellBase, currency: quote.currency },
  ];
  if (sellTax > 0) {
    charges.push({
      name: "GST",
      amount: sellTax,
      currency: quote.currency,
      taxAmount: sellTax,
    });
  }

  return {
    ...quote,
    totalWithoutTax: sellBase,
    totalWithTax: sellTotal,
    charges,
  };
}
