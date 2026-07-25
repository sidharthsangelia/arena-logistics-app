import { FirstMileStatus } from "@/generated/prisma";
import { firstMileStageIndex } from "@/lib/booking/firstMileStatus";

/**
 * lib/shipmozo/firstMileStatusMap.ts
 *
 * Translates Shipmozo's free-text tracking statuses into our four-stage
 * first-mile lifecycle. Shared (no `server-only`) by the tracking webhook, the
 * tracking adapter, and the ops booking action so all three read a Shipmozo
 * scan the same way.
 *
 * Direction note: for the first-mile leg the parcel is collected from the
 * customer and DELIVERED to our carrier hub, so a Shipmozo "Delivered" is our
 * ARRIVED_AT_HUB, not a customer delivery.
 */

// Matched on a lowercased, trimmed status. Order matters only within a bucket;
// the caller always keeps the FURTHEST stage seen, so overlap is harmless.
const RULES: Array<{ match: (s: string) => boolean; stage: FirstMileStatus }> = [
  // Terminal for our leg: reached the hub.
  {
    match: (s) => s.includes("delivered") || s.includes("received at facility"),
    stage: FirstMileStatus.ARRIVED_AT_HUB,
  },
  // Moving toward the hub.
  {
    match: (s) =>
      s.includes("in transit") ||
      s.includes("in-transit") ||
      s.includes("out for delivery") ||
      s.includes("reached") ||
      s.includes("bag") ||
      s.includes("dispatched"),
    stage: FirstMileStatus.IN_TRANSIT_TO_HUB,
  },
  // Collected from the customer's door.
  {
    match: (s) => s.includes("picked up") || s.includes("pickup done") || s === "picked up",
    stage: FirstMileStatus.PICKED_UP,
  },
  // Booked / courier on the way to collect — still the scheduled stage.
  {
    match: (s) =>
      s.includes("pickup scheduled") ||
      s.includes("out for pickup") ||
      s.includes("pickup assigned") ||
      s.includes("scheduled") ||
      s.includes("manifest") ||
      s.includes("booked") ||
      s.includes("pending"),
    stage: FirstMileStatus.SCHEDULED,
  },
];

/**
 * Maps a single Shipmozo status string to a first-mile stage, or null when it
 * carries no forward signal (e.g. an RTO/cancelled/exception line — those are
 * handled by ops by hand rather than auto-advancing the happy-path leg).
 */
export function mapShipmozoStatusToFirstMile(
  status: string | null | undefined,
): FirstMileStatus | null {
  const s = (status ?? "").toLowerCase().trim();
  if (!s) return null;
  for (const rule of RULES) {
    if (rule.match(s)) return rule.stage;
  }
  return null;
}

/**
 * Given Shipmozo's top-level `current_status` plus its `status_feed.scan[]`,
 * returns the FURTHEST first-mile stage the parcel has reached, or null if
 * nothing maps. Scanning every line (not just current_status) makes the result
 * robust to an unrecognised headline status when the scan history is clear.
 */
export function furthestFirstMileStage(
  currentStatus: string | null | undefined,
  scanStatuses: Array<string | null | undefined>,
): FirstMileStatus | null {
  let best: FirstMileStatus | null = null;
  let bestIdx = -1;

  const consider = (raw: string | null | undefined) => {
    const stage = mapShipmozoStatusToFirstMile(raw);
    if (!stage) return;
    const idx = firstMileStageIndex(stage);
    if (idx > bestIdx) {
      bestIdx = idx;
      best = stage;
    }
  };

  consider(currentStatus);
  for (const s of scanStatuses) consider(s);

  return best;
}
