"use server";

/**
 * actions/domesticRateCalculator.action.ts
 *
 * Server Action for the DOMESTIC rate calculator (Shipmozo pincode courier
 * flow). It is the domestic twin of getRatesAction: same auth, same org markup
 * lookup, same return shape — the only difference is it fans the request over
 * the domestic adapter registry instead of the international one.
 *
 * NOTE: this is separate from actions/domesticRates.action.ts, which is the
 * legacy air-cargo (IATA + DB rate-card) calculator plus the arena-dashboard
 * rate-upload actions. That file is intentionally left in place and untouched.
 */

import { auth } from "@clerk/nextjs/server";

import { getOrgMarkupPercent } from "@/utils/tenant";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";
import { getRates } from "@/lib/services/rate-calculator.service";
import { domesticAdapterRegistry } from "@/lib/rate-adapters/vendors/domestic.index";

import { DOMESTIC_CALCULATOR_VENDORS } from "@/lib/types";
import type {
  RateRequest,
  DomesticCalculatorVendorId,
} from "@/lib/types";
import type { GetRatesActionResult } from "@/actions/rates.action";

const VALID_DOMESTIC_VENDOR_IDS = new Set<string>(
  DOMESTIC_CALCULATOR_VENDORS.map((v) => v.id),
);

function sanitiseVendorIds(
  vendorIds: string[] | undefined,
): DomesticCalculatorVendorId[] | undefined {
  if (!vendorIds || vendorIds.length === 0) return undefined;

  const valid = vendorIds.filter(
    (id): id is DomesticCalculatorVendorId =>
      VALID_DOMESTIC_VENDOR_IDS.has(id),
  );

  return valid.length > 0 ? valid : undefined;
}

export async function getDomesticRatesAction(
  request: RateRequest,
  vendorIds?: string[],
): Promise<GetRatesActionResult> {
  const sanitisedVendorIds = sanitiseVendorIds(vendorIds);

  try {
    const { orgId } = await auth();

    if (!orgId) {
      return {
        success: false,
        quotes: [],
        vendorErrors: [],
        error: "No active organization found.",
      };
    }

    // Throttled on the same terms as the international calculator, and for the
    // same reason: this fans out to live domestic vendor accounts that
    // bill us per call. It was missing here — the international action was
    // throttled when M4 was first raised and this one, added later, inherited
    // the shape but not the control, which left the domestic booking step as an
    // unmetered door to the same kind of paid API.
    //
    // A separate budget rather than a shared one: different vendor accounts, and
    // pricing a domestic parcel should not eat the export calculator's
    // allowance. See RATE_LIMIT_POLICIES.
    const throttle = checkRateLimit("ratesDomestic", orgId);
    if (!throttle.ok) {
      return {
        success: false,
        quotes: [],
        vendorErrors: [],
        error: rateLimitMessage(throttle),
      };
    }

    // Same cached read as the international calculator, so both flows share one
    // entry per org instead of each running its own query. See utils/tenant.ts.
    const markupPercent = (await getOrgMarkupPercent(orgId)) ?? 30;

    const result = await getRates(request, {
      vendorIds: sanitisedVendorIds,
      markupPercent,
      registry: domesticAdapterRegistry,
    });

    return {
      success: true,
      quotes: result.quotes,
      vendorErrors: result.vendorErrors,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "An unexpected error occurred while calculating domestic rates.";

    console.error("[getDomesticRatesAction] Rate calculation failed:", err);

    return {
      success: false,
      quotes: [],
      vendorErrors: [],
      error: message,
    };
  }
}
