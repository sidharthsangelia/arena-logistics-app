/**
 * SHIPMOZO TRACKING ADAPTER
 * -----------------------------------------------------------------------------
 * Tracks a Shipmozo waybill — a domestic door → door courier order, or the
 * door → hub first-mile leg of an international booking — via GET /track-order,
 * and translates the scan history into the canonical timeline every other
 * vendor adapter produces.
 *
 * This is the PULL side. The webhook (app/api/webhooks/shipmozo) is the push
 * side and advances a shipment's status directly. They read the same
 * information under different key names, so both go through
 * lib/shipmozo/trackShape.ts rather than reaching into the body themselves.
 *
 * What this adapter cannot know is which leg it is describing: on an
 * international booking Shipmozo's "Delivered" means the parcel reached OUR
 * hub, not the customer. That correction belongs to the caller that knows the
 * shipment — see lib/services/shipmentTracking.service.ts.
 */

import { BaseTrackingAdapter } from "../../core/base.tracking.adapter";
import type {
  CanonicalTrackRequest,
  CanonicalTrackResult,
  TrackingEvent,
} from "../../core/tracking.types";
import { isShipmozoConfigured, trackOrder } from "@/lib/shipmozo/client";
import {
  isShipmozoOrderCancelled,
  mapShipmozoEventType,
  readScanDate,
  readScanLocation,
  readScanStatus,
  readShipmozoCarrier,
  readShipmozoScans,
} from "@/lib/shipmozo/trackShape";
import type {
  ShipmozoTrackData,
  ShipmozoTrackRequest,
} from "./shipmozo.tracking.types";

export class ShipmozoTrackingAdapter extends BaseTrackingAdapter<
  ShipmozoTrackRequest,
  ShipmozoTrackData
> {
  readonly vendorId = "shipmozo";
  readonly vendorName = "Shipmozo";

  protected transformRequest(input: CanonicalTrackRequest): ShipmozoTrackRequest {
    return { awb: input.awb.trim() };
  }

  protected async callVendorApi(
    request: ShipmozoTrackRequest,
  ): Promise<ShipmozoTrackData> {
    // Fail with the real reason rather than whatever Shipmozo says to an
    // unauthenticated caller. Blank keys are a deployment mistake, not an
    // unknown AWB, and the two must not read the same in the logs.
    if (!isShipmozoConfigured()) {
      throw new Error(
        "Shipmozo tracking is not configured. Set SHIPMOZO_PUBLIC_KEY and SHIPMOZO_PRIVATE_KEY.",
      );
    }

    const data = await trackOrder(request.awb);

    // Shipmozo answers an AWB it does not recognise with result 1 and an empty
    // body rather than an error. Left alone that resolves as a successful track
    // with no events, and in the fan-out race it beats the vendor that actually
    // holds the shipment. An empty body is a miss, so it is thrown as one.
    if (!hasTrackingContent(data)) {
      throw new Error(`Shipmozo has no tracking for AWB ${request.awb}.`);
    }

    return data;
  }

  protected transformResponse(
    response: ShipmozoTrackData,
    awb: string,
  ): CanonicalTrackResult {
    const events: TrackingEvent[] = readShipmozoScans(response)
      .map((s) => {
        const status = readScanStatus(s);
        return {
          timestamp: toIso(readScanDate(s)),
          status: status || "Update",
          description: status || "",
          location: readScanLocation(s),
          eventType: mapShipmozoEventType(status),
          rawStatusCode: status || undefined,
        };
      })
      // Newest first — the canonical contract the UI relies on.
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

    // A just-assigned AWB carries a headline status and no scan history yet —
    // which is the NORMAL state of a live lookup, since scans only start once
    // the courier physically touches the parcel. "Pickup Pending" is a real,
    // showable answer, so it becomes the single event rather than an empty
    // timeline that reads as "we have no idea where your parcel is".
    const headline = response.current_status?.trim();
    if (events.length === 0 && headline) {
      events.push({
        timestamp: toIso(response.status_time),
        status: headline,
        description: "",
        location: "",
        eventType: mapShipmozoEventType(headline),
        rawStatusCode: headline,
      });
    }

    // Order-level state, which the movement statuses do not carry. A cancelled
    // order can still report "Pickup Pending" as its current status, and
    // showing only that would tell a customer their parcel is on its way when
    // the order behind it no longer exists.
    if (isShipmozoOrderCancelled(response.order_status)) {
      events.unshift({
        timestamp: toIso(response.status_time),
        status: "Order cancelled with the courier",
        description: "",
        location: "",
        eventType: "exception",
        rawStatusCode: response.order_status,
      });
    }

    const latestEvent = events[0] ?? null;
    const isDelivered =
      events.some((e) => e.eventType === "delivered") ||
      mapShipmozoEventType(response.current_status) === "delivered";

    return {
      vendorId: this.vendorId,
      vendorName: this.vendorName,
      shipmentInfo: {
        awb: response.awb_number?.trim() || awb,
        service: readShipmozoCarrier(response),
        shipDate: events.length ? events[events.length - 1].timestamp : undefined,
      },
      events,
      latestEvent,
      isDelivered,
    };
  }
}

/**
 * Did Shipmozo actually answer with a shipment?
 *
 * An unknown AWB is refused outright ("The selected awb number is invalid"),
 * which the client already throws on — but they also answer `result: 1` with an
 * empty body in some cases, and that would otherwise resolve as a successful
 * track with nothing in it, beating the vendor that really holds the parcel in
 * the fan-out race. Any one of an echoed AWB, a headline status or a scan line
 * proves they know it.
 */
function hasTrackingContent(data: ShipmozoTrackData | null | undefined): boolean {
  if (!data) return false;
  return Boolean(
    data.awb_number?.trim() ||
      data.current_status?.trim() ||
      data.order_status?.trim() ||
      readShipmozoScans(data).length > 0,
  );
}

/** "2025-07-14 09:12:16" (IST, no zone) → ISO-8601 UTC. */
function toIso(date: string | undefined): string {
  const raw = date?.trim();
  if (!raw) return new Date().toISOString();
  // Interpret as IST; Shipmozo timestamps carry no timezone.
  const parsed = new Date(`${raw.replace(" ", "T")}+05:30`);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

