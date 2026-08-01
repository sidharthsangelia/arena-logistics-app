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
   * Which leg of the journey this request covers, when the caller already knows
   * (resolved from our own shipment record). Adapters ignore it; the merge step
   * uses it to label every event it copies out of the result, so a customer can
   * see which events belong to the door pickup and which to the main carrier.
   */
  leg?: TrackingLegKind;

  /**
   * Optional hint to the service layer. When omitted, the service fans the
   * request out to all registered adapters and returns the first success.
   * When provided, only that vendor's adapter is called.
   */
  vendorId?: string;
}

/**
 * Which leg of a shipment a set of events describes.
 *
 *   first_mile — door → carrier hub, the domestic courier on an international
 *                booking (Shipmozo)
 *   main       — the carrier that actually moves the shipment: the international
 *                air leg, or the door → door domestic courier
 *   internal   — Arena's own booking lifecycle, from the shipment's status
 *                history. What we can show before any carrier has scanned it.
 */
export type TrackingLegKind = "first_mile" | "main" | "internal";

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

  /**
   * Which leg produced this event. Set only when a shipment's legs were merged
   * into one timeline; a single-vendor AWB lookup leaves it undefined, because
   * there is nothing to tell apart.
   */
  leg?: TrackingLegKind;

  /** Short human label for the leg, e.g. "Door pickup". Set alongside `leg`. */
  legLabel?: string;
}

/**
 * High-level metadata about the shipment itself.
 * All fields are optional — vendors expose different subsets.
 */
export interface ShipmentInfo {
  awb: string;

  /**
   * Arena's own shipment number, e.g. "ARN260130748291". Present only when the
   * search resolved to a booking of ours — a bare AWB lookup against a carrier
   * has no reference to report.
   */
  reference?: string;

  /** Where it is going, as "City, State" / "City, Country". */
  route?: string;

  /** Courier or carrier actually carrying it, when we know it from our record. */
  carrier?: string;

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

  /**
   * The legs behind this timeline, in journey order. Present only on a merged
   * result, so the UI can show "Door pickup · Delhivery · 1234567890" next to
   * "Air leg · Emirates · 176-12345678" instead of one anonymous AWB.
   */
  legs?: TrackingLegSummary[];
}

/** One leg of a merged timeline. */
export interface TrackingLegSummary {
  kind: TrackingLegKind;
  /** e.g. "Door pickup", "Air leg", "Courier". */
  label: string;
  /** The waybill for this leg. Null on the internal leg, which has none. */
  awb: string | null;
  /** Who carries it, when known, e.g. "Delhivery". */
  carrier?: string;
  /** How many events this leg contributed. */
  eventCount: number;
  /**
   * Why a leg produced nothing. Present only when the leg had a waybill and the
   * vendor still failed, so ops can tell "no scans yet" from "the lookup broke".
   */
  error?: string;
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