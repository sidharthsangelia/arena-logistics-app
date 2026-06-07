/**
 * BASE TRACKING ADAPTER (Abstract)
 * -----------------------------------------------------------------------------
 * Every vendor tracking adapter extends this class. It enforces the contract:
 *   1. transformRequest  → convert canonical input → vendor-specific payload
 *   2. callVendorApi     → make the HTTP call to the vendor
 *   3. transformResponse → convert vendor response → CanonicalTrackResult
 *
 * The public method `fetchTracking` is the only thing the service layer calls.
 * It orchestrates the three steps and handles errors uniformly.
 *
 * HOW TO ADD A NEW VENDOR
 * -----------------------------------------------------------------------------
 *   1. Create src/lib/adapters/vendors/<vendor>/
 *   2. Create <vendor>.tracking.types.ts   (vendor-specific shapes)
 *   3. Create <vendor>.tracking.adapter.ts extending BaseTrackingAdapter
 *   4. Register it in src/lib/adapters/vendors/tracking.index.ts
 *   Done. Nothing else in the codebase needs to change.
 */

import type {
  CanonicalTrackRequest,
  CanonicalTrackResult,
  TrackingVendorError,
} from "./tracking.types";

export interface FetchTrackingResult {
  result: CanonicalTrackResult | null;
  error?: TrackingVendorError;
}

export abstract class BaseTrackingAdapter<TVendorRequest, TVendorResponse> {
  /** Unique machine-readable key, e.g. "skart", "aramex". Match the rate adapter. */
  abstract readonly vendorId: string;

  /** Human-readable label for logs and error messages */
  abstract readonly vendorName: string;

  /**
   * Convert the canonical input into whatever shape this vendor's API expects.
   */
  protected abstract transformRequest(
    input: CanonicalTrackRequest
  ): TVendorRequest;

  /**
   * Make the HTTP call to the vendor's tracking endpoint.
   * Throw on non-2xx or network errors; the base class catches them.
   */
  protected abstract callVendorApi(
    request: TVendorRequest
  ): Promise<TVendorResponse>;

  /**
   * Convert the vendor's raw response into the canonical CanonicalTrackResult.
   * Receives the original AWB for convenience (some vendors don't echo it back).
   */
  protected abstract transformResponse(
    response: TVendorResponse,
    awb: string
  ): CanonicalTrackResult;

  /**
   * Public entry point used by the service layer.
   * Orchestrates the full tracking fetch cycle and wraps errors cleanly.
   */
  async fetchTracking(
    input: CanonicalTrackRequest
  ): Promise<FetchTrackingResult> {
    try {
      const vendorRequest = this.transformRequest(input);
      const vendorResponse = await this.callVendorApi(vendorRequest);
      const result = this.transformResponse(vendorResponse, input.awb);
      return { result };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown vendor error";
      console.error(`[${this.vendorId}] fetchTracking failed:`, err);
      return {
        result: null,
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