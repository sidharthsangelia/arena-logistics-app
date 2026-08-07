/**
 * lib/speedopost/trackShape.ts
 * -----------------------------------------------------------------------------
 * Reading SpeedoPost's tracking feed: what a scan means, and when it happened.
 *
 * Kept out of the adapter and free of imports from it so it can be unit tested
 * directly, which matters more here than anywhere else in the integration. The
 * expensive mistakes in this repo have all been status-reading mistakes:
 *
 *   "Undelivered" contains the word "delivered". So does "RTO Delivered". A
 *   substring test in the obvious order announces a delivery on the day a
 *   parcel was refused. Every map here tests the UNHAPPY words first, the same
 *   rule lib/shipmozo/trackShape.ts follows and utils/shipmozoTracking.test.ts
 *   pins down.
 *
 * ── ON THE STATUS CODES ─────────────────────────────────────────────────────
 * SpeedoPost publishes no enum. Their documentation shows exactly four codes,
 * from one example response, with an explicit note that the list is partial.
 * So the code map below is a fast path for the four we have actually seen, and
 * the free-text reading underneath it is what carries every code we have not.
 * Adding a code here is a refinement, never a fix for something broken.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { TrackingEventType } from "@/lib/tracking-adapters/core/tracking.types";
import type { SpeedoPostPacketHistoryEntry } from "./types";

/** The four codes their documentation actually evidences. */
const STATUS_CODE_MAP: Record<string, TrackingEventType> = {
  "10001": "booked",
  "10003": "in_transit",
  "10006": "out_for_delivery",
  "10007": "delivered",
};

/**
 * Movement direction on a scan. "FWD" is the only value the doc shows, but a
 * return leg has to report something, so it is read rather than assumed.
 */
const RETURN_TYPES = new Set(["RTO", "RVP", "REV", "RET", "RETURN", "REVERSE"]);

/**
 * Phrases that mean the parcel did NOT arrive, tested before anything else.
 * Order within the list is irrelevant; order relative to the happy words is
 * the whole point.
 */
const UNHAPPY_PATTERNS: { pattern: RegExp; type: TrackingEventType }[] = [
  // Returns first: "RTO Delivered" is a return that completed, not a delivery.
  { pattern: /\brto\b|return to origin|returned to (origin|shipper|sender)/i, type: "returned" },
  { pattern: /\breturn(ed|ing)?\b|\brvp\b/i, type: "returned" },

  // Failed attempts.
  { pattern: /un[\s-]?delivered|not delivered|delivery failed|failed delivery/i, type: "attempted" },
  { pattern: /attempt|reattempt|re-attempt|consignee (not available|refused)|address issue/i, type: "attempted" },

  // Hard stops.
  { pattern: /cancel/i, type: "exception" },
  { pattern: /\bhold\b|on hold|customs|seiz|damag|lost|misroute|exception|discrepan/i, type: "exception" },
];

/** Phrases that mean progress, read only once nothing unhappy matched. */
const HAPPY_PATTERNS: { pattern: RegExp; type: TrackingEventType }[] = [
  { pattern: /\bdeliver(ed|y done)\b|shipment delivered|pod\b/i, type: "delivered" },
  { pattern: /out for delivery|ofd\b|dispatched for delivery/i, type: "out_for_delivery" },
  { pattern: /in[\s-]?transit|bag added|in scan|out scan|reached|arriv|depart|forward|connect/i, type: "in_transit" },
  { pattern: /picked|pickup done|collected/i, type: "picked_up" },
  { pattern: /pickup (pending|scheduled|awaited)|awaiting pickup|manifest/i, type: "booked" },
  { pattern: /booked|order (created|placed|received)|soft data/i, type: "booked" },
];

/**
 * Canonical event type for one SpeedoPost scan.
 *
 * Resolution order, and why:
 *   1. A return-direction scan is a return whatever its words say. "Delivered"
 *      on an RTO leg means the parcel got back to the sender.
 *   2. Unhappy words, before any code lookup — a feed that says "Undelivered"
 *      while carrying the delivered code is describing a failure.
 *   3. The documented code map, for the four codes we can vouch for.
 *   4. Happy words, which carry every code they have never published.
 */
export function mapSpeedoPostEventType(
  status: string | null | undefined,
  statusCode?: string | number | null,
  type?: string | null,
): TrackingEventType {
  const text = (status ?? "").trim();
  const direction = (type ?? "").trim().toUpperCase();

  if (direction && RETURN_TYPES.has(direction)) return "returned";

  for (const { pattern, type: eventType } of UNHAPPY_PATTERNS) {
    if (pattern.test(text)) return eventType;
  }

  const code = statusCode == null ? "" : String(statusCode).trim();
  const mapped = STATUS_CODE_MAP[code];
  if (mapped) return mapped;

  for (const { pattern, type: eventType } of HAPPY_PATTERNS) {
    if (pattern.test(text)) return eventType;
  }

  return "unknown";
}

/**
 * "2023-06-17 15:16:51" → ISO-8601 UTC.
 *
 * SpeedoPost timestamps carry no timezone and their operation is Indian, so
 * they are read as IST. Getting this wrong shifts every scan by five and a half
 * hours, which reorders a same-day timeline.
 *
 * An unparseable or missing date falls back to "now" rather than being dropped:
 * a scan with a broken timestamp is still a scan, and hiding it loses real
 * information about the parcel.
 */
export function toIsoFromIst(date: string | null | undefined): string {
  const raw = (date ?? "").trim();
  if (!raw) return new Date().toISOString();

  // Already carries a zone (ends in Z or ±HH:MM) — trust it.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const candidate = hasZone ? raw : `${raw.replace(" ", "T")}+05:30`;

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

/** A scan's location, with SpeedoPost's nulls and placeholders flattened away. */
export function readScanLocation(
  entry: SpeedoPostPacketHistoryEntry,
): string {
  const location = (entry.location ?? "").trim();
  if (!location || /^(na|n\/a|null|-)$/i.test(location)) return "";
  return location;
}

/**
 * A scan's description. `remarks` is the fuller sentence ("Bag Added To Trip")
 * where `status` is the label ("Order In-transit"), so remarks is preferred and
 * the label is the fallback. A remark identical to the label adds nothing and
 * is dropped so the UI does not print the same words twice.
 */
export function readScanDescription(
  entry: SpeedoPostPacketHistoryEntry,
): string {
  const remarks = (entry.remarks ?? "").trim();
  const status = (entry.status ?? "").trim();
  if (!remarks) return "";
  return remarks.toLowerCase() === status.toLowerCase() ? "" : remarks;
}

/** Delivered per the FORWARD leg only. An RTO delivery is not a delivery. */
export function isForwardDelivery(
  entry: SpeedoPostPacketHistoryEntry,
): boolean {
  return (
    mapSpeedoPostEventType(entry.status, entry.statusCode, entry.type) ===
    "delivered"
  );
}
