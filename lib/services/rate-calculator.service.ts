/**
 * RATE CALCULATOR SERVICE
 * -----------------------------------------------------------------------------
 * The service layer sits between the API route and the adapters.
 * It knows NOTHING about individual vendors — it just fans out to all
 * registered adapters, collects results, and returns a unified response.
 *
 * Key behaviours:
 *   - Calls all vendors in parallel (Promise.allSettled)
 *   - Partial failures are surfaced in `vendorErrors`, not thrown
 *   - Quotes are sorted by price (cheapest first) for UX convenience
 *   - Optionally accepts a `vendorIds` filter to query specific vendors only
 *   - Applies organisation-specific markup before returning quotes
 */

import { adapterRegistry } from "../rate-adapters/vendors/index";
import type { AdapterRegistry } from "../rate-adapters/core/registry";
import type {
  CanonicalRateRequest,
  CanonicalRateResponse,
  RateQuote,
  VendorError,
} from "../rate-adapters/core/types";
import { applyMarkup } from "@/lib/pricing/markup";
import { collapseSourcingAccounts } from "@/lib/rates/sourcingAccounts";

import { Decimal } from "@/generated/prisma/runtime/client";

export interface GetRatesOptions {
  /** If provided, only these vendor IDs are queried. Default: all vendors. */
  vendorIds?: string[];

  /** Organisation-specific markup percentage. Example: 30 = +30% */
  markupPercent?: number | Decimal;

  /**
   * Which adapter registry to fan out over. Defaults to the international
   * registry. The domestic calculator passes its own registry so the same
   * service, markup path, and response shape serve both flows without any
   * vendor leaking across the two.
   */
  registry?: AdapterRegistry;

  /**
   * Show one row per SOURCING ACCOUNT, rather than the cheapest of them.
   *
   * Arena buys Aramex on more than one contract at different prices. Staff need
   * to see both to know which account is cheaper on a lane; customers and
   * partners must see neither the second price nor the fact that there is one.
   * See lib/rates/sourcingAccounts.ts.
   *
   * DEFAULTS TO FALSE, and the default is the safe one on purpose: every caller
   * that does not think about this — the partner API, the booking wizard, the
   * domestic calculator — gets the customer-facing answer. Only a caller that
   * has established the viewer is Arena staff passes true, and it must do so
   * from a SERVER-SIDE check, never from anything the client can set.
   */
  showSourcingAccounts?: boolean;
}

export async function getRates(
  request: CanonicalRateRequest,
  options: GetRatesOptions = {}
): Promise<CanonicalRateResponse> {
  const markupPercent = Number(options.markupPercent ?? 0);
  const registry = options.registry ?? adapterRegistry;

  // 1. Pick which adapters to use
  const adapters =
    options.vendorIds && options.vendorIds.length > 0
      ? options.vendorIds
          .map((id) => registry.get(id))
          .filter(Boolean)
      : registry.getAll();

  if (adapters.length === 0) {
    return {
      success: false,
      quotes: [],
      vendorErrors: [
        {
          vendorId: "registry",
          vendorName: "Adapter Registry",
          message:
            "No adapters registered or matched the requested vendor IDs.",
        },
      ],
    };
  }

  // 2. Fan out to all adapters in parallel
  const results = await Promise.allSettled(
    adapters.map((adapter) => adapter!.fetchRates(request))
  );

  // 3. Collect quotes and errors
  const quotes: RateQuote[] = [];
  const vendorErrors: VendorError[] = [];

  results.forEach((result, idx) => {
    if (result.status === "fulfilled") {
      // Apply the org (client/BA) markup to every quote via the single shared
      // markup path (lib/pricing/markup). This keeps the breakdown internally
      // consistent and NEVER leaks the raw vendor cost to the customer — the
      // customer only ever sees marked-up numbers.
      const markedUpQuotes = result.value.quotes.map((quote) =>
        applyMarkup(quote, markupPercent),
      );

      quotes.push(...markedUpQuotes);

      if (result.value.error) {
        vendorErrors.push(result.value.error);
      }
    } else {
      // Promise itself rejected (shouldn't happen — base adapter catches all,
      // but we handle it defensively)
      const adapter = adapters[idx];

      vendorErrors.push({
        vendorId: adapter?.vendorId ?? "unknown",
        vendorName: adapter?.vendorName ?? "Unknown Vendor",
        message: result.reason?.message ?? "Unexpected error",
      });
    }
  });

  // 4. Reduce multi-contract vendors to one row, unless the viewer may see them
  //
  // AFTER the markup, deliberately. The customer pays the SELL price, so that
  // is the number that decides which account is cheapest for them. The two are
  // normally the same pick — markup is a uniform factor — but they can diverge
  // under the pre-tax mode, which re-derives each quote's tax from its own
  // vendor's effective rate.
  const visible = options.showSourcingAccounts
    ? quotes
    : collapseSourcingAccounts(quotes);

  // 5. Sort by cheapest first
  visible.sort((a, b) => a.totalWithTax - b.totalWithTax);

  return {
    success: visible.length > 0,
    quotes: visible,
    vendorErrors,
  };
}