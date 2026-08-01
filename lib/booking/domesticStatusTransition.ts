import "server-only";

import { after } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { ShipmentMode, ShipmentStatus } from "@/generated/prisma";
import { SHIPMENTS_LIST_TAG, SHIPMENTS_COUNTS_TAG } from "@/queries/shipments";
import { sendShipmentMilestoneEmail } from "@/lib/email/shipment/send";
import { notifyShipmentStatusChanged } from "@/lib/notifications/emit";
import {
  isAutoAdvanceable,
  shipmentStatusRank,
} from "@/lib/shipmozo/domesticStatusMap";

/**
 * lib/booking/domesticStatusTransition.ts
 *
 * Moves a DOMESTIC booking's main status from a courier tracking feed, with all
 * the side effects a status change owes the customer: the timeline entry, the
 * milestone email, the inbox notification, and expiring the lists that display
 * it. The equivalent of applyFirstMileTransition, for the leg that IS the
 * shipment.
 *
 * Strictly forward-only, and strictly on the happy path. Two guards, both
 * deliberate:
 *
 *   1. A shipment whose current status is off the automated path (ON_HOLD,
 *      CANCELLED, CUSTOMS_HOLD, DOCUMENTS_PENDING) is never touched. Somebody
 *      put it there on purpose and a webhook does not get to overrule them.
 *   2. A status at or behind where the shipment already is, is a no-op. Shipmozo
 *      re-posts the full scan history on every update, so the same "Delivered"
 *      arrives many times; without this the customer gets the same email twice.
 *
 * Ops keep their own manual control through updateShipmentStatus, which has no
 * such guards — a human correcting a wrong status is the whole point of it.
 */

export interface ApplyDomesticStatusOptions {
  changedByType: "OPS" | "SYSTEM";
  changedById?: string | null;
  /** Appended to the timeline note, e.g. "Delivered to consignee via Delhivery". */
  note?: string;
}

export type ApplyDomesticStatusResult =
  | { success: true; changed: boolean; emailed: boolean }
  | { success: false; message: string };

export async function applyDomesticCourierStatus(
  shipmentId: string,
  newStatus: ShipmentStatus,
  opts: ApplyDomesticStatusOptions,
): Promise<ApplyDomesticStatusResult> {
  const current = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { status: true, mode: true },
  });

  if (!current) return { success: false, message: "Shipment not found." };

  if (current.mode !== ShipmentMode.DOMESTIC) {
    return {
      success: false,
      message: "Only a domestic booking moves on its courier's own status.",
    };
  }

  // Guard 1: leave anything a person parked off the happy path exactly where
  // they left it. Reported as success — there is nothing wrong here, and the
  // webhook should not retry.
  if (!isAutoAdvanceable(current.status)) {
    return { success: true, changed: false, emailed: false };
  }

  // Guard 2: forward-only.
  if (shipmentStatusRank(newStatus) <= shipmentStatusRank(current.status)) {
    return { success: true, changed: false, emailed: false };
  }

  await prisma.$transaction([
    prisma.shipment.update({
      where: { id: shipmentId },
      data: { status: newStatus },
    }),
    prisma.shipmentStatusEvent.create({
      data: {
        shipmentId,
        fromStatus: current.status,
        toStatus: newStatus,
        note: opts.note?.trim() || null,
        changedByType: opts.changedByType,
        changedById: opts.changedById ?? null,
      },
    }),
  ]);

  revalidatePath(`/arena-dashboard/domestic-bookings/${shipmentId}`);
  revalidatePath("/arena-dashboard/domestic-bookings");
  revalidatePath(`/shipments/${shipmentId}`);
  // revalidateTag, not updateTag: this runs in a route handler, where updateTag
  // is not allowed. `expire: 0` rather than the "max" profile because the
  // cached list now states something untrue about a shipment — serving it once
  // more while revalidating in the background is exactly what we don't want.
  revalidateTag(SHIPMENTS_LIST_TAG, { expire: 0 });
  revalidateTag(SHIPMENTS_COUNTS_TAG, { expire: 0 });

  // Awaited because it never throws and the caller reports it; the inbox write
  // is deferred since nobody is waiting on it.
  const { sent: emailed } = await sendShipmentMilestoneEmail(shipmentId, newStatus);
  after(() => notifyShipmentStatusChanged(shipmentId, newStatus));

  Sentry.addBreadcrumb({
    level: "info",
    message: `Domestic ${shipmentId}: ${current.status} -> ${newStatus} (${opts.changedByType})`,
    data: { emailed },
  });

  return { success: true, changed: true, emailed };
}
