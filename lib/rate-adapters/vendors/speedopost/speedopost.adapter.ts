/**
 * SPEEDOPOST DOMESTIC RATE ADAPTER
 * -----------------------------------------------------------------------------
 * Prices an India → India move on SpeedoPost's aggregated network
 * (POST /EstimatedRate) and turns each serviceable provider into one canonical
 * RateQuote, sitting alongside Shipmozo's in the same domestic calculator.
 *
 * The adapter itself is deliberately thin: request in, HTTP out, response in,
 * quotes out. Both translations are pure functions in lib/speedopost/rateShape,
 * which is where the reasoning about tax splits and charge breakdowns lives and
 * where the tests point.
 *
 * ── ONE CALL PER NETWORK, ONE QUOTE LIST ────────────────────────────────────
 * `orderType` is required on the rate call and decides which network answers:
 * B2C is the parcel couriers, B2B the freight operators. Whichever networks
 * SPEEDOPOST_SEGMENTS lists are priced in parallel and merged; today that is
 * B2B alone, because our B2C rate card is dead at their end (the evidence is on
 * that constant). The plumbing here is unchanged and still segment-agnostic, so
 * restoring B2C is a one-word edit there and nothing in this file.
 *
 * The segment survives into the product name ("Delhivery" vs "Gati Freight"),
 * because a customer choosing freight is agreeing to a dock delivery rather
 * than a doorstep one. With B2B alone every SpeedoPost quote therefore reads
 * " Freight", which is accurate rather than cosmetic: these really are dock
 * deliveries, and the customer must not read them as parcel service.
 *
 * ── BOOKING ─────────────────────────────────────────────────────────────────
 * These quotes ARE purchasable as of 2026-09-05: a SpeedoPost booking adapter is
 * registered in lib/booking-adapters/vendors/domestic.booking.index.ts, so a
 * customer who picks one of these gets an order placed rather than a held
 * payment. `courierId` on every quote is the provider code that booking sends
 * back to them, which is why the de-duplication in rateShape takes such care to
 * make the surviving quote's code predictable.
 *
 * The booking surfaces still do not fan out over the registry: they pin
 * DOMESTIC_BOOKABLE_VENDOR_IDS (which now lists SpeedoPost) and
 * FIRST_MILE_VENDOR_IDS (which does not, deliberately). Adding a vendor to
 * either list without an adapter behind it is what produces a paid, unplaced
 * shipment.
 */

import { BaseVendorAdapter } from "../../core/base.adapter";
import type { FetchRatesResult } from "../../core/base.adapter";
import type { CanonicalRateRequest, RateQuote } from "../../core/types";
import { applyDomesticCarrierRules } from "@/lib/rates/domesticCarrierRules";
import { estimatedRate, isSpeedoPostConfigured } from "@/lib/speedopost/client";
import {
  buildSpeedoPostRatePayloads,
  dedupeSpeedoPostQuotes,
  mapSpeedoPostSegment,
} from "@/lib/speedopost/rateShape";
import type {
  SpeedoPostRateRequestBundle,
  SpeedoPostRateResponseBundle,
  SpeedoPostRateSegmentResult,
} from "./speedopost.types";

export class SpeedoPostDomesticAdapter extends BaseVendorAdapter<
  SpeedoPostRateRequestBundle,
  SpeedoPostRateResponseBundle
> {
  readonly vendorId = "speedopost";
  readonly vendorName = "SpeedoPost";

  // -- Step 1: Canonical → Vendor payloads -------------------------------------

  protected transformRequest(
    input: CanonicalRateRequest,
  ): SpeedoPostRateRequestBundle {
    return { calls: buildSpeedoPostRatePayloads(input) };
  }

  // -- Step 2: HTTP calls ------------------------------------------------------

  protected async callVendorApi(
    request: SpeedoPostRateRequestBundle,
  ): Promise<SpeedoPostRateResponseBundle> {
    // Fail with the real reason rather than whatever SpeedoPost tells an
    // unauthenticated caller. Blank credentials are a deployment mistake, not
    // an unserviceable lane, and the two must not read alike in the logs.
    if (!isSpeedoPostConfigured()) {
      throw new Error(
        "SpeedoPost is not configured. Set SPEEDOPOST_USER_ID and SPEEDOPOST_PASSWORD.",
      );
    }

    const settled = await Promise.allSettled(
      request.calls.map((call) => estimatedRate(call.payload)),
    );

    const segments: SpeedoPostRateSegmentResult[] = [];
    const failures: SpeedoPostRateResponseBundle["failures"] = [];

    settled.forEach((outcome, index) => {
      const { orderType } = request.calls[index];
      if (outcome.status === "fulfilled") {
        segments.push({ orderType, options: outcome.value });
      } else {
        failures.push({
          orderType,
          message:
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason),
        });
      }
    });

    const priced = segments.reduce((sum, s) => sum + s.options.length, 0);

    // Nothing priced AND something broke — surface the break. Reporting "no
    // couriers serve this route" when the truth is "the call failed" sends
    // somebody to check pincodes that were never the problem.
    if (priced === 0 && failures.length > 0) {
      throw new Error(
        failures.map((f) => `${f.orderType}: ${f.message}`).join(" | "),
      );
    }

    // One segment failing while the other prices the lane is a partial answer,
    // not an error: the customer still gets real quotes. It must not vanish
    // silently either, hence the log.
    if (failures.length > 0) {
      console.warn(
        "[speedopost] partial rate failure:",
        failures.map((f) => `${f.orderType}: ${f.message}`).join(" | "),
      );
    }

    return { segments, failures };
  }

  // -- Step 3: Vendor response → Canonical -------------------------------------

  protected transformResponse(
    response: SpeedoPostRateResponseBundle,
  ): RateQuote[] {
    const quotes = response.segments.flatMap((segment) =>
      mapSpeedoPostSegment(segment.options, segment.orderType, {
        vendorId: this.vendorId,
        vendorName: this.vendorName,
      }),
    );

    // Across BOTH segments, not per segment: the B2B suffix normally keeps the
    // two apart, but the de-duplication is what guarantees no two quotes share
    // a picker key, so it has to see the whole list.
    return dedupeSpeedoPostQuotes(quotes);
  }

  /**
   * The domestic eligibility rules apply here for the same reason they apply in
   * the Shipmozo domestic adapter: they are OUR rules about which couriers may
   * carry a consignment, not a vendor's, so the answer cannot depend on who
   * quoted it. SpeedoPost resells Shadowfax too (see the brand table in
   * lib/speedopost/courierCatalogue.ts), and hiding it on one vendor while
   * showing it on the other would make the value cap look arbitrary and leave
   * the exact rate the cap exists to prevent one click from being booked.
   */
  async fetchRates(input: CanonicalRateRequest): Promise<FetchRatesResult> {
    const result = await super.fetchRates(input);
    return {
      ...result,
      quotes: applyDomesticCarrierRules(result.quotes, input),
    };
  }
}
