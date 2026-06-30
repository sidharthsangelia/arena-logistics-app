"use server";

import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/utils/db";
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
      error: string;
    };

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_VENDOR_IDS = new Set<string>(
  AVAILABLE_VENDORS.map((v) => v.id)
);

function sanitiseVendorIds(
  vendorIds: string[] | undefined
): VendorId[] | undefined {
  if (!vendorIds || vendorIds.length === 0) {
    return undefined;
  }

  const valid = vendorIds.filter(
    (id): id is VendorId => VALID_VENDOR_IDS.has(id)
  );

  return valid.length > 0 ? valid : undefined;
}

// ---------------------------------------------------------------------------
// getRatesAction
// ---------------------------------------------------------------------------

export async function getRatesAction(
  request: RateRequest,
  vendorIds?: string[]
): Promise<GetRatesActionResult> {
  const sanitisedVendorIds = sanitiseVendorIds(vendorIds);

  try {
    // -----------------------------------------------------------------------
    // Authentication
    // -----------------------------------------------------------------------

    const { orgId } = await auth();

    if (!orgId) {
      return {
        success: false,
        quotes: [],
        vendorErrors: [],
        error: "No active organization found.",
      };
    }

    // -----------------------------------------------------------------------
    // Pricing configuration
    // -----------------------------------------------------------------------

    const org = await prisma.org.findUnique({
      where: {
        clerkOrgId: orgId,
      },
      select: {
        markupPercent: true,
      },
    });

    const markupPercent = org?.markupPercent ?? 30;

    // -----------------------------------------------------------------------
    // Fetch rates
    // -----------------------------------------------------------------------

    const result = await getRates(request, {
      vendorIds: sanitisedVendorIds,
      markupPercent,
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
        : "An unexpected error occurred while calculating rates.";

    console.error(
      "[getRatesAction] Rate calculation failed:",
      err
    );

    return {
      success: false,
      quotes: [],
      vendorErrors: [],
      error: message,
    };
  }
}