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
 */

import { adapterRegistry } from "../adapters/vendors/index";
import type {
  CanonicalRateRequest,
  CanonicalRateResponse,
  RateQuote,
  VendorError,
} from "../adapters/core/types";

export interface GetRatesOptions {
  /** If provided, only these vendor IDs are queried. Default: all vendors. */
  vendorIds?: string[];
}

export async function getRates(
  request: CanonicalRateRequest,
  options: GetRatesOptions = {}
): Promise<CanonicalRateResponse> {
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
          message: "No adapters registered or matched the requested vendor IDs.",
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
      quotes.push(...result.value.quotes);
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