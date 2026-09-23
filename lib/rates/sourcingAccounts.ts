/**
 * COLLAPSING SOURCING-ACCOUNT QUOTES
 * -----------------------------------------------------------------------------
 * Some vendors are bought from on more than one contract. Aramex is the one
 * today: Arena holds a direct account and a UPS-channel account, they quote
 * DIFFERENT PRICES for the same parcel on the same product, and they are
 * invoiced separately (lib/aramex/accounts.ts).
 *
 * The rate adapter returns every account's price, because it cannot know who is
 * asking. This module is where that is reduced for the people who must not see
 * it.
 *
 * ── WHO SEES WHAT, AND WHY ──────────────────────────────────────────────────
 *   Customers            ONE row, the cheapest. Two rows reading "Aramex
 *                        Express" at different prices is both confusing and a
 *                        disclosure: it says out loud that we buy the same
 *                        service through more than one channel, which is the
 *                        sourcing detail carrierBranding.md exists to keep.
 *   Partners (v1 API)    Same as customers. They are never Arena staff.
 *   Arena staff          Every row. "Which of our accounts is cheaper on this
 *                        lane" is the question the calculator is open for.
 *   The rate sweep       Every row, and it gets them by calling the adapter
 *                        directly rather than through this.
 *
 * ── WHY THIS IS NOT IN THE ADAPTER ──────────────────────────────────────────
 * Visibility is a property of the viewer, not of the vendor. An adapter that
 * collapsed on its own would make the Arena view impossible to build without
 * threading a viewer flag down through the registry and into every vendor that
 * has no opinion about it.
 *
 * ── WHY THIS IS NOT IN THE UI EITHER ────────────────────────────────────────
 * Because then the prices would still be in the payload. A customer-facing
 * response must not CONTAIN the other account's price, not merely decline to
 * render it — the same reason vendor errors are dropped server-side rather than
 * hidden with CSS.
 */

import type { RateQuote } from "@/lib/rate-adapters/core/types";
import { isAramexAccountKey } from "@/lib/aramex/accountKeys";

/**
 * Is this quote one of several the same vendor gave us for the same product,
 * differing only by which of our contracts priced it?
 *
 * A registry of ONE today. It is a predicate rather than a list of vendor ids
 * because the thing that makes a quote collapsible is that its `courierId` is
 * an ARENA-INTERNAL account key rather than a vendor's own service id — and
 * that distinction is what the next multi-contract vendor will need too.
 */
function hasSourcingAccount(quote: RateQuote): boolean {
  return isAramexAccountKey(quote.courierId);
}

/**
 * Quotes that differ only by sourcing account, reduced to the cheapest of each.
 *
 * Everything else passes through untouched, in its original order. A vendor
 * whose `courierId` is its own service id is NOT collapsed: two Shipmozo
 * couriers at different prices are two genuinely different purchasable
 * services, and merging them would delete a real option.
 *
 * Grouping is on vendor + product. Not currency: the promise to a customer is
 * ONE Aramex row, and two rows priced in two currencies would break it while
 * announcing that we hold two channels. Currency is handled inside the
 * comparison instead — see cheapestComparableQuote.
 */
export function collapseSourcingAccounts(quotes: RateQuote[]): RateQuote[] {
  // The common case: nothing to do, and worth not allocating for.
  if (!quotes.some(hasSourcingAccount)) return quotes;

  const cheapestByGroup = new Map<string, RateQuote>();

  for (const quote of quotes) {
    if (!hasSourcingAccount(quote)) continue;

    const key = groupKey(quote);
    const incumbent = cheapestByGroup.get(key);

    cheapestByGroup.set(
      key,
      incumbent ? cheapestComparableQuote([incumbent, quote])! : quote,
    );
  }

  const winners = new Set(cheapestByGroup.values());

  // Filtered rather than rebuilt so every other quote keeps its position and
  // its identity. The caller sorts afterwards.
  return quotes.filter((quote) => !hasSourcingAccount(quote) || winners.has(quote));
}

function groupKey(quote: RateQuote): string {
  return [quote.vendorId, quote.productName.trim().toLowerCase()].join("::");
}

/**
 * The cheapest quote, comparing only prices that can be compared.
 *
 * Arena's Indian Aramex accounts both answer in INR today, but nothing in their
 * API promises that, and a naive min() across currencies would put 60 USD below
 * 4,200 INR — confidently wrong rather than merely unhelpful. It is the same
 * trap the rate sweep's `isComparable` column exists to avoid.
 *
 * So: compare within INR when any INR quote exists, otherwise within whichever
 * currency the first quote answered in. NOTHING HERE INVENTS AN EXCHANGE RATE,
 * and nothing here should ever be changed to.
 *
 * Ties keep the earlier quote. The Aramex adapter emits its accounts in
 * definition order, which makes that deterministic — a lane must not flip
 * between contracts from one search to the next.
 */
export function cheapestComparableQuote(quotes: RateQuote[]): RateQuote | null {
  if (quotes.length === 0) return null;
  if (quotes.length === 1) return quotes[0];

  const inr = quotes.filter((q) => q.currency.trim().toUpperCase() === "INR");
  const pool =
    inr.length > 0
      ? inr
      : quotes.filter(
          (q) =>
            q.currency.trim().toUpperCase() ===
            quotes[0].currency.trim().toUpperCase(),
        );

  return pool.reduce((best, q) =>
    q.totalWithTax < best.totalWithTax ? q : best,
  );
}
