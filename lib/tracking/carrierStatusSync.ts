import "server-only";

import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { ShipmentMode, type ShipmentStatus } from "@/generated/prisma";
import { applyCarrierStatus } from "@/lib/booking/domesticStatusTransition";
import { notifyCarrierProblem } from "@/lib/notifications/emit";
import {
  deriveCarrierStatus,
  isCarrierSyncEligible,
  shouldAdvance,
} from "./carrierStatus";
import type { LiveTracking } from "./liveTracking.types";

/**
 * lib/tracking/carrierStatusSync.ts
 *
 * Moves a shipment's own status from what its carrier is reporting, so a
 * parcel the carrier has delivered stops reading "Booked" without ops having
 * to notice and click. Only Shipmozo ever pushed this to us; every other
 * carrier relied on a person.
 *
 * Three callers, one rule set:
 *   - the detail page, when the scans it just showed are ahead of the status
 *     (syncShipmentStatusAction, fired by the history panel)
 *   - the Refresh button on that panel
 *   - the 4-hourly job, for shipments nobody is looking at
 *     (lib/inngest/functions/syncCarrierTracking.ts)
 *
 * The transition itself is applyCarrierStatus: forward-only, never touches a
 * parked status, records history, sends the milestone email once. Problem
 * scans never move anything; they raise one ops alert each.
 *
 * It takes a tracking answer rather than fetching one, so every caller reuses
 * the cached lookup it already has and the carrier is asked once.
 */

export interface CarrierSyncOutcome {
  changed: boolean;
  /** The status the shipment moved to, when it moved. */
  status: ShipmentStatus | null;
  problemRaised: boolean;
}

const NO_CHANGE: CarrierSyncOutcome = {
  changed: false,
  status: null,
  problemRaised: false,
};

export async function syncShipmentStatusFromTracking(
  shipmentNumber: string,
  live: LiveTracking,
): Promise<CarrierSyncOutcome> {
  if (live.state !== "ok" || live.events.length === 0) return NO_CHANGE;

  const verdict = deriveCarrierStatus(live.events);
  if (!verdict.target && !verdict.problem) return NO_CHANGE;

  const shipment = await prisma.shipment.findUnique({
    where: { shipmentNumber: shipmentNumber.trim().toUpperCase() },
    select: {
      id: true,
      shipmentNumber: true,
      status: true,
      mode: true,
      bookedAt: true,
      createdAt: true,
    },
  });
  if (!shipment) return NO_CHANGE;

  // Old trials and long-dead bookings: shown, never moved, never alerted on.
  if (!isCarrierSyncEligible(shipment.bookedAt, shipment.createdAt)) {
    return NO_CHANGE;
  }

  let changed = false;
  let status: ShipmentStatus | null = null;

  if (shouldAdvance(shipment.status, verdict.target) && verdict.source) {
    const scan = verdict.source;
    const result = await applyCarrierStatus(shipment.id, verdict.target, {
      changedByType: "SYSTEM",
      note: `From carrier tracking: ${scan.status}${
        scan.location ? `, ${scan.location}` : ""
      }`,
    });

    if (result.success && result.changed) {
      changed = true;
      status = verdict.target;
    } else if (!result.success) {
      Sentry.captureMessage("Carrier status sync could not apply", {
        level: "warning",
        tags: { location: "syncShipmentStatusFromTracking" },
        extra: { shipmentNumber, target: verdict.target, message: result.message },
      });
    }
  }

  let problemRaised = false;
  if (verdict.problem) {
    const scan = verdict.problem;
    problemRaised = await notifyCarrierProblem({
      shipmentId: shipment.id,
      shipmentNumber: shipment.shipmentNumber,
      isDomestic: shipment.mode === ShipmentMode.DOMESTIC,
      eventType: scan.eventType,
      scanStatus: scan.status,
      scanLocation: scan.location,
      scanTimestamp: scan.timestamp,
    });
  }

  return { changed, status, problemRaised };
}
