import { ShipmentStatus } from "@/generated/prisma";

/**
 * lib/shipmozo/domesticStatusMap.ts
 *
 * Translates Shipmozo's free-text courier statuses into our own ShipmentStatus
 * for a DOMESTIC booking — where the courier's journey IS the shipment's
 * journey, so their "Delivered" is a real delivery to the customer's receiver.
 *
 * Contrast lib/shipmozo/firstMileStatusMap.ts, which reads the very same words
 * off the very same feed and means something different by them: on an
 * international booking Shipmozo only carries the parcel from the sender's door
 * to our hub, so its "Delivered" means "arrived at Arena". Two maps, because
 * one map with a mode flag would be one edit away from telling a customer their
 * shipment was delivered when it had merely reached our warehouse.
 *
 * No `server-only`: the webhook and any future poller both read it.
 */

// Order matters. "Out for delivery" must be tested before the transit bucket,
// and "delivered" before everything, because the strings overlap.
const RULES: Array<{ match: (s: string) => boolean; status: ShipmentStatus }> = [
  {
    match: (s) => s.includes("delivered"),
    status: ShipmentStatus.DELIVERED,
  },
  {
    match: (s) => s.includes("out for delivery"),
    status: ShipmentStatus.OUT_FOR_DELIVERY,
  },
  {
    match: (s) =>
      s.includes("picked up") ||
      s.includes("pickup done") ||
      s.includes("in transit") ||
      s.includes("in-transit") ||
      s.includes("received at facility") ||
      s.includes("reached") ||
      s.includes("dispatched") ||
      s.includes("bag"),
    status: ShipmentStatus.IN_TRANSIT,
  },
  {
    match: (s) =>
      s.includes("pickup scheduled") ||
      s.includes("out for pickup") ||
      s.includes("pickup assigned") ||
      s.includes("manifest") ||
      s.includes("booked") ||
      s.includes("pending"),
    status: ShipmentStatus.BOOKED,
  },
];

/**
 * How far along a status is. Only the happy path is ranked: these are the five
 * states this feed is allowed to move a shipment through, in order.
 *
 * Anything absent — CANCELLED, ON_HOLD, CUSTOMS_HOLD, DOCUMENTS_PENDING — is a
 * decision a person made, and an automated feed must not overwrite it. A
 * shipment ops put ON_HOLD stays on hold until ops say otherwise, however
 * cheerfully the courier keeps scanning it.
 */
const RANK: Partial<Record<ShipmentStatus, number>> = {
  [ShipmentStatus.BOOKED]: 0,
  [ShipmentStatus.PROCESSING]: 1,
  [ShipmentStatus.IN_TRANSIT]: 2,
  [ShipmentStatus.OUT_FOR_DELIVERY]: 3,
  [ShipmentStatus.DELIVERED]: 4,
};

/**
 * Map one Shipmozo status line, or null when it carries no forward signal.
 *
 * Null covers the lines that need a human: RTO and returns, failed delivery
 * attempts, NDRs, cancellations, exceptions. None of them fit the linear
 * lifecycle, and guessing at one would either hide a problem or announce a
 * delivery that did not happen.
 */
export function mapShipmozoStatusToShipment(
  status: string | null | undefined,
): ShipmentStatus | null {
  const s = (status ?? "").toLowerCase().trim();
  if (!s) return null;

  // Explicitly excluded before the rules run: "Undelivered - RTO initiated"
  // contains "delivered" as a substring, and would otherwise read as delivery.
  if (
    s.includes("rto") ||
    s.includes("return") ||
    s.includes("undelivered") ||
    s.includes("not delivered") ||
    s.includes("cancel") ||
    s.includes("exception") ||
    s.includes("failed") ||
    s.includes("attempt")
  ) {
    return null;
  }

  for (const rule of RULES) {
    if (rule.match(s)) return rule.status;
  }
  return null;
}

/**
 * Given Shipmozo's headline `current_status` plus its `status_feed.scan[]`,
 * the FURTHEST status the parcel has provably reached, or null if none maps.
 *
 * Every line is read, not just the headline: a scan history that clearly shows
 * a delivery should still land even when the top-level wording is one we do not
 * recognise.
 */
export function furthestShipmentStatus(
  currentStatus: string | null | undefined,
  scanStatuses: Array<string | null | undefined>,
): ShipmentStatus | null {
  let best: ShipmentStatus | null = null;

  for (const candidate of [currentStatus, ...scanStatuses]) {
    const mapped = mapShipmozoStatusToShipment(candidate);
    if (!mapped) continue;
    if (best === null || shipmentStatusRank(mapped) > shipmentStatusRank(best)) {
      best = mapped;
    }
  }

  return best;
}

/**
 * Position on the automated happy path, or -1 for a status this feed does not
 * drive. Callers compare ranks to keep movement forward-only, so -1 on the
 * CURRENT status is the signal to leave a shipment alone entirely.
 */
export function shipmentStatusRank(status: ShipmentStatus): number {
  return RANK[status] ?? -1;
}

/** Can an automated courier feed move a shipment that is currently here? */
export function isAutoAdvanceable(status: ShipmentStatus): boolean {
  return shipmentStatusRank(status) >= 0;
}
