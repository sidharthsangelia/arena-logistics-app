import "server-only";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { FirstMileStatus, Prisma } from "@/generated/prisma";
import {
  FIRST_MILE_STAGES,
  firstMileStageIndex,
} from "@/lib/booking/firstMileStatus";
import { sendFirstMileMilestoneEmail } from "@/lib/email/shipment/send";
import { notifyFirstMileStatusChanged } from "@/lib/notifications/emit";

/**
 * lib/booking/firstMileTransition.ts
 *
 * The single place the door → hub leg actually moves. Both the manual ops panel
 * and the Shipmozo tracking webhook funnel through here so the side effects —
 * stamping the milestone timestamp once, logging the timeline note, emailing +
 * notifying the customer on the two milestones, revalidating both pages — happen
 * exactly once and identically regardless of what triggered the change.
 */

export interface ApplyFirstMileOptions {
  changedByType: "OPS" | "SYSTEM";
  changedById?: string | null;
  /** undefined = leave field as-is; null = clear it; string = set it. */
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  /** undefined = leave; Date/null = set. Ops sets this; the webhook never does. */
  pickupScheduledAt?: Date | null;
  /**
   * When true, a stage at or behind the current one is a no-op (returns
   * changed:false). The webhook sets this so an out-of-order or replayed scan
   * can never drag the leg backwards; ops leave it off so they can correct.
   */
  onlyForward?: boolean;
  /** Appended to the timeline note, e.g. "via Shipmozo". */
  noteSuffix?: string;
}

export type ApplyFirstMileResult =
  | { success: true; changed: boolean; emailed: boolean }
  | { success: false; message: string };

export async function applyFirstMileTransition(
  shipmentId: string,
  newStatus: FirstMileStatus,
  opts: ApplyFirstMileOptions,
): Promise<ApplyFirstMileResult> {
  if (!FIRST_MILE_STAGES[newStatus]) {
    return { success: false, message: "Unknown first-mile stage." };
  }

  const current = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      status: true,
      pickupIncluded: true,
      firstMileStatus: true,
      firstMilePickedUpAt: true,
      firstMileHubArrivedAt: true,
    },
  });

  if (!current) return { success: false, message: "Shipment not found." };
  if (!current.pickupIncluded) {
    return { success: false, message: "This shipment does not include door pickup." };
  }

  const currentIdx = current.firstMileStatus
    ? firstMileStageIndex(current.firstMileStatus)
    : -1;
  const nextIdx = firstMileStageIndex(newStatus);

  // Forward-only guard for the webhook: nothing to do if we're already here or
  // further along. Still returns success so a replayed webhook is a clean 200.
  if (opts.onlyForward && nextIdx <= currentIdx) {
    return { success: true, changed: false, emailed: false };
  }

  const changed = current.firstMileStatus !== newStatus;
  const now = new Date();

  const pickedUpReached = nextIdx >= firstMileStageIndex(FirstMileStatus.PICKED_UP);
  const hubReached = nextIdx >= firstMileStageIndex(FirstMileStatus.ARRIVED_AT_HUB);

  const data: Prisma.ShipmentUpdateInput = {
    firstMileStatus: newStatus,
    firstMileStatusUpdatedAt: now,
  };
  if (opts.trackingNumber !== undefined)
    data.firstMileTrackingNumber = opts.trackingNumber || null;
  if (opts.trackingUrl !== undefined)
    data.firstMileTrackingUrl = opts.trackingUrl || null;
  if (opts.pickupScheduledAt !== undefined)
    data.firstMilePickupScheduledAt = opts.pickupScheduledAt;
  // Timestamps are stamped the first time the leg reaches the stage and never
  // overwritten, so a correction back and forth keeps the original moment.
  if (pickedUpReached && !current.firstMilePickedUpAt) data.firstMilePickedUpAt = now;
  if (hubReached && !current.firstMileHubArrivedAt) data.firstMileHubArrivedAt = now;

  const note = `First-mile pickup: ${FIRST_MILE_STAGES[newStatus].label}${
    opts.noteSuffix ? ` (${opts.noteSuffix})` : ""
  }`;

  await prisma.$transaction([
    prisma.shipment.update({ where: { id: shipmentId }, data }),
    // Only log a timeline event when something actually changed — a webhook
    // re-sending the same stage should not spam the history.
    ...(changed
      ? [
          prisma.shipmentStatusEvent.create({
            data: {
              shipmentId,
              fromStatus: current.status,
              toStatus: current.status,
              note,
              changedByType: opts.changedByType,
              changedById: opts.changedById ?? null,
            },
          }),
        ]
      : []),
  ]);

  revalidatePath(`/arena-dashboard/bookings/${shipmentId}`);
  revalidatePath("/arena-dashboard/bookings");
  revalidatePath(`/shipments/${shipmentId}`);

  // Milestone side effects only on a real transition into PICKED_UP /
  // ARRIVED_AT_HUB. Email is awaited (never throws) so callers can report it;
  // the inbox write is deferred since nobody waits on it.
  let emailed = false;
  if (changed) {
    ({ sent: emailed } = await sendFirstMileMilestoneEmail(shipmentId, newStatus));
    after(() => notifyFirstMileStatusChanged(shipmentId, newStatus));
  }

  Sentry.addBreadcrumb({
    level: "info",
    message: `First-mile ${shipmentId} -> ${newStatus} (${opts.changedByType})`,
    data: { changed, emailed },
  });

  return { success: true, changed, emailed };
}
