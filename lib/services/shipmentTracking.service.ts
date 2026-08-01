import "server-only";

import { ShipmentStatus } from "@/generated/prisma";
import type {
  CanonicalTrackResponse,
  CanonicalTrackResult,
  TrackingEvent,
  TrackingLegSummary,
} from "@/lib/tracking-adapters/core/tracking.types";
import { trackShipment } from "@/lib/services/tracking.services";
import { trackingAdapterRegistry } from "@/lib/tracking-adapters/vendors/tracking.index";
import { buildInternalTimeline } from "@/lib/tracking/internalTimeline";
import {
  looksLikeShipmentNumber,
  resolveTrackedShipment,
  type ResolvedShipment,
  type TrackingLegPlan,
  type TrackingScope,
} from "@/lib/tracking/shipmentResolve";

/**
 * lib/services/shipmentTracking.service.ts
 *
 * The tracking page's entry point. One search box, three kinds of input:
 *
 *   ARN260130748291  our shipment number    → resolve, then track its legs
 *   1234567890       a waybill we booked    → same, matched on the AWB column
 *   1234567890       a waybill we did not   → ask the vendors directly
 *
 * The layer below (tracking.services.ts) knows only how to ask a vendor about
 * an AWB. This one knows what the number MEANS: which vendor holds it, whether
 * there are two legs to stitch together, and what to show while no carrier has
 * scanned anything yet.
 */

export interface TrackQuery {
  query: string;
  scope: TrackingScope;
}

export async function trackByQuery({
  query,
  scope,
}: TrackQuery): Promise<CanonicalTrackResponse> {
  const trimmed = query.trim();

  if (!trimmed) {
    return failure("Enter a shipment number or AWB to track.");
  }

  const shipment = await resolveTrackedShipment(trimmed, scope);

  if (shipment) return trackResolvedShipment(shipment, scope);

  // Not ours. An ARN-shaped miss is a genuine dead end — no carrier issues
  // numbers in our format, so there is nothing left to ask.
  if (looksLikeShipmentNumber(trimmed)) {
    return failure(
      scope.kind === "org"
        ? `No booking found under ${trimmed.toUpperCase()} on this account.`
        : `No booking found under ${trimmed.toUpperCase()}.`,
    );
  }

  // A carrier AWB Arena never booked — a customer legitimately has these.
  // Fan out to every vendor and return whichever one recognises it.
  const response = await trackShipment({ awb: trimmed });

  if (!response.result && scope.kind === "org") {
    // The vendor's own words name the vendor: "Shipmozo track-order error: the
    // selected awb number is invalid". Customers are not shown who we source
    // from (carrierBranding.md), and "invalid" is the vendor's opinion of a
    // number that may simply belong to a carrier we do not use. Arena staff
    // keep the raw text, because for them it is the diagnostic.
    return failure(`No tracking information found for ${trimmed}.`);
  }

  return response;
}

// --- One of our bookings -----------------------------------------------------

async function trackResolvedShipment(
  shipment: ResolvedShipment,
  scope: TrackingScope,
): Promise<CanonicalTrackResponse> {
  // Legs are independent lookups against different vendors — run them together
  // so a two-leg international shipment is no slower than a one-leg domestic.
  const fetched = await Promise.all(
    shipment.legs.map((leg) => fetchLeg(leg)),
  );

  const events: TrackingEvent[] = [];
  const legSummaries: TrackingLegSummary[] = [];
  let main: CanonicalTrackResult | null = null;

  for (const { leg, result, error } of fetched) {
    const legEvents = (result?.events ?? []).map((e) => labelEvent(e, leg));
    events.push(...legEvents);

    if (leg.kind === "main" && result) main = result;

    legSummaries.push({
      kind: leg.kind,
      label: leg.label,
      awb: leg.awb,
      carrier: leg.carrier ?? result?.shipmentInfo.service,
      eventCount: legEvents.length,
      // Same rule as above: the vendor's raw complaint is a diagnostic for ops,
      // not something a customer should read off a tracking page.
      error: error
        ? scope.kind === "arena"
          ? error
          : "No updates from the carrier yet."
        : undefined,
    });
  }

  // Nothing scanned anywhere yet — or every leg is still waiting on a waybill.
  // Fall back to our own record so a freshly booked shipment still tracks.
  const usedInternal = events.length === 0;
  if (usedInternal) {
    events.push(...(await buildInternalTimeline(shipment.id)));
    legSummaries.push({
      kind: "internal",
      label: "Arena",
      awb: null,
      eventCount: events.length,
    });
  }

  events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  const primaryLeg = shipment.legs.find((l) => l.kind === "main") ?? shipment.legs[0];

  return {
    success: true,
    result: {
      vendorId: main?.vendorId ?? "arena",
      vendorName: main?.vendorName ?? "Arena Logistics",
      shipmentInfo: {
        // The waybill headlines the card when there is one; before that, our
        // own number does, because the customer needs SOMETHING to read back.
        awb: primaryLeg?.awb ?? shipment.shipmentNumber,
        reference: shipment.shipmentNumber,
        route: shipment.route,
        carrier: shipment.carrier ?? undefined,
        service: main?.shipmentInfo.service ?? shipment.carrier ?? undefined,
        weight: main?.shipmentInfo.weight ?? shipment.weightKg,
        numberOfPieces: main?.shipmentInfo.numberOfPieces ?? shipment.pieces,
        destination: main?.shipmentInfo.destination,
        shipDate:
          main?.shipmentInfo.shipDate ?? shipment.bookedAt?.toISOString(),
      },
      events,
      latestEvent: events[0] ?? null,
      // Only the main leg can deliver a shipment. A first-mile "Delivered" means
      // it reached our hub (see normaliseFirstMile below), and our own status is
      // the authority when no carrier is reporting at all.
      isDelivered:
        (main?.isDelivered ?? false) ||
        shipment.status === ShipmentStatus.DELIVERED,
      legs: legSummaries,
    },
  };
}

interface FetchedLeg {
  leg: TrackingLegPlan;
  result: CanonicalTrackResult | null;
  error?: string;
}

/**
 * Ask one vendor about one waybill.
 *
 * Goes straight to the adapter recorded on the shipment when there is one. When
 * the vendor has no tracking adapter (a rate vendor we can quote but not track,
 * like ShipGlobal today) it falls back to the blind fan-out rather than
 * reporting nothing — one of the registered vendors may still recognise the AWB.
 */
async function fetchLeg(leg: TrackingLegPlan): Promise<FetchedLeg> {
  const hasAdapter = !!leg.vendorId && !!trackingAdapterRegistry.get(leg.vendorId);

  const response = await trackShipment({
    awb: leg.awb,
    vendorId: hasAdapter ? leg.vendorId! : undefined,
    leg: leg.kind,
  });

  return {
    leg,
    result: response.result,
    error: response.result ? undefined : response.error?.message,
  };
}

/** Stamp the leg onto an event, and correct what a first-mile status means. */
function labelEvent(event: TrackingEvent, leg: TrackingLegPlan): TrackingEvent {
  return {
    ...event,
    ...(leg.kind === "first_mile" ? normaliseFirstMile(event) : {}),
    leg: leg.kind,
    legLabel: leg.label,
  };
}

/**
 * On the door → hub leg the courier's destination is OUR hub, not the customer's
 * receiver. So Shipmozo's "Delivered" and "Out for delivery" describe a parcel
 * arriving at Arena, and copying them through unchanged would light up the
 * delivered stage on a shipment that has not even flown yet. Both are demoted
 * to in-transit; the status text is left exactly as the courier wrote it, since
 * the leg label already says which journey it belongs to.
 */
function normaliseFirstMile(event: TrackingEvent): Partial<TrackingEvent> {
  if (event.eventType === "delivered" || event.eventType === "out_for_delivery") {
    return { eventType: "in_transit" };
  }
  return {};
}

function failure(message: string): CanonicalTrackResponse {
  return {
    success: false,
    result: null,
    error: { vendorId: "arena", vendorName: "Arena Logistics", message },
  };
}

/** Re-exported so callers need only this module. */
export type { TrackingScope };
