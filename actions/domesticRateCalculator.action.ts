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

import { prisma } from "@/utils/db";
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

    const org = await prisma.org.findUnique({
      where: { clerkOrgId: orgId },
      select: { markupPercent: true },
    });

    const markupPercent = org?.markupPercent ?? 30;

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
