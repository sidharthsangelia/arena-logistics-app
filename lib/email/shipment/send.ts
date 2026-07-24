import "server-only";

import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { ShipmentStatus } from "@/generated/prisma";
import { absoluteUrl } from "./brand";
import {
  ASSOCIATE_COPY_REASON_TEXT,
  coerceClientEmailPreference,
  resolveClientEmailDecision,
} from "../clientEmails";
import { arenaIdentity, associateIdentity, type EmailIdentity } from "./identity";
import {
  getMilestoneCopy,
  isEmailMilestone,
  type ShipmentEmailContext,
} from "./copy";
import {
  renderShipmentEmailHtml,
  renderShipmentEmailText,
  type EmailNotice,
} from "./template";

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where the BA is sent to change the setting that diverted their copy. */
const CLIENT_EMAIL_SETTINGS_PATH = "/settings/client-emails";

/**
 * Outcome of an email attempt.
 *
 * `sent` is true only when Resend accepted the message, so UI can honestly say
 * "the client has been notified" without ever overclaiming on a skip or failure.
 *
 * `audience` says WHO it reached, which `sent` alone cannot: a business associate
 * with client emails switched off produces `sent: true, audience: "associate"`,
 * and a toast that said "your client has been notified" there would be wrong.
 */
export type ShipmentEmailResult = {
  sent: boolean;
  audience: "client" | "associate" | "direct" | "none";
};

const NOT_SENT: ShipmentEmailResult = { sent: false, audience: "none" };

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
 *
 * For a business associate booking on behalf of a client, WHO receives this is
 * the associate's decision rather than ours. See lib/email/clientEmails.ts. When
 * the answer is "not the client", the same email goes to the associate with a
 * line at the top explaining which setting diverted it, so switching client
 * emails off never means switching updates off.
 */
export async function sendShipmentMilestoneEmail(
  shipmentId: string,
  status: ShipmentStatus,
): Promise<ShipmentEmailResult> {
  try {
    if (!isEmailMilestone(status)) return NOT_SENT;

    if (!process.env.RESEND_API_KEY) {
      Sentry.addBreadcrumb({
        level: "warning",
        message: `Skipping shipment email (${status}) — RESEND_API_KEY not set`,
        data: { shipmentId },
      });
      return NOT_SENT;
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        orgId: true,
        clientId: true,
        shipmentNumber: true,
        senderEmail: true,
        senderName: true,
        selectedVendorName: true,
        selectedProductName: true,
        totalActualWeightKg: true,
        hawbNumber: true,
        vendorTrackingUrl: true,
        client: {
          select: {
            email: true,
            contactName: true,
            companyName: true,
            emailPreference: true,
          },
        },
        // Everything needed to decide whether the client hears about this, and
        // under whose name. Fetched with the shipment rather than in a second
        // query, since the send path is already one round trip.
        org: {
          select: {
            name: true,
            companyName: true,
            contactName: true,
            email: true,
            isBusinessAssociate: true,
            clientEmailsEnabled: true,
            clientEmailMilestones: true,
            clientEmailReplyTo: true,
          },
        },
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
      return NOT_SENT;
    }

    const org = shipment.org;

    const decision = resolveClientEmailDecision({
      isBusinessAssociate: org?.isBusinessAssociate ?? false,
      hasClient: Boolean(shipment.clientId),
      clientEmail: shipment.client?.email ?? shipment.senderEmail ?? null,
      orgEnabled: org?.clientEmailsEnabled ?? false,
      orgMilestones: org?.clientEmailMilestones ?? [],
      clientPreference: coerceClientEmailPreference(
        shipment.client?.emailPreference,
      ),
      status,
    });

    // Recipient, identity and greeting all follow from the decision.
    //
    // The `associate` branch must not fall back to senderEmail: for a BA booking
    // that snapshot IS the client's address, so using it would deliver the
    // client's copy to the client while claiming to have withheld it.
    let to: string | null;
    let identity: EmailIdentity;
    let notice: EmailNotice | null = null;
    let greetingFor: string | null;

    if (decision.route === "associate") {
      to = org?.clientEmailReplyTo?.trim() || org?.email?.trim() || null;
      identity = arenaIdentity();
      greetingFor = org?.contactName?.trim() || org?.name?.trim() || null;
      notice = {
        text: ASSOCIATE_COPY_REASON_TEXT[decision.reason],
        actionLabel: "Change who gets these updates",
        actionUrl: absoluteUrl(CLIENT_EMAIL_SETTINGS_PATH),
      };
    } else if (decision.route === "client") {
      to = shipment.client?.email?.trim() || shipment.senderEmail?.trim() || null;
      identity = associateIdentity({
        companyName: org?.companyName ?? null,
        name: org?.name ?? "",
        replyTo: org?.clientEmailReplyTo ?? org?.email ?? null,
      });
      greetingFor =
        shipment.senderName?.trim() ||
        shipment.client?.contactName?.trim() ||
        shipment.client?.companyName?.trim() ||
        null;
    } else {
      // Unchanged path for standard orgs: the frozen sender snapshot, falling
      // back to the pickup contact for rows written before that snapshot existed.
      to =
        shipment.senderEmail?.trim() ||
        shipment.client?.email?.trim() ||
        shipment.pickupAddress?.contactEmail?.trim() ||
        null;
      identity = arenaIdentity();
      greetingFor =
        shipment.senderName?.trim() ||
        shipment.client?.contactName?.trim() ||
        shipment.client?.companyName?.trim() ||
        shipment.pickupAddress?.contactName?.trim() ||
        null;
    }

    if (!to || !EMAIL_RX.test(to)) {
      Sentry.addBreadcrumb({
        level: "warning",
        message: `No valid recipient for shipment email (${status}, route ${decision.route})`,
        data: { shipmentId, shipmentNumber: shipment.shipmentNumber },
      });
      return NOT_SENT;
    }

    const senderName = greetingFor;

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
    if (!copy) return NOT_SENT; // defensive — isEmailMilestone already guarded this

    // The associate's own copy keeps the client-facing subject line, prefixed so
    // it is obvious in a crowded inbox that this one was not sent onward.
    const subject =
      decision.route === "associate"
        ? `Your copy: ${copy.subject}`
        : copy.subject;

    const { error } = await resend.emails.send({
      from: identity.fromHeader,
      to,
      ...(identity.replyTo ? { replyTo: identity.replyTo } : {}),
      subject,
      html: renderShipmentEmailHtml(copy, ctx, identity, notice),
      text: renderShipmentEmailText(copy, ctx, identity, notice),
      tags: [
        { name: "type", value: "shipment_status" },
        { name: "status", value: status },
        { name: "shipmentId", value: shipment.id },
        { name: "orgId", value: shipment.orgId },
        // Lets a deliverability question be answered per audience later, without
        // having to join back to the org to work out who each email went to.
        { name: "audience", value: decision.route },
      ],
    });

    if (error) {
      Sentry.captureException(error, {
        tags: { location: "sendShipmentMilestoneEmail" },
        extra: { shipmentId, status, to, route: decision.route },
      });
      return NOT_SENT;
    }

    Sentry.addBreadcrumb({
      level: "info",
      message: `Shipment ${status} email sent for ${shipment.shipmentNumber} (${decision.route})`,
      data: { shipmentId, to },
    });
    return { sent: true, audience: decision.route };
  } catch (err) {
    // Absolute guarantee: never let an email failure bubble into the caller.
    Sentry.captureException(err, {
      tags: { location: "sendShipmentMilestoneEmail" },
      extra: { shipmentId, status },
    });
    return NOT_SENT;
  }
}
