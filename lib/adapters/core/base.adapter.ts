/**
 * BASE ADAPTER (Abstract)
 * ─────────────────────────────────────────────────────────────────────────────
 * Every vendor adapter extends this class. It enforces the contract:
 *   1. transformRequest  → convert canonical input → vendor-specific payload
 *   2. callVendorApi     → make the HTTP call to the vendor
 *   3. transformResponse → convert vendor response → canonical RateQuote[]
 *
 * The public method `fetchRates` is the only thing the service layer calls.
 * It orchestrates the three steps above and handles errors uniformly.
 *
 * HOW TO ADD A NEW VENDOR
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. Create src/lib/adapters/vendors/<vendor>/
 *   2. Create <vendor>.types.ts  (vendor-specific request/response shapes)
 *   3. Create <vendor>.adapter.ts extending BaseVendorAdapter
 *   4. Register it in src/lib/adapters/vendors/index.ts
 *   Done. Nothing else in the codebase needs to change.
 */

import type {
  CanonicalRateRequest,
  RateQuote,
  VendorError,
} from "./types";

export interface FetchRatesResult {
  quotes: RateQuote[];
  error?: VendorError;
}

export abstract class BaseVendorAdapter<TVendorRequest, TVendorResponse> {
  /** Unique machine-readable key, e.g. "skart", "aramex" */
  abstract readonly vendorId: string;

  /** Human-readable label shown in logs and error messages */
  abstract readonly vendorName: string;

  /**
   * Convert the canonical input into whatever shape this vendor's API expects.
   */
  protected abstract transformRequest(
    input: CanonicalRateRequest
  ): TVendorRequest;

  /**
   * Make the actual HTTP call to the vendor's endpoint.
   * Throw on non-2xx or network errors; the base class will catch them.
   */
  protected abstract callVendorApi(
    request: TVendorRequest
  ): Promise<TVendorResponse>;

  /**
   * Convert the vendor's raw response into the canonical RateQuote[].
   */
  protected abstract transformResponse(
    response: TVendorResponse
  ): RateQuote[];

  /**
   * Public entry point used by the service layer.
   * Orchestrates the full fetch cycle and wraps errors cleanly.
   */
  async fetchRates(input: CanonicalRateRequest): Promise<FetchRatesResult> {
    try {
      const vendorRequest = this.transformRequest(input);
      const vendorResponse = await this.callVendorApi(vendorRequest);
      const quotes = this.transformResponse(vendorResponse);
      return { quotes };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown vendor error";
      console.error(`[${this.vendorId}] fetchRates failed:`, err);
      return {
        quotes: [],
        error: {
          vendorId: this.vendorId,
          vendorName: this.vendorName,
          message,
          raw: err,
        },
      };
    }
  }
}