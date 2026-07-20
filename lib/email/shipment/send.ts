import "server-only";

import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { ShipmentStatus } from "@/generated/prisma";
import { shipmentFromHeader } from "./brand";
import {
  getMilestoneCopy,
  isEmailMilestone,
  type ShipmentEmailContext,
} from "./copy";
import { renderShipmentEmailHtml, renderShipmentEmailText } from "./template";

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function locationLabel(
  city: string | null | undefined,
  country: string | null | undefined,
): string {
  return [city?.trim(), country?.trim()].filter(Boolean).join(", ") || "origin";
}

/**
 * Sends the customer-facing email for a shipment that has just reached a
 * milestone status. Designed to be called AFTER the status change is durably
 * committed, and to be safe to `await` from a server action:
 *
 *   - It never throws. Any failure (no recipient, Resend down, bad status) is
 *     reported to Sentry and swallowed, so a booking or status update is never
 *     rolled back or surfaced as an error just because the email failed.
 *   - It no-ops for non-milestone statuses, so callers can pass any status.
 */
export async function sendShipmentMilestoneEmail(
  shipmentId: string,
  status: ShipmentStatus,
): Promise<void> {
  try {
    if (!isEmailMilestone(status)) return;

    if (!process.env.RESEND_API_KEY) {
      Sentry.addBreadcrumb({
        level: "warning",
        message: `Skipping shipment email (${status}) — RESEND_API_KEY not set`,
        data: { shipmentId },
      });
      return;
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        orgId: true,
        shipmentNumber: true,
        senderEmail: true,
        senderName: true,
        selectedVendorName: true,
        selectedProductName: true,
        totalActualWeightKg: true,
        hawbNumber: true,
        vendorTrackingUrl: true,
        client: { select: { email: true, contactName: true, companyName: true } },
        pickupAddress: {
          select: { city: true, country: true, contactName: true, contactEmail: true },
        },
        deliveryAddress: { select: { city: true, country: true } },
        packages: { select: { quantity: true } },
      },
    });

    if (!shipment) {
      Sentry.captureMessage("sendShipmentMilestoneEmail: shipment not found", {
        level: "warning",
        tags: { location: "sendShipmentMilestoneEmail" },
        extra: { shipmentId, status },
      });
      return;
    }

    // Recipient resolution. Prefer the frozen sender snapshot; fall back to the
    // client (BA bookings) then the pickup contact so legacy rows without a
    // snapshot still reach someone sensible.
    const to =
      shipment.senderEmail?.trim() ||
      shipment.client?.email?.trim() ||
      shipment.pickupAddress?.contactEmail?.trim() ||
      null;

    if (!to || !EMAIL_RX.test(to)) {
      Sentry.addBreadcrumb({
        level: "warning",
        message: `No valid recipient for shipment email (${status})`,
        data: { shipmentId, shipmentNumber: shipment.shipmentNumber },
      });
      return;
    }

    const senderName =
      shipment.senderName?.trim() ||
      shipment.client?.contactName?.trim() ||
      shipment.client?.companyName?.trim() ||
      shipment.pickupAddress?.contactName?.trim() ||
      null;

    const pieces = shipment.packages.reduce((sum, p) => sum + (p.quantity || 0), 0);
    const serviceName =
      [shipment.selectedVendorName, shipment.selectedProductName]
        .filter(Boolean)
        .join(" ")
        .trim() || null;

    const ctx: ShipmentEmailContext = {
      shipmentNumber: shipment.shipmentNumber,
      senderName,
      originLabel: locationLabel(shipment.pickupAddress?.city, shipment.pickupAddress?.country),
      destinationLabel: locationLabel(
        shipment.deliveryAddress?.city,
        shipment.deliveryAddress?.country,
      ),
      serviceName,
      pieces: pieces > 0 ? pieces : shipment.packages.length,
      weightLabel: shipment.totalActualWeightKg
        ? `${Number(shipment.totalActualWeightKg).toFixed(2)} kg`
        : null,
      trackingNumber: shipment.hawbNumber?.trim() || null,
      trackingUrl: shipment.vendorTrackingUrl?.trim() || null,
    };

    const copy = getMilestoneCopy(status, ctx);
    if (!copy) return; // defensive — isEmailMilestone already guarded this

    const { error } = await resend.emails.send({
      from: shipmentFromHeader(),
      to,
      subject: copy.subject,
      html: renderShipmentEmailHtml(copy, ctx),
      text: renderShipmentEmailText(copy, ctx),
      tags: [
        { name: "type", value: "shipment_status" },
        { name: "status", value: status },
        { name: "shipmentId", value: shipment.id },
        { name: "orgId", value: shipment.orgId },
      ],
    });

    if (error) {
      Sentry.captureException(error, {
        tags: { location: "sendShipmentMilestoneEmail" },
        extra: { shipmentId, status, to },
      });
      return;
    }

    Sentry.addBreadcrumb({
      level: "info",
      message: `Shipment ${status} email sent for ${shipment.shipmentNumber}`,
      data: { shipmentId, to },
    });
  } catch (err) {
    // Absolute guarantee: never let an email failure bubble into the caller.
    Sentry.captureException(err, {
      tags: { location: "sendShipmentMilestoneEmail" },
      extra: { shipmentId, status },
    });
  }
}
