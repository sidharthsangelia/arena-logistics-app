"use server";

import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";
import { prisma } from "@/utils/db";
import { revalidatePath } from "next/cache";
import { ShipmentStatus } from "@/generated/prisma";
import {
  sendShipmentMilestoneEmail,
  type ShipmentEmailResult,
} from "@/lib/email/shipment/send";
import { notifyShipmentStatusChanged } from "@/lib/notifications/emit";

const ARENA_ORG_ID = process.env.ARENA_ORG_ID!;

// ---------------------------------------------------------------------------
// Auth guard — must be Arena staff
// ---------------------------------------------------------------------------

async function assertArenaStaff(): Promise<{ userId: string }> {
  const { userId, orgId } = await auth();
  if (!userId || orgId !== ARENA_ORG_ID) {
    throw new Error("Unauthorised");
  }
  return { userId };
}

// ---------------------------------------------------------------------------
// Update shipment status
// ---------------------------------------------------------------------------

export type UpdateStatusResult =
  | {
      success: true;
      emailed: boolean;
      /**
       * Who the email actually reached. "associate" means a business associate
       * received it instead of their client, which is a setting they chose and
       * not a failure, so the toast must not report it as either a success for
       * the client or a problem to fix.
       */
      emailAudience: ShipmentEmailResult["audience"];
    }
  | { success: false; message: string };

export async function updateShipmentStatus(
  shipmentId: string,
  newStatus: ShipmentStatus,
  note?: string
): Promise<UpdateStatusResult> {
  try {
    const { userId } = await assertArenaStaff();

    const current = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { status: true },
    });

    if (!current) return { success: false, message: "Shipment not found." };

    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          status: newStatus,
          ...(newStatus === ShipmentStatus.BOOKED ? { bookedAt: new Date() } : {}),
        },
      }),
      prisma.shipmentStatusEvent.create({
        data: {
          shipmentId,
          fromStatus: current.status,
          toStatus: newStatus,
          note: note?.trim() || null,
          changedByType: "OPS",
          changedById: userId,
        },
      }),
    ]);

    revalidatePath(`/arena-dashboard/bookings/${shipmentId}`);
    revalidatePath("/arena-dashboard/bookings");

    // Notify the sender when the shipment reaches a customer milestone. Only
    // fires on a real transition (skips re-saving the same status) and is
    // strictly non-blocking — sendShipmentMilestoneEmail never throws, so a
    // send failure can never fail the status update the ops user just made.
    // `emailed` reflects whether Resend actually accepted the message, so the
    // UI toast can be honest about whether the client was notified.
    let emailed = false;
    let emailAudience: ShipmentEmailResult["audience"] = "none";
    if (newStatus !== current.status) {
      ({ sent: emailed, audience: emailAudience } =
        await sendShipmentMilestoneEmail(shipmentId, newStatus));
    }

    // Tell the tenant's own inbox about the move. Scheduled with `after` so the
    // notification write happens once the ops user already has their response
    // back; it is a record for somebody else, and nobody should wait on it.
    if (newStatus !== current.status) {
      after(() => notifyShipmentStatusChanged(shipmentId, newStatus));
    }

    return { success: true, emailed, emailAudience };
  } catch (err) {
    console.error("[updateShipmentStatus]", err);
    return { success: false, message: "Failed to update status. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Update internal notes
// ---------------------------------------------------------------------------

export type UpdateNotesResult =
  | { success: true }
  | { success: false; message: string };

export async function updateInternalNotes(
  shipmentId: string,
  notes: string
): Promise<UpdateNotesResult> {
  try {
    await assertArenaStaff();

    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { internalNotes: notes.trim() || null },
    });

    revalidatePath(`/arena-dashboard/bookings/${shipmentId}`);
    return { success: true };
  } catch (err) {
    console.error("[updateInternalNotes]", err);
    return { success: false, message: "Failed to save notes. Please try again." };
  }
}