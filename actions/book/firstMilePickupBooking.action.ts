"use server";

/**
 * OPS CONTROL FOR THE FIRST-MILE PICKUP
 * -----------------------------------------------------------------------------
 * The pickup itself is automatic: an international shipment that includes door
 * collection queues its courier the moment the export leg is booked (see
 * lib/inngest/functions/bookInternationalCarrier.ts, which sends the event, and
 * lib/inngest/functions/bookFirstMilePickup.ts, which acts on it). This action
 * exists for when that did not work.
 *
 * IT NO LONGER TALKS TO THE VENDOR. It used to run the whole Shipmozo sequence
 * inline — create warehouse, push order, assign courier, schedule pickup — which
 * was a second, drifting copy of what the booking adapter already does. Now it
 * re-drives the durable function, so an ops click and the automatic path are
 * literally the same code, with the same idempotency and the same persistence.
 *
 * The one thing an ops click can do that the automatic path cannot is authorise
 * an auto-assigned courier, which is a commercial decision and therefore a
 * person's to make. That is the whole reason this file still exists.
 */

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { ArenaForbiddenError, requireArenaMember } from "@/utils/arena-auth";
import type { BookFirstMileResult } from "@/lib/booking/firstMilePickup";
import { firstMileRetryRequested, inngest } from "@/lib/inngest/client";

export async function bookFirstMilePickup(
  shipmentId: string,
  opts?: { allowAutoAssign?: boolean },
): Promise<BookFirstMileResult> {
  try {
    const { userId } = await requireArenaMember();

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        orgId: true,
        shipmentNumber: true,
        pickupIncluded: true,
        firstMileTrackingNumber: true,
      },
    });

    if (!shipment) {
      return { success: false, message: "Shipment not found." };
    }
    if (!shipment.pickupIncluded) {
      return {
        success: false,
        message: "This shipment does not include door pickup.",
      };
    }
    if (shipment.firstMileTrackingNumber) {
      return {
        success: false,
        message: `Pickup already booked (AWB ${shipment.firstMileTrackingNumber}).`,
      };
    }

    await inngest.send(
      firstMileRetryRequested.create({
        shipmentId: shipment.id,
        shipmentNumber: shipment.shipmentNumber,
        orgId: shipment.orgId,
        requestedByUserId: userId,
        allowAutoAssign: opts?.allowAutoAssign === true,
      }),
    );

    revalidatePath(`/arena-dashboard/bookings/${shipment.id}`);
    revalidatePath(`/shipments/${shipment.id}`);

    // The AWB is not known yet: the job issues it asynchronously. Returning
    // nulls here rather than blocking on the vendor is the trade the durable
    // rewrite makes, and it is the right one — an ops click that waits out four
    // vendor calls is a click that times out.
    //
    // The COURIER_UNRESOLVED path this action used to return synchronously now
    // surfaces as a failed run with that reason on the booking row, and the
    // same auto-assign override is offered from there.
    return { success: true, awb: null, carrier: null };
  } catch (err) {
    if (err instanceof ArenaForbiddenError) {
      return { success: false, message: err.message };
    }
    Sentry.captureException(err, {
      tags: { location: "bookFirstMilePickup" },
      extra: { shipmentId },
    });
    return {
      success: false,
      message: "Could not queue the pickup. Please try again.",
    };
  }
}
