import "server-only";

import { prisma } from "@/utils/db";
import { ShipmentStatus } from "@/generated/prisma";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import type {
  TrackingEvent,
  TrackingEventType,
} from "@/lib/tracking-adapters/core/tracking.types";

/**
 * lib/tracking/internalTimeline.ts
 *
 * Arena's own account of where a booking has got to, built from its status
 * history, in the same canonical shape a carrier feed produces.
 *
 * This exists because a customer who has just paid types their ARN number into
 * the tracker within minutes, and at that moment no carrier has scanned
 * anything — the courier order may still be queued, or ops may not have the
 * airway bill yet. Answering "not found" to somebody holding a confirmed
 * booking is the worst possible reply. So the timeline falls back to what we
 * know for certain: that we took the booking, and what has happened to it since.
 *
 * It is a fallback, never a supplement. The instant a carrier reports real
 * scans, those replace this entirely — two accounts of the same journey side by
 * side would only disagree.
 */

/** Status → canonical event category, for the progress bar and icons. */
const STATUS_EVENT_TYPE: Record<ShipmentStatus, TrackingEventType> = {
  DRAFT: "unknown",
  PENDING_PAYMENT: "unknown",
  BOOKED: "booked",
  PROCESSING: "booked",
  DOCUMENTS_PENDING: "exception",
  IN_TRANSIT: "in_transit",
  CUSTOMS_HOLD: "exception",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  CANCELLED: "exception",
  ON_HOLD: "exception",
};

/** Notes worth showing a customer even though the status did not move. */
const CUSTOMER_VISIBLE_NOTE = /^first-mile pickup:/i;

export async function buildInternalTimeline(
  shipmentId: string,
): Promise<TrackingEvent[]> {
  const history = await prisma.shipmentStatusEvent.findMany({
    where: { shipmentId },
    select: {
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    // A shipment accumulates a bounded number of these; the cap is only there
    // so a pathological row cannot drag the whole page down.
    take: 100,
  });

  return history
    .filter((e) => {
      // A real move always shows.
      if (e.fromStatus !== e.toStatus) return true;
      // Otherwise it is an ops annotation — AWB edits, internal notes — and
      // belongs on the booking detail page, not in a customer's tracking view.
      return CUSTOMER_VISIBLE_NOTE.test(e.note ?? "");
    })
    .map((e) => {
      const config = STATUS_CONFIG[e.toStatus];
      const moved = e.fromStatus !== e.toStatus;

      return {
        timestamp: e.createdAt.toISOString(),
        // When the status moved, the status IS the headline and the note is
        // detail. When it did not, the note is the only thing that happened.
        status: moved ? config.label : (e.note?.trim() || config.label),
        description: moved ? (e.note?.trim() || config.description) : "",
        location: "",
        eventType: STATUS_EVENT_TYPE[e.toStatus],
        leg: "internal" as const,
        legLabel: "Arena",
      };
    });
}
