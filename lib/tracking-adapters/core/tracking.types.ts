/**
 * CANONICAL TRACKING TYPES
 * -----------------------------------------------------------------------------
 * These are the "language" the entire tracking feature speaks internally.
 * Every vendor tracking adapter MUST translate FROM these types (input) and
 * translate TO these types (output). Vendor-specific shapes never leak outside
 * their own folder.
 *
 * Design principle: the canonical layer is intentionally richer than any single
 * vendor's response. Adapters populate what they can and leave the rest null.
 * The UI layer always reads from canonical types — never from vendor shapes.
 */

// --- INPUT -------------------------------------------------------------------

/**
 * The single, unified input shape for any tracking request.
 */
export interface CanonicalTrackRequest {
  /** The airway-bill / tracking number */
  awb: string;

  /**
   * Optional hint to the service layer. When omitted, the service fans the
   * request out to all registered adapters and returns the first success.
   * When provided, only that vendor's adapter is called.
   */
  vendorId?: string;
}

// --- OUTPUT ------------------------------------------------------------------

/**
 * Broad category for a tracking event. Used to drive UI icons / colours.
 * Adapters must map their vendor-specific codes to one of these.
 */
export type TrackingEventType =
  | "booked"        // shipment record created
  | "picked_up"     // collected from sender
  | "in_transit"    // moving between hubs
  | "out_for_delivery" // last-mile dispatch
  | "delivered"     // successfully handed over
  | "attempted"     // delivery attempt failed
  | "exception"     // customs hold, damage, etc.
  | "returned"      // being sent back to origin
  | "unknown";      // anything that doesn't fit above

/**
 * One entry in the shipment timeline.
 */
export interface TrackingEvent {
  /** ISO-8601 string, e.g. "2024-08-22T09:42:28.000Z". Never a raw vendor string. */
  timestamp: string;

  /** Short human-readable label, e.g. "Shipment Booked", "Out for Delivery" */
  status: string;

  /** Longer description if available */
  description: string;

  /** City / facility name, e.g. "BOM - HUB, India" */
  location: string;

  /** Normalised event category for UI rendering */
  eventType: TrackingEventType;

  /**
   * The raw status code from the vendor, preserved for debugging.
   * Never shown in production UI.
   */
  rawStatusCode?: string;
}

/**
 * High-level metadata about the shipment itself.
 * All fields are optional — vendors expose different subsets.
 */
export interface ShipmentInfo {
  awb: string;
  /** ISO-8601 string */
  shipDate?: string;
  /** e.g. "Aramex UPS MUM", "DHL Express" */
  service?: string;
  /** Weight in KG */
  weight?: number;
  numberOfPieces?: number;
  /** e.g. "CANADA", "AUSTRALIA" */
  destination?: string;
  /** ISO 2-letter origin country code */
  originCountryCode?: string;
}

/**
 * The complete canonical tracking result for one shipment.
 */
export interface CanonicalTrackResult {
  /** Mirrors the vendorId of the adapter that resolved this */
  vendorId: string;
  vendorName: string;

  /** Summary shipment metadata */
  shipmentInfo: ShipmentInfo;

  /**
   * Timeline of events, ALWAYS sorted newest-first so the UI can just render
   * the array top-to-bottom without sorting itself.
   */
  events: TrackingEvent[];

  /**
   * The latest / most meaningful event. Convenience field — equals events[0]
   * after sorting. Null only when events is empty.
   */
  latestEvent: TrackingEvent | null;

  /**
   * True when the shipment has a delivered event.
   * Lets the UI flip to "completed" state without inspecting the event list.
   */
  isDelivered: boolean;
}

/**
 * Unified API response shape returned to the client.
 */
export interface CanonicalTrackResponse {
  success: boolean;
  result: CanonicalTrackResult | null;
  error?: TrackingVendorError;
}

export interface TrackingVendorError {
  vendorId: string;
  vendorName: string;
  message: string;
  /** Raw error for server-side debugging. Never serialised to client responses. */
  raw?: unknown;
}