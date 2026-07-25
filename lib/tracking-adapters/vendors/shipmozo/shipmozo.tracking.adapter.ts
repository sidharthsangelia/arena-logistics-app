/**
 * SHIPMOZO TRACKING ADAPTER
 * -----------------------------------------------------------------------------
 * Tracks a domestic (first-mile) shipment by AWB via Shipmozo's GET
 * /track-order. Translates Shipmozo's `status_feed.scan[]` into the canonical
 * tracking timeline every other vendor adapter produces.
 *
 * The webhook (app/api/webhooks/shipmozo) receives the very same body shape and
 * advances the first-mile leg directly; this adapter is the pull counterpart,
 * used by the generic /track UI and any on-demand refresh.
 */

import { BaseTrackingAdapter } from "../../core/base.tracking.adapter";
import type {
  CanonicalTrackRequest,
  CanonicalTrackResult,
  TrackingEvent,
  TrackingEventType,
} from "../../core/tracking.types";
import { trackOrder } from "@/lib/shipmozo/client";
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

  protected callVendorApi(
    request: ShipmozoTrackRequest,
  ): Promise<ShipmozoTrackData> {
    return trackOrder(request.awb);
  }

  protected transformResponse(
    response: ShipmozoTrackData,
    awb: string,
  ): CanonicalTrackResult {
    const scan = response.status_feed?.scan ?? [];

    const events: TrackingEvent[] = scan
      .map((s) => ({
        timestamp: toIso(s.date),
        status: s.status?.trim() || "Update",
        description: s.status?.trim() || "",
        location: s.location?.trim() || "",
        eventType: mapEventType(s.status),
        rawStatusCode: s.status?.trim() || undefined,
      }))
      // Newest first — the canonical contract the UI relies on.
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

    const latestEvent = events[0] ?? null;
    const isDelivered =
      events.some((e) => e.eventType === "delivered") ||
      mapEventType(response.current_status) === "delivered";

    return {
      vendorId: this.vendorId,
      vendorName: this.vendorName,
      shipmentInfo: {
        awb: response.awb_number?.trim() || awb,
        service: response.carrier?.trim() || undefined,
        shipDate: events.length ? events[events.length - 1].timestamp : undefined,
      },
      events,
      latestEvent,
      isDelivered,
    };
  }
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

function mapEventType(status: string | undefined): TrackingEventType {
  const s = (status ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("delivered")) return "delivered";
  if (s.includes("out for delivery")) return "out_for_delivery";
  if (s.includes("out for pickup") || s.includes("pickup scheduled") || s.includes("pickup assigned"))
    return "booked";
  if (s.includes("picked up") || s.includes("pickup done")) return "picked_up";
  if (
    s.includes("in transit") ||
    s.includes("in-transit") ||
    s.includes("received at facility") ||
    s.includes("reached") ||
    s.includes("dispatched") ||
    s.includes("bag")
  )
    return "in_transit";
  if (s.includes("rto") || s.includes("return")) return "returned";
  if (s.includes("undelivered") || s.includes("failed") || s.includes("attempt"))
    return "attempted";
  if (s.includes("cancel") || s.includes("exception") || s.includes("hold"))
    return "exception";
  if (s.includes("manifest") || s.includes("booked") || s.includes("pending"))
    return "booked";
  return "unknown";
}
