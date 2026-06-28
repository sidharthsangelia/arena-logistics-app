/**
 * SKART TRACKING ADAPTER
 * -----------------------------------------------------------------------------
 * Handles all Skart Express tracking API communication and data transformation.
 *
 * Skart API quirks handled here (so nothing leaks upward):
 *   - Dates arrive as "YYYY-MM-DD HH:mm:ss" strings (not ISO-8601)
 *   - event_type "1" = booking events with extra tat_days / airwaybill_no fields
 *   - event_type "2" = transit events with weight/location fields
 *   - status_code can be a string ("SH014") or a number (90)
 *   - The track_data array is NOT sorted — we sort by timestamp here
 *   - update_location is "Network Update" when no meaningful location exists
 */

import { BaseTrackingAdapter } from "../../core/base.tracking.adapter";
import type {
  CanonicalTrackRequest,
  CanonicalTrackResult,
  TrackingEvent,
  TrackingEventType,
} from "../../core/tracking.types";
import type {
  SkartTrackRequest,
  SkartTrackResponse,
  SkartTrackEvent,
} from "./skart.tracking.types";

// --- CONFIG ------------------------------------------------------------------

const SKART_TRACK_URL =
  process.env.SKART_API_URL?.replace("rate-calculator", "track-shipment") ??
  "https://apiv2.skart-express.com/api/v1/booking/track-shipment";

const SKART_USERNAME = process.env.SKART_USERNAME ?? "";
const SKART_PASSWORD = process.env.SKART_PASSWORD ?? "";

// --- STATUS CODE → EVENT TYPE MAP -------------------------------------------
// Maps Skart's courier_status_code values to our canonical TrackingEventType.
// Add new codes here as you encounter them in the wild.

const STATUS_CODE_MAP: Record<string, TrackingEventType> = {
  // Booking
  "90": "booked",
  SH014: "booked",

  // Pickup / received at origin
  SH411: "picked_up",
  SH047: "picked_up",

  // In transit / processing
  SH001: "in_transit",
  SH022: "in_transit",
  SH382: "in_transit",

  // Customs
  SH041: "in_transit",

  // Out for delivery
  SH003: "out_for_delivery",

  // Delivered
  SH006: "delivered",
  SH007: "delivered",

  // Attempted / exception
  SH033: "attempted",
  SH034: "exception",
  SH035: "exception",

  // Returned
  SH019: "returned",
  SH020: "returned",

   // FedEx (via Skart relay)
  OC: "booked",          // Order created / info sent
  PU: "picked_up",       // Picked up
  IT: "in_transit",      // In transit / on the way
  AR: "in_transit",      // Arrived at facility
  DP: "in_transit",      // Departed facility
  CC: "in_transit",      // Customs cleared
  OD: "out_for_delivery",// On vehicle for delivery
  DL: "delivered",       // Delivered

  // Internal Skart hub status codes (event_type "1")
  "210": "in_transit",   // Handed over to carrier
  "300": "in_transit",   // Customs cleared
  "301": "in_transit",   // Shipping bill filed
  "302": "in_transit",   // TD received
  
};

/** Normalised "Network Update" placeholder location → empty string */
const PLACEHOLDER_LOCATIONS = new Set(["Network Update", "network update"]);

// --- ADAPTER -----------------------------------------------------------------

export class SkartTrackingAdapter extends BaseTrackingAdapter<
  SkartTrackRequest,
  SkartTrackResponse
> {
  readonly vendorId = "skart";
  readonly vendorName = "sKart Express";

  // -- Step 1: Canonical → Vendor ------------------------------------------

  protected transformRequest(input: CanonicalTrackRequest): SkartTrackRequest {
    return {
      user_name: SKART_USERNAME,
      password: SKART_PASSWORD,
      awb: input.awb,
    };
  }

  // -- Step 2: HTTP call ----------------------------------------------------

  protected async callVendorApi(
    request: SkartTrackRequest
  ): Promise<SkartTrackResponse> {
    const res = await fetch(SKART_TRACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "*/*" },
      body: JSON.stringify(request),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Skart Tracking API returned ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as SkartTrackResponse;

    if (json.statusCode !== 200) {
      throw new Error(`Skart Tracking API error: ${json.message}`);
    }

    return json;
  }

  // -- Step 3: Vendor → Canonical ------------------------------------------

  protected transformResponse(
    response: SkartTrackResponse,
    awb: string
  ): CanonicalTrackResult {
    const { extra_data, track_data } = response.data;

    // Map each vendor event to a canonical event
    const events: TrackingEvent[] = track_data.map((e) =>
      this.mapEvent(e)
    );

    // Sort newest-first so UI can render top-to-bottom without extra logic
    events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Deduplicate consecutive identical statuses (Skart sends duplicates)
    const deduplicated = this.deduplicateEvents(events);

    const latestEvent = deduplicated[0] ?? null;
    const isDelivered = deduplicated.some((e) => e.eventType === "delivered");

    return {
      vendorId: this.vendorId,
      vendorName: this.vendorName,
      shipmentInfo: {
        awb: extra_data.awb ?? awb,
        shipDate: extra_data.ship_date
          ? new Date(extra_data.ship_date).toISOString()
          : undefined,
        service: extra_data.service,
        weight: extra_data.weight,
        numberOfPieces: extra_data.no_of_pieces,
        destination: extra_data.destination,
      },
      events: deduplicated,
      latestEvent,
      isDelivered,
    };
  }

  // --- Private helpers -------------------------------------------------------

  /**
   * Convert one Skart event to the canonical shape.
   * Handles the two Skart event_type variants gracefully.
   */
 private mapEvent(event: SkartTrackEvent): TrackingEvent {
  const statusCode = String(event.courier_status_code ?? event.status_code ?? "");

  // Build location: prefer city + country, fall back to update_location
  const cityParts = [
    event.city?.trim(),
    event.country_name?.trim(),
  ].filter(Boolean);

  const rawLocation =
    cityParts.length > 0
      ? cityParts.join(", ")                          // "DALLAS, United States"
      : (event.update_location ?? "");

  const location = PLACEHOLDER_LOCATIONS.has(rawLocation) ? "" : rawLocation;

  // Use event_description if available, else remarks, else status
  const description =
    event.event_description?.trim() ||
    event.update_description?.trim() ||
    event.remarks?.trim() ||
    event.status;

  return {
    timestamp: this.parseSkartDate(event.date),
    status: event.status,
    description,
    location,
    eventType: STATUS_CODE_MAP[statusCode] ?? "unknown",
    rawStatusCode: statusCode,
  };
}

  /**
   * Skart dates arrive as "YYYY-MM-DD HH:mm:ss" (local, no timezone).
   * We treat them as UTC (the safest assumption for a server-side adapter).
   */
private parseSkartDate(dateStr: string): string {
  if (!dateStr || typeof dateStr !== "string") {
    console.warn(`[skart] missing date field`);
    return new Date(0).toISOString(); // epoch sentinel, clearly wrong in UI
  }

  const trimmed = dateStr.trim();

  // Already a valid ISO string (event_type "1" hub events) — use as-is
  if (trimmed.includes("T")) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Skart format: "YYYY-MM-DD HH:mm:ss" — treat as UTC
  const d = new Date(trimmed.replace(" ", "T") + "Z");
  if (!isNaN(d.getTime())) return d.toISOString();

  console.warn(`[skart] unparseable date string: "${dateStr}"`);
  return new Date(0).toISOString();
}
  /**
   * Remove back-to-back events with the same status code and location.
   * Skart frequently emits 2–3 identical events within a minute.
   */
  private deduplicateEvents(events: TrackingEvent[]): TrackingEvent[] {
    return events.filter((event, index) => {
      if (index === 0) return true;
      const prev = events[index - 1];
      return (
        event.rawStatusCode !== prev.rawStatusCode ||
        event.location !== prev.location
      );
    });
  }
}