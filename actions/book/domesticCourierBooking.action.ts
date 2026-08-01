"use server";

/**
 * OPS CONTROLS FOR THE DOMESTIC COURIER BOOKING
 * -----------------------------------------------------------------------------
 * The booking itself is automatic: a domestic shipment queues its courier order
 * the moment it is paid for. These two actions exist for when that did not
 * work.
 *
 * Neither of them talks to the vendor from the request. Retrying re-drives the
 * durable function, so the retry gets the same steps, the same idempotency and
 * the same persistence as the original attempt — an ops click and an automatic
 * booking are literally the same code path. The one thing an ops click can do
 * that the automatic path cannot is authorise an auto-assigned courier, which
 * is a commercial decision and therefore a person's to make.
 *
 * Cancelling DOES call the vendor inline, because ops need to know within the
 * click whether the order is really gone before they tell a customer so.
 */

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { DomesticCourierStatus, ShipmentMode } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { requireArenaMember } from "@/utils/arena-auth";
import { ArenaForbiddenError } from "@/utils/arena-auth";
import { BookingAdapterError } from "@/lib/booking-adapters/core/base.booking.adapter";
import { resolveBookingAdapter } from "@/lib/booking-adapters/vendors/domestic.booking.index";
import { resolveBookingVendorId } from "@/lib/booking/domesticCourier";
import type { DomesticCourierActionResult } from "@/lib/booking/domesticCourierBooking";
import { inngest, domesticCourierRetryRequested } from "@/lib/inngest/client";

// ---------------------------------------------------------------------------

/**
 * Re-drive the courier booking for one shipment.
 *
 * `allowAutoAssign` lets the vendor pick the courier when the one the customer
 * paid for can no longer be identified. Off by default and never set by the
 * automatic path: shipping a parcel on a service nobody chose is a decision, not
 * a fallback.
 */
export async function retryDomesticCourierBooking(input: {
  shipmentId: string;
  allowAutoAssign?: boolean;
}): Promise<DomesticCourierActionResult> {
  try {
    const { userId } = await requireArenaMember();

    const shipment = await prisma.shipment.findUnique({
      where: { id: input.shipmentId },
      select: {
        id: true,
        orgId: true,
        shipmentNumber: true,
        mode: true,
        domesticAwbNumber: true,
      },
    });

    if (!shipment) {
      return { success: false, message: "Shipment not found." };
    }
    if (shipment.mode !== ShipmentMode.DOMESTIC) {
      return {
        success: false,
        message: "Only domestic bookings are placed with a courier from here.",
      };
    }
    if (shipment.domesticAwbNumber) {
      return {
        success: false,
        message: `This booking already has AWB ${shipment.domesticAwbNumber}.`,
      };
    }

    await inngest.send(
      domesticCourierRetryRequested.create({
        shipmentId: shipment.id,
        shipmentNumber: shipment.shipmentNumber,
        orgId: shipment.orgId,
        requestedByUserId: userId,
        allowAutoAssign: input.allowAutoAssign === true,
      }),
    );

    // Back to PENDING so the page stops reading as failed while the re-drive is
    // in flight. The job sets it again on its own, but not before ops have
    // looked at the screen they just clicked on.
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        domesticCourierStatus: DomesticCourierStatus.PENDING,
        domesticCourierError: null,
      },
    });

    revalidatePath(`/arena-dashboard/domestic-bookings/${shipment.id}`);

    return {
      success: true,
      message: input.allowAutoAssign
        ? "Booking queued with an auto-assigned courier. The AWB appears here once the vendor issues it."
        : "Booking queued with the courier. The AWB appears here once the vendor issues it.",
    };
  } catch (err) {
    if (err instanceof ArenaForbiddenError) {
      return { success: false, message: err.message };
    }
    Sentry.captureException(err, {
      tags: { location: "retryDomesticCourierBooking" },
      extra: { shipmentId: input.shipmentId },
    });
    return {
      success: false,
      message: "Could not queue the courier booking. Please try again.",
    };
  }
}

// ---------------------------------------------------------------------------

/**
 * Cancel the order at the vendor.
 *
 * Leaves the shipment itself alone: cancelling a courier order and cancelling a
 * customer's booking are different decisions, and conflating them here would
 * mean one click quietly did both. The AWB is cleared because it no longer
 * refers to anything a courier will collect.
 */
export async function cancelDomesticCourierBooking(input: {
  shipmentId: string;
}): Promise<DomesticCourierActionResult> {
  try {
    const { userId } = await requireArenaMember();

    const shipment = await prisma.shipment.findUnique({
      where: { id: input.shipmentId },
      select: {
        id: true,
        status: true,
        mode: true,
        domesticCourierOrderId: true,
        domesticAwbNumber: true,
        domesticCourierVendorId: true,
        selectedVendorId: true,
        chargesSnapshot: true,
      },
    });

    if (!shipment) {
      return { success: false, message: "Shipment not found." };
    }
    if (shipment.mode !== ShipmentMode.DOMESTIC) {
      return { success: false, message: "This is not a domestic booking." };
    }
    if (!shipment.domesticCourierOrderId) {
      return {
        success: false,
        message: "No courier order exists for this booking yet.",
      };
    }

    const vendorId = resolveBookingVendorId(shipment);
    const adapter = resolveBookingAdapter(vendorId);
    if (!adapter) {
      return {
        success: false,
        message: `No booking integration for vendor "${vendorId ?? "unknown"}". Cancel it in the vendor's own panel.`,
      };
    }

    await adapter.cancelOrder(shipment.domesticCourierOrderId);

    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          domesticCourierStatus: DomesticCourierStatus.CANCELLED,
          domesticAwbNumber: null,
          domesticCourierError: null,
        },
      }),
      prisma.shipmentStatusEvent.create({
        data: {
          shipmentId: shipment.id,
          fromStatus: shipment.status,
          toStatus: shipment.status,
          note: `Courier order cancelled with ${adapter.vendorName}${
            shipment.domesticAwbNumber ? ` (AWB ${shipment.domesticAwbNumber})` : ""
          }.`,
          changedByType: "OPS",
          changedById: userId,
        },
      }),
    ]);

    revalidatePath(`/arena-dashboard/domestic-bookings/${shipment.id}`);
    revalidatePath(`/shipments/${shipment.id}`);

    return { success: true, message: "Courier order cancelled." };
  } catch (err) {
    if (err instanceof ArenaForbiddenError) {
      return { success: false, message: err.message };
    }
    Sentry.captureException(err, {
      tags: { location: "cancelDomesticCourierBooking" },
      extra: { shipmentId: input.shipmentId },
    });
    return {
      success: false,
      message:
        err instanceof BookingAdapterError
          ? err.message
          : "Could not cancel the courier order. Please try again.",
    };
  }
}
