/**
 * ARAMEX TRACKING ADAPTER
 * -----------------------------------------------------------------------------
 * Handles all Aramex tracking API communication and data transformation.
 *
 * Aramex tracking API quirks (vs Skart):
 *   - Uses the same ClientInfo auth block as the rate adapter
 *   - Accepts multiple AWBs in one request (we always send one)
 *   - Returns TrackingResults as a key-value array (Key = AWB, Value = events[])
 *   - UpdateCode maps to event types differently from Skart's status codes
 *   - Dates are already ISO-8601 — no parsing gymnastics needed
 *
 * STATUS: Stub — wire up callVendorApi once you have Aramex tracking credentials
 * and the endpoint URL. The transformRequest and transformResponse are complete.
 */

import { BaseTrackingAdapter } from "../../core/base.tracking.adapter";
import type {
  CanonicalTrackRequest,
  CanonicalTrackResult,
  TrackingEvent,
  TrackingEventType,
} from "../../core/tracking.types";
import type {
  AramexTrackRequest,
  AramexTrackResponse,
  AramexTrackingUpdate,
} from "./aramex.tracking.types";

// --- CONFIG ------------------------------------------------------------------

const ARAMEX_TRACK_URL =
  process.env.ARAMEX_TRACK_API_URL ??
  "https://ws.aramex.net/ShippingAPI.V2/Tracking/Service_1_0.svc/json/TrackShipments";

// --- UPDATE CODE → EVENT TYPE MAP -------------------------------------------
// Aramex update codes → canonical TrackingEventType
// Extend as more codes are discovered in production.

const ARAMEX_CODE_MAP: Record<string, TrackingEventType> = {
  // Booking / received
  SH: "booked",
  RR: "picked_up",
  OR: "picked_up",

  // In transit
  IT: "in_transit",
  DP: "in_transit",
  OC: "in_transit",     // out of customs
  CC: "in_transit",     // cleared customs

  // Out for delivery
  OD: "out_for_delivery",

  // Delivered
  DL: "delivered",
  OK: "delivered",

  // Attempted / exception
  MX: "attempted",      // delivery exception
  UN: "attempted",      // unsuccessful delivery
  HX: "exception",
  DX: "exception",

  // Returned
  RTO: "returned",
};

// --- ADAPTER -----------------------------------------------------------------

export class AramexTrackingAdapter extends BaseTrackingAdapter<
  AramexTrackRequest,
  AramexTrackResponse
> {
  readonly vendorId = "aramex";
  readonly vendorName = "Aramex";

  // -- Step 1: Canonical → Vendor ------------------------------------------

  protected transformRequest(input: CanonicalTrackRequest): AramexTrackRequest {
    return {
      ClientInfo: {
        UserName: process.env.ARAMEX_USERNAME ?? "",
        Password: process.env.ARAMEX_PASSWORD ?? "",
        Version: "v1.0",
        AccountNumber: process.env.ARAMEX_ACCOUNT_NUMBER ?? "",
        AccountPin: process.env.ARAMEX_ACCOUNT_PIN ?? "",
        AccountEntity: process.env.ARAMEX_ACCOUNT_ENTITY ?? "BOM",
        AccountCountryCode: "IN",
        Source: 24,
      },
      Shipments: [input.awb],
      GetLastEventOnly: false,      // always fetch full history
    };
  }

  // -- Step 2: HTTP call ----------------------------------------------------

  protected async callVendorApi(
    request: AramexTrackRequest
  ): Promise<AramexTrackResponse> {
    const res = await fetch(ARAMEX_TRACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(
        `Aramex Tracking API returned ${res.status} ${res.statusText}`
      );
    }

    const json = (await res.json()) as AramexTrackResponse;

    if (json.HasErrors) {
      const messages = json.Notifications.map((n) => n.Message).join("; ");
      throw new Error(`Aramex Tracking API error: ${messages}`);
    }

    return json;
  }

  // -- Step 3: Vendor → Canonical ------------------------------------------

  protected transformResponse(
    response: AramexTrackResponse,
    awb: string
  ): CanonicalTrackResult {
    // Aramex wraps results in a Key/Value array; find the entry for our AWB
    const resultEntry = response.TrackingResults.find((r) => r.Key === awb);
    const trackedShipment = resultEntry?.Value?.[0];

    if (!trackedShipment) {
      return this.emptyResult(awb);
    }

    const events: TrackingEvent[] = (
      trackedShipment.TrackingUpdates ?? []
    ).map((u) => this.mapUpdate(u));

    // Sort newest-first
    events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const latestEvent = events[0] ?? null;
    const isDelivered = events.some((e) => e.eventType === "delivered");

    return {
      vendorId: this.vendorId,
      vendorName: this.vendorName,
      shipmentInfo: {
        awb,
        // Aramex tracking API doesn't return shipment metadata in the same call;
        // populate from the rate/booking layer if needed in the future.
      },
      events,
      latestEvent,
      isDelivered,
    };
  }

  // --- Private helpers -------------------------------------------------------

  private mapUpdate(update: AramexTrackingUpdate): TrackingEvent {
    return {
      timestamp: update.UpdateDateTime,   // already ISO-8601
      status: update.UpdateDescription,
      description:
        update.Comments || update.Reason || update.UpdateDescription,
      location: update.UpdateLocation,
      eventType: ARAMEX_CODE_MAP[update.UpdateCode] ?? "unknown",
      rawStatusCode: update.UpdateCode,
    };
  }

  private emptyResult(awb: string): CanonicalTrackResult {
    return {
      vendorId: this.vendorId,
      vendorName: this.vendorName,
      shipmentInfo: { awb },
      events: [],
      latestEvent: null,
      isDelivered: false,
    };
  }
}