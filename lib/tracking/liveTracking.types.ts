import type {
  TrackingEvent,
  TrackingLegSummary,
} from "@/lib/tracking-adapters/core/tracking.types";

/**
 * The carrier's own view of one of our shipments, as shown on the shipment
 * detail pages. Client-safe: no server-only imports, so the panel that renders
 * it and the action that refreshes it can both name it.
 *
 * This type is only the carrier's answer. Moving the shipment's own status
 * from it is lib/tracking/carrierStatusSync.ts.
 */
export interface LiveTracking {
  /**
   * no_waybill   nothing to ask a carrier about yet
   * ok           the carriers were asked (a leg may still report an error)
   * unavailable  the lookup timed out or threw; never cached
   */
  state: "no_waybill" | "ok" | "unavailable";
  /** Carrier scans only, newest first. Our own internal timeline is left out. */
  events: TrackingEvent[];
  /** One per waybill that was looked up. */
  legs: TrackingLegSummary[];
  isDelivered: boolean;
  /** ISO time the carriers were asked. Drives "Updated 5 min ago". */
  fetchedAt: string;
  /** Present when state is "unavailable". Safe to show the reader. */
  message?: string;
}

export interface RefreshTrackingResult {
  success: boolean;
  data: LiveTracking | null;
  /** The refresh moved the shipment's own status; the page should re-render. */
  statusChanged?: boolean;
  error?: string;
}
