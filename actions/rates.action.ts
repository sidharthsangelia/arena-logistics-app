"use server";

/**
 * rates.actions.ts
 *
 * Server Actions for the rate-calculator feature.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The web app must never call fetch("/api/rates") internally. That pattern
 * wastes a full HTTP round-trip, prevents static analysis from tracking the
 * call, and breaks type safety at the serialisation boundary.
 *
 * These actions call rate-calculator.service.ts directly. The /api/rates
 * route continues to exist for n8n and other external consumers — it also
 * calls the same service, so there is one source of truth.
 *
 * SERIALISATION CONTRACT
 * ----------------------
 * Next.js Server Actions serialise return values through the RSC wire
 * protocol. Only plain JSON-serialisable values (objects, arrays, strings,
 * numbers, booleans, null) may cross this boundary. Dates, class instances,
 * Buffers, Maps, Sets, undefined object values, and functions will either
 * throw at runtime or silently drop data.
 *
 * The return type `GetRatesActionResult` is therefore explicitly typed as
 * a plain-object union rather than inferred from the service, which may
 * internally use richer types.
 */

import { getRates } from "@/lib/services/rate-calculator.service";
import { AVAILABLE_VENDORS } from "@/lib/types";
import type {
  RateRequest,
  RateQuote,
  VendorError,
  VendorId,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Return type — must be fully serialisable
// ---------------------------------------------------------------------------

export type GetRatesActionResult =
  | {
      success: true;
      quotes: RateQuote[];
      vendorErrors: VendorError[];
    }
  | {
      success: false;
      quotes: [];
      vendorErrors: VendorError[];
      /** Top-level error message when the entire action fails */
      error: string;
    };

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_VENDOR_IDS = new Set<string>(AVAILABLE_VENDORS.map((v) => v.id));

/**
 * Validates and normalises the vendorIds argument.
 *
 * - Filters out any IDs not present in AVAILABLE_VENDORS so callers
 *   cannot inject arbitrary strings into the service.
 * - Returns undefined (meaning "all vendors") if the resulting list is empty
 *   or no IDs were supplied.
 */
function sanitiseVendorIds(
  vendorIds: string[] | undefined
): VendorId[] | undefined {
  if (!vendorIds || vendorIds.length === 0) return undefined;

  const valid = vendorIds.filter((id): id is VendorId =>
    VALID_VENDOR_IDS.has(id)
  );

  return valid.length > 0 ? valid : undefined;
}

// ---------------------------------------------------------------------------
// getRatesAction
// ---------------------------------------------------------------------------

/**
 * Fetches shipping rates from one or more carriers.
 *
 * @param request  - Normalised shipment request (origin, destination, shipment)
 * @param vendorIds - Optional subset of carrier IDs to query.
 *                   Pass undefined or [] to query all registered carriers.
 *                   Unknown IDs are silently ignored.
 */
export async function getRatesAction(
  request: RateRequest,
  vendorIds?: string[]
): Promise<GetRatesActionResult> {
  const sanitisedVendorIds = sanitiseVendorIds(vendorIds);

  try {
    const result = await getRates(request, { vendorIds: sanitisedVendorIds });

    // Explicitly project onto the serialisable return type.
    // If the service ever returns richer objects (e.g. Dates inside quotes),
    // this is the place to normalise them rather than letting the wire
    // protocol silently drop fields.
    return {
      success: true,
      quotes: result.quotes,
      vendorErrors: result.vendorErrors,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";

    console.error("[getRatesAction] Rate calculation failed:", err);

    return {
      success: false,
      quotes: [],
      vendorErrors: [],
      error: message,
    };
  }
}