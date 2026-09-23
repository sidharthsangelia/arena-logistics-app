"use server";

import { auth } from "@clerk/nextjs/server";

import { getOrgMarkupPercent } from "@/utils/tenant";
import { isArenaOrgId } from "@/lib/branding/isArenaOrg.server";
import { getRates } from "@/lib/services/rate-calculator.service";
import { checkRateLimit, rateLimitMessage } from "@/lib/rateLimit";

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
    // Rate limiting
    // -----------------------------------------------------------------------
    // Each call fans out to live, paid vendor APIs. Throttle per org so a
    // tenant hammering the calculator can't drive real upstream cost/quota.
    // The form debounces client-side, but that isn't a server-side control.
    const throttle = checkRateLimit("ratesInternational", orgId);
    if (!throttle.ok) {
      return {
        success: false,
        quotes: [],
        vendorErrors: [],
        error: rateLimitMessage(throttle),
      };
    }

    // -----------------------------------------------------------------------
    // Pricing configuration
    // -----------------------------------------------------------------------

    // Cached (utils/tenant.ts) rather than queried per request: this used to be a
    // Neon round trip in front of every rate search, for a number an admin edits
    // about once a month. The cache is dropped the moment they do.
    const markupPercent = (await getOrgMarkupPercent(orgId)) ?? 30;

    // -----------------------------------------------------------------------
    // Fetch rates
    // -----------------------------------------------------------------------

    const result = await getRates(request, {
      vendorIds: sanitisedVendorIds,
      markupPercent,

      /**
       * Arena staff see every sourcing account; everyone else sees the cheapest.
       *
       * Decided HERE, from the server-side org id, and never taken as an
       * argument. A client-supplied flag would let any tenant ask for the
       * breakdown of how we source a rate, which is the one thing this is meant
       * to withhold. See lib/rates/sourcingAccounts.ts.
       *
       * This also covers the booking wizard's service step, which calls this
       * action: an Arena staffer booking on a customer's behalf can pick the
       * account deliberately, and the booking is placed on whichever they chose.
       */
      showSourcingAccounts: isArenaOrgId(orgId),
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