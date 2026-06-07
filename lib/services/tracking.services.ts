/**
 * TRACKING SERVICE
 * -----------------------------------------------------------------------------
 * Orchestrates shipment tracking across all registered vendor adapters.
 * Mirrors the pattern of rate-calculator.service.ts.
 *
 * Two resolution strategies:
 *
 *   1. TARGETED  — vendorId is provided in the request
 *      → calls only that vendor's adapter
 *      → returns its result or error directly
 *
 *   2. AUTO      — no vendorId provided
 *      → fans out to ALL registered adapters concurrently
 *      → returns the FIRST successful result (race)
 *      → if all fail, returns the last error
 *
 * The "race to first success" strategy is intentional: AWBs are globally
 * unique per vendor, so only one adapter will actually return data for any
 * given AWB. Racing them in parallel is faster than trying them serially.
 */

import { CanonicalTrackRequest, CanonicalTrackResponse, TrackingVendorError } from "../tracking-adapters/core/tracking.types";
import { trackingAdapterRegistry } from "../tracking-adapters/vendors/tracking.index";



export async function trackShipment(
  input: CanonicalTrackRequest
): Promise<CanonicalTrackResponse> {
  // --- TARGETED: caller knows which vendor to use --------------------------
  if (input.vendorId) {
    const adapter = trackingAdapterRegistry.get(input.vendorId);

    if (!adapter) {
      return {
        success: false,
        result: null,
        error: {
          vendorId: input.vendorId,
          vendorName: input.vendorId,
          message: `No tracking adapter registered for vendor "${input.vendorId}". ` +
            `Registered vendors: ${trackingAdapterRegistry.listVendorIds().join(", ")}`,
        },
      };
    }

    const { result, error } = await adapter.fetchTracking(input);
    return { success: !!result, result, error };
  }

  // --- AUTO: race all adapters, return first success -----------------------
  const adapters = trackingAdapterRegistry.getAll();

  if (adapters.length === 0) {
    return {
      success: false,
      result: null,
      error: {
        vendorId: "registry",
        vendorName: "Adapter Registry",
        message: "No tracking adapters are registered.",
      },
    };
  }

  return raceToFirstSuccess(input, adapters);
}

/**
 * Runs all adapters concurrently and resolves with the first non-null result.
 * If all adapters fail or return null, rejects with the last error.
 *
 * Uses a custom promise race because Promise.race would resolve on the first
 * *settled* promise (including failures), which isn't what we want here.
 */
async function raceToFirstSuccess(
  input: CanonicalTrackRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapters: ReturnType<typeof trackingAdapterRegistry.getAll>
): Promise<CanonicalTrackResponse> {
  return new Promise((resolve) => {
    let remaining = adapters.length;
    let lastError: TrackingVendorError | undefined;

    for (const adapter of adapters) {
      adapter.fetchTracking(input).then(({ result, error }) => {
        remaining--;

        if (result) {
          // Found a result — resolve immediately. Other in-flight requests
          // will settle eventually but their results are ignored.
          resolve({ success: true, result, error: undefined });
          return;
        }

        // This adapter failed or returned nothing
        if (error) lastError = error;

        // If this was the last adapter and no result was found, fail
        if (remaining === 0) {
          resolve({
            success: false,
            result: null,
            error: lastError ?? {
              vendorId: "all",
              vendorName: "All Vendors",
              message: `No tracking data found for AWB "${input.awb}" across any registered vendor.`,
            },
          });
        }
      });
    }
  });
}