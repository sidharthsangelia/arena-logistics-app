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
import type {
  CanonicalRateRequest,
  CanonicalRateResponse,
  RateQuote,
  VendorError,
} from "../rate-adapters/core/types";

import { Decimal } from "@/generated/prisma/runtime/client";

export interface GetRatesOptions {
  /** If provided, only these vendor IDs are queried. Default: all vendors. */
  vendorIds?: string[];

  /** Organisation-specific markup percentage. Example: 30 = +30% */
  markupPercent?: number | Decimal;
}

export async function getRates(
  request: CanonicalRateRequest,
  options: GetRatesOptions = {}
): Promise<CanonicalRateResponse> {
  const markupPercent = Number(options.markupPercent ?? 0);

  // 1. Pick which adapters to use
  const adapters =
    options.vendorIds && options.vendorIds.length > 0
      ? options.vendorIds
          .map((id) => adapterRegistry.get(id))
          .filter(Boolean)
      : adapterRegistry.getAll();

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
      // Apply organisation markup to every quote before exposing it to the
      // caller. The vendor quote itself remains untouched internally.
      const markedUpQuotes = result.value.quotes.map((quote) => {
        const markupAmount =
          quote.totalWithTax * (markupPercent / 100);

        return {
          ...quote,

          // overwrite customer-facing price
          totalWithTax: Number(
            (quote.totalWithTax + markupAmount).toFixed(2)
          ),

          // optional future reporting fields
          vendorCost: quote.totalWithTax,
          markupPercent,
          markupAmount: Number(markupAmount.toFixed(2)),
        };
      });

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

  // 4. Sort by cheapest first
  quotes.sort((a, b) => a.totalWithTax - b.totalWithTax);

  return {
    success: quotes.length > 0,
    quotes,
    vendorErrors,
  };
}