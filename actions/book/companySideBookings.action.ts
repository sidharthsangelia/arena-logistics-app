"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { revalidatePath } from "next/cache";
import { ShipmentStatus } from "@/generated/prisma";
import { sendShipmentMilestoneEmail } from "@/lib/email/shipment/send";

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
  | { success: true; emailed: boolean }
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
    if (newStatus !== current.status) {
      ({ sent: emailed } = await sendShipmentMilestoneEmail(shipmentId, newStatus));
    }

    return { success: true, emailed };
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