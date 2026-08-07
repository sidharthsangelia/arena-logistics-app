/**
 * SPEEDOPOST TRACKING ADAPTER
 * -----------------------------------------------------------------------------
 * Looks up a SpeedoPost waybill via GET /TrackingDetails and turns its scan
 * history into the canonical timeline every other vendor adapter produces.
 *
 * ── IT IS IN THE FAN-OUT RACE, SO IT HAS TO LOSE HONESTLY ───────────────────
 * `lib/services/tracking.services.ts` asks EVERY registered adapter about a
 * number it cannot place, and takes the first one to answer with a result. An
 * adapter that resolves successfully with an empty timeline therefore beats the
 * vendor that actually holds the parcel, and the customer is told their
 * shipment has no scans when it has plenty.
 *
 * So a miss here throws rather than returning an empty result:
 *   - SpeedoPost answering FAIL ("Shipment not found.") already throws in the
 *     client, since it is an ordinary HTTP 200 with a refusal inside.
 *   - A SUCCESS with a null or contentless body is treated as the same miss.
 * The only thing that resolves is a body carrying something real about a parcel.
 *
 * ── WHICH NUMBER THIS ANSWERS FOR ───────────────────────────────────────────
 * SpeedoPost's own AWB. Their response also echoes `serviceProviderAwbNumber`,
 * the downstream courier's waybill for the same parcel, but TrackingDetails
 * does not accept that number as input — a customer holding a Delhivery number
 * for a SpeedoPost consignment is not served by this endpoint.
 */

import { BaseTrackingAdapter } from "../../core/base.tracking.adapter";
import type {
  CanonicalTrackRequest,
  CanonicalTrackResult,
  TrackingEvent,
} from "../../core/tracking.types";
import { isSpeedoPostConfigured, trackingDetails } from "@/lib/speedopost/client";
import {
  inferSpeedoPostSegment,
  speedoPostServiceName,
} from "@/lib/speedopost/courierCatalogue";
import {
  mapSpeedoPostEventType,
  readScanDescription,
  readScanLocation,
  toIsoFromIst,
} from "@/lib/speedopost/trackShape";
import type { SpeedoPostTrackData } from "@/lib/speedopost/types";
import type { SpeedoPostTrackRequest } from "./speedopost.tracking.types";

export class SpeedoPostTrackingAdapter extends BaseTrackingAdapter<
  SpeedoPostTrackRequest,
  SpeedoPostTrackData
> {
  readonly vendorId = "speedopost";
  readonly vendorName = "SpeedoPost";

  // -- Step 1: Canonical → Vendor ---------------------------------------------

  protected transformRequest(
    input: CanonicalTrackRequest,
  ): SpeedoPostTrackRequest {
    const awb = input.awb.trim();
    if (!awb) throw new Error("SpeedoPost tracking needs an AWB number.");
    return { awb, trackingType: "AWB" };
  }

  // -- Step 2: HTTP call -------------------------------------------------------

  protected async callVendorApi(
    request: SpeedoPostTrackRequest,
  ): Promise<SpeedoPostTrackData> {
    // A missing credential is a deployment mistake, not an unknown waybill.
    // Reported as itself so it cannot hide inside "no tracking found".
    if (!isSpeedoPostConfigured()) {
      throw new Error(
        "SpeedoPost tracking is not configured. Set SPEEDOPOST_USER_ID and SPEEDOPOST_PASSWORD.",
      );
    }

    const data = await trackingDetails(request.awb);

    if (!hasTrackingContent(data)) {
      throw new Error(`SpeedoPost has no tracking for AWB ${request.awb}.`);
    }

    return data;
  }

  // -- Step 3: Vendor response → Canonical ------------------------------------

  protected transformResponse(
    response: SpeedoPostTrackData,
    awb: string,
  ): CanonicalTrackResult {
    const history = Array.isArray(response.packetHistory)
      ? response.packetHistory
      : [];

    const events: TrackingEvent[] = history
      .map((entry) => {
        const status = (entry.status ?? "").trim();
        return {
          timestamp: toIsoFromIst(entry.date),
          status: status || "Update",
          description: readScanDescription(entry),
          location: readScanLocation(entry),
          eventType: mapSpeedoPostEventType(status, entry.statusCode, entry.type),
          rawStatusCode:
            entry.statusCode != null ? String(entry.statusCode) : undefined,
        };
      })
      // SpeedoPost sends oldest first. Newest first is the canonical contract
      // the UI renders straight down, so it is reversed by sorting rather than
      // by trusting their order — a feed that arrives unsorted would otherwise
      // put a mid-journey scan at the top.
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

    // A freshly created consignment carries a headline status and no scans yet,
    // which is the NORMAL state of a live lookup: scans start when a courier
    // physically touches the parcel. "Order Booked" is a real, showable answer,
    // so it becomes the single event rather than an empty timeline that reads
    // as "we have no idea where your parcel is".
    const headline = response.currentStatus?.trim();
    if (events.length === 0 && headline) {
      events.push({
        timestamp: toIsoFromIst(response.orderDate),
        status: headline,
        description: "",
        location: (response.currentLocation ?? "").trim(),
        eventType: mapSpeedoPostEventType(headline, response.currentStatusCode),
        rawStatusCode:
          response.currentStatusCode != null
            ? String(response.currentStatusCode)
            : undefined,
      });
    }

    const rawProvider = response.serviceProviderName;
    const service = rawProvider
      ? speedoPostServiceName(rawProvider, inferSpeedoPostSegment(rawProvider))
      : undefined;

    // Delivered is read from the events and the headline together, both through
    // the same map — which tests the unhappy words first, so an "Undelivered"
    // or an "RTO Delivered" never flips this true.
    const isDelivered =
      events.some((e) => e.eventType === "delivered") ||
      mapSpeedoPostEventType(
        response.currentStatus,
        response.currentStatusCode,
      ) === "delivered";

    return {
      vendorId: this.vendorId,
      vendorName: this.vendorName,
      shipmentInfo: {
        awb: response.awbNumber?.trim() || awb,
        reference: response.clientOrderId?.trim() || undefined,
        service,
        carrier: service,
        shipDate: this.resolveShipDate(response, events),
      },
      events,
      latestEvent: events[0] ?? null,
      isDelivered,
    };
  }

  /**
   * When the parcel entered the network: their own `orderDate` when they send
   * one, otherwise the oldest scan. Never "now" — an invented ship date is
   * worse than none, because the UI renders it as fact.
   */
  private resolveShipDate(
    response: SpeedoPostTrackData,
    events: TrackingEvent[],
  ): string | undefined {
    const orderDate = response.orderDate?.trim();
    if (orderDate) return toIsoFromIst(orderDate);
    return events.length ? events[events.length - 1].timestamp : undefined;
  }
}

/**
 * Did SpeedoPost actually answer with a parcel?
 *
 * Anything that identifies a real consignment counts: an echoed AWB, a headline
 * status, a downstream courier's waybill, or a single scan. Nothing at all is a
 * miss, and a miss must throw rather than resolve — see the note at the top
 * about the fan-out race.
 *
 * Written as a type guard so the throw above is what narrows the value, rather
 * than a cast pretending the null case cannot happen.
 */
function hasTrackingContent(
  data: SpeedoPostTrackData | null | undefined,
): data is SpeedoPostTrackData {
  if (!data) return false;
  return Boolean(
    data.awbNumber?.trim() ||
      data.currentStatus?.trim() ||
      data.serviceProviderAwbNumber?.trim() ||
      (Array.isArray(data.packetHistory) && data.packetHistory.length > 0),
  );
}
