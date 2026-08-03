"use server";

/**
 * OPS CONTROLS FOR THE INTERNATIONAL CARRIER BOOKING
 * -----------------------------------------------------------------------------
 * The booking itself is automatic: an international shipment queues its carrier
 * booking the moment it is paid for. These actions exist for when that did not
 * work.
 *
 * Retrying does not talk to the vendor from the request — it re-drives the
 * durable function, so the retry gets the same steps, the same idempotency and
 * the same persistence as the original attempt. An ops click and an automatic
 * booking are literally the same code path.
 *
 * NOTE THE ABSENCE OF AN AUTO-ASSIGN OVERRIDE, which the domestic equivalent
 * has. There is none to offer: international carriers are not interchangeable —
 * transit time, duty handling and customs paperwork all differ, and the customer
 * chose on those — so a service that cannot be identified is always a stop.
 * Ops fix the underlying data (an IEC, an expired LUT) and retry.
 *
 * Cancelling DOES call the vendor inline, because ops need to know within the
 * click whether the booking is really gone before they tell a customer so.
 */

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { IntlBookingStatus, ShipmentMode } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { ArenaForbiddenError, requireArenaMember } from "@/utils/arena-auth";
import { BookingAdapterError } from "@/lib/booking-adapters/core/base.booking.adapter";
import { resolveIntlBookingAdapter } from "@/lib/booking-adapters/vendors/international.booking.index";
import { resolveIntlVendorId } from "@/lib/booking/internationalCarrier";
import { inngest, intlCarrierRetryRequested } from "@/lib/inngest/client";

export interface IntlCarrierActionResult {
  success: boolean;
  message: string;
}

// ---------------------------------------------------------------------------

/** Re-drive the carrier booking for one shipment. */
export async function retryIntlCarrierBooking(input: {
  shipmentId: string;
}): Promise<IntlCarrierActionResult> {
  try {
    const { userId } = await requireArenaMember();

    const shipment = await prisma.shipment.findUnique({
      where: { id: input.shipmentId },
      select: {
        id: true,
        orgId: true,
        shipmentNumber: true,
        mode: true,
        intlAwbNumber: true,
      },
    });

    if (!shipment) {
      return { success: false, message: "Shipment not found." };
    }
    if (shipment.mode !== ShipmentMode.INTERNATIONAL) {
      return {
        success: false,
        message: "Only international bookings are placed with a carrier from here.",
      };
    }
    if (shipment.intlAwbNumber) {
      return {
        success: false,
        message: `This booking already has AWB ${shipment.intlAwbNumber}.`,
      };
    }

    await inngest.send(
      intlCarrierRetryRequested.create({
        shipmentId: shipment.id,
        shipmentNumber: shipment.shipmentNumber,
        orgId: shipment.orgId,
        requestedByUserId: userId,
      }),
    );

    // Back to PENDING so the page stops reading as failed while the re-drive is
    // in flight. The job sets it again on its own, but not before ops have
    // looked at the screen they just clicked on.
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        intlBookingStatus: IntlBookingStatus.PENDING,
        intlBookingError: null,
      },
    });

    revalidatePath(`/arena-dashboard/bookings/${shipment.id}`);

    return {
      success: true,
      message:
        "Booking queued with the carrier. The AWB and label appear here once the vendor issues them.",
    };
  } catch (err) {
    if (err instanceof ArenaForbiddenError) {
      return { success: false, message: err.message };
    }
    Sentry.captureException(err, {
      tags: { location: "retryIntlCarrierBooking" },
      extra: { shipmentId: input.shipmentId },
    });
    return {
      success: false,
      message: "Could not queue the carrier booking. Please try again.",
    };
  }
}

// ---------------------------------------------------------------------------

/**
 * Cancel the booking at the vendor.
 *
 * Leaves the shipment itself alone: cancelling a carrier booking and cancelling
 * a customer's booking are different decisions, and conflating them here would
 * mean one click quietly did both. The AWB is cleared because it no longer
 * refers to anything a carrier will collect.
 *
 * Not every vendor supports this. sKart publishes no cancel endpoint for an
 * export, and its adapter says so rather than reporting a success that did not
 * happen.
 */
export async function cancelIntlCarrierBooking(input: {
  shipmentId: string;
}): Promise<IntlCarrierActionResult> {
  try {
    const { userId } = await requireArenaMember();

    const shipment = await prisma.shipment.findUnique({
      where: { id: input.shipmentId },
      select: {
        id: true,
        status: true,
        mode: true,
        intlBookingOrderId: true,
        intlAwbNumber: true,
        intlBookingVendorId: true,
        selectedVendorId: true,
        chargesSnapshot: true,
      },
    });

    if (!shipment) {
      return { success: false, message: "Shipment not found." };
    }
    if (shipment.mode !== ShipmentMode.INTERNATIONAL) {
      return { success: false, message: "This is not an international booking." };
    }
    if (!shipment.intlBookingOrderId) {
      return {
        success: false,
        message: "No carrier booking exists for this shipment yet.",
      };
    }

    const vendorId = resolveIntlVendorId(shipment);
    const adapter = resolveIntlBookingAdapter(vendorId);
    if (!adapter) {
      return {
        success: false,
        message: `No booking integration for vendor "${vendorId ?? "unknown"}". Cancel it in the vendor's own panel.`,
      };
    }

    await adapter.cancelBooking(shipment.intlBookingOrderId);

    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          intlBookingStatus: IntlBookingStatus.CANCELLED,
          intlAwbNumber: null,
          intlBookingError: null,
        },
      }),
      prisma.shipmentStatusEvent.create({
        data: {
          shipmentId: shipment.id,
          fromStatus: shipment.status,
          toStatus: shipment.status,
          note: `Carrier booking cancelled with ${adapter.vendorName}${
            shipment.intlAwbNumber ? ` (AWB ${shipment.intlAwbNumber})` : ""
          }.`,
          changedByType: "OPS",
          changedById: userId,
        },
      }),
    ]);

    revalidatePath(`/arena-dashboard/bookings/${shipment.id}`);
    revalidatePath(`/shipments/${shipment.id}`);

    return { success: true, message: "Carrier booking cancelled." };
  } catch (err) {
    if (err instanceof ArenaForbiddenError) {
      return { success: false, message: err.message };
    }
    Sentry.captureException(err, {
      tags: { location: "cancelIntlCarrierBooking" },
      extra: { shipmentId: input.shipmentId },
    });
    return {
      success: false,
      message:
        err instanceof BookingAdapterError
          ? err.message
          : "Could not cancel the carrier booking. Please try again.",
    };
  }
}
