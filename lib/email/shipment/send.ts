import "server-only";

import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { ShipmentStatus, FirstMileStatus } from "@/generated/prisma";
import { absoluteUrl } from "./brand";
import {
  ASSOCIATE_COPY_REASON_TEXT,
  coerceClientEmailPreference,
  resolveClientEmailDecision,
} from "../clientEmails";
import { arenaIdentity, associateIdentity, type EmailIdentity } from "./identity";
import {
  getAwbReadyCopy,
  getMilestoneCopy,
  getFirstMileMilestoneCopy,
  isEmailMilestone,
  type MilestoneCopy,
  type ShipmentEmailContext,
} from "./copy";
import { isFirstMileEmailMilestone } from "@/lib/booking/firstMileStatus";
import { brandServiceName } from "@/lib/branding/serviceName";
import {
  renderShipmentEmailHtml,
  renderShipmentEmailText,
  type EmailNotice,
} from "./template";

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where the BA is sent to change the setting that diverted their copy. */
const CLIENT_EMAIL_SETTINGS_PATH = "/settings?tab=emails";

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

/**
 * A file to ride along with the email. Today this is only ever the shipment's
 * tax invoice, attached to the booking confirmation.
 *
 * `url` rather than bytes: the PDF is already stored on UploadThing at a public
 * URL by the time the email goes out, and Resend will fetch it itself. That
 * keeps a few hundred kilobytes out of the background job's step state and out
 * of this process's memory, which is the difference between a light job and one
 * that carries the document twice.
 */
export interface ShipmentEmailAttachment {
  filename: string;
  url: string;
}

function locationLabel(
  city: string | null | undefined,
  country: string | null | undefined,
): string {
  return [city?.trim(), country?.trim()].filter(Boolean).join(", ") || "origin";
}

/**
 * Everything the dispatch step needs once we know who to write to and what to
 * say. Built by resolveShipmentEmailTarget so the milestone and first-mile
 * senders share one recipient/identity/context resolution and can never drift.
 */
interface ShipmentEmailTarget {
  to: string;
  identity: EmailIdentity;
  notice: EmailNotice | null;
  route: ShipmentEmailResult["audience"];
  ctx: ShipmentEmailContext;
  shipmentId: string;
  orgId: string;
  /** First-mile courier tracking, kept aside so the first-mile sender can
   *  swap it into ctx in place of the (main leg) HAWB. */
  firstMileTrackingNumber: string | null;
  firstMileTrackingUrl: string | null;
}

/**
 * Resolves recipient, sender identity and email context for a shipment.
 *
 * `routingStatus` only feeds the business-associate client-email decision (which
 * milestones that BA has opted their clients into). The main sender passes the
 * real status; the first-mile sender passes PROCESSING, since a door-pickup
 * update belongs to the "we are handling it" phase before the carrier leg.
 *
 * Returns null (having recorded a breadcrumb) when there is no valid recipient.
 */
async function resolveShipmentEmailTarget(
  shipmentId: string,
  routingStatus: ShipmentStatus,
): Promise<ShipmentEmailTarget | null> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      orgId: true,
      clientId: true,
      shipmentNumber: true,
      senderEmail: true,
      senderName: true,
      selectedProductName: true,
      totalActualWeightKg: true,
      hawbNumber: true,
      vendorTrackingUrl: true,
      firstMileTrackingNumber: true,
      firstMileTrackingUrl: true,
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
    Sentry.captureMessage("resolveShipmentEmailTarget: shipment not found", {
      level: "warning",
      tags: { location: "resolveShipmentEmailTarget" },
      extra: { shipmentId, routingStatus },
    });
    return null;
  }

  const org = shipment.org;

  const decision = resolveClientEmailDecision({
    isBusinessAssociate: org?.isBusinessAssociate ?? false,
    hasClient: Boolean(shipment.clientId),
    clientEmail: shipment.client?.email ?? shipment.senderEmail ?? null,
    orgEnabled: org?.clientEmailsEnabled ?? false,
    orgMilestones: org?.clientEmailMilestones ?? [],
    clientPreference: coerceClientEmailPreference(shipment.client?.emailPreference),
    status: routingStatus,
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
      message: `No valid recipient for shipment email (route ${decision.route})`,
      data: { shipmentId, shipmentNumber: shipment.shipmentNumber },
    });
    return null;
  }

  const pieces = shipment.packages.reduce((sum, p) => sum + (p.quantity || 0), 0);
  // Service only. The sourcing vendor never appears in customer-facing copy, so
  // a shipment with no product name shows no Service row rather than falling
  // back to the vendor. See carrierBranding.md.
  //
  // White-labelled too, and not optionally: `selectedProductName` is stored raw
  // ("ShipGlobal Direct") and this email is the one surface we cannot retract
  // once it has left. There is no Arena-staff reader to branch on — the
  // recipient is always the customer.
  const serviceName = brandServiceName(shipment.selectedProductName) || null;

  const ctx: ShipmentEmailContext = {
    shipmentNumber: shipment.shipmentNumber,
    senderName: greetingFor,
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

  return {
    to,
    identity,
    notice,
    route: decision.route,
    ctx,
    shipmentId: shipment.id,
    orgId: shipment.orgId,
    firstMileTrackingNumber: shipment.firstMileTrackingNumber?.trim() || null,
    firstMileTrackingUrl: shipment.firstMileTrackingUrl?.trim() || null,
  };
}

/**
 * Renders and sends one shipment email for an already-resolved target. `typeTag`
 * / `statusTag` land on the Resend message so deliverability can be sliced by
 * kind and stage later without joining back to the shipment.
 */
async function dispatchShipmentEmail(
  target: ShipmentEmailTarget,
  copy: MilestoneCopy,
  ctx: ShipmentEmailContext,
  typeTag: string,
  statusTag: string,
  attachments?: ShipmentEmailAttachment[],
): Promise<ShipmentEmailResult> {
  // The associate's own copy keeps the client-facing subject line, prefixed so
  // it is obvious in a crowded inbox that this one was not sent onward.
  const subject =
    target.route === "associate" ? `Your copy: ${copy.subject}` : copy.subject;

  const { error } = await resend.emails.send({
    from: target.identity.fromHeader,
    to: target.to,
    ...(target.identity.replyTo ? { replyTo: target.identity.replyTo } : {}),
    ...(attachments?.length
      ? {
          attachments: attachments.map((a) => ({
            filename: a.filename,
            path: a.url,
          })),
        }
      : {}),
    subject,
    html: renderShipmentEmailHtml(copy, ctx, target.identity, target.notice),
    text: renderShipmentEmailText(copy, ctx, target.identity, target.notice),
    tags: [
      { name: "type", value: typeTag },
      { name: "status", value: statusTag },
      { name: "shipmentId", value: target.shipmentId },
      { name: "orgId", value: target.orgId },
      { name: "audience", value: target.route },
    ],
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { location: "dispatchShipmentEmail" },
      extra: { shipmentId: target.shipmentId, statusTag, to: target.to, route: target.route },
    });
    return NOT_SENT;
  }

  Sentry.addBreadcrumb({
    level: "info",
    message: `Shipment email sent (${statusTag}) for ${ctx.shipmentNumber} (${target.route})`,
    data: { shipmentId: target.shipmentId, to: target.to },
  });
  return { sent: true, audience: target.route };
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
  attachments?: ShipmentEmailAttachment[],
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

    const target = await resolveShipmentEmailTarget(shipmentId, status);
    if (!target) return NOT_SENT;

    const copy = getMilestoneCopy(status, target.ctx);
    if (!copy) return NOT_SENT; // defensive — isEmailMilestone already guarded this

    return await dispatchShipmentEmail(
      target,
      copy,
      target.ctx,
      "shipment_status",
      status,
      attachments,
    );
  } catch (err) {
    // Absolute guarantee: never let an email failure bubble into the caller.
    Sentry.captureException(err, {
      tags: { location: "sendShipmentMilestoneEmail" },
      extra: { shipmentId, status },
    });
    return NOT_SENT;
  }
}

/**
 * Sends "your airway bill is ready", with the label PDF attached.
 *
 * Called by the booking jobs once the carrier has issued the waybill and the
 * label is filed against the shipment. Same guarantees as the milestone senders:
 * it never throws, and a missing recipient or a Resend failure is reported to
 * Sentry rather than failing a booking that has already completely succeeded.
 *
 * ROUTED ON `BOOKED`, not PROCESSING, for the business-associate client-email
 * gate. This email is the second half of the booking confirmation — that email
 * is what promised the waybill — so an associate who opted their client into
 * booking confirmations has, by the same choice, opted them into receiving the
 * document that confirmation promised. Splitting the two across different
 * milestones would let a client be told "your airway bill is coming" and then
 * never be sent it.
 *
 * The label travels as a URL rather than bytes: it is already on UploadThing by
 * the time this runs and Resend fetches it itself, which keeps a few hundred
 * kilobytes out of the job's step state. A shipment with no stored label still
 * gets the email — the number is the useful part, and the copy adjusts to point
 * at the shipment page instead.
 */
export async function sendAwbReadyEmail(
  shipmentId: string,
  input: {
    awbNumber: string;
    carrierName?: string | null;
    trackingUrl?: string | null;
    /**
     * Every label filed for this waybill, most authoritative first. A domestic
     * shipment carries two — the courier's own label and Arena's rendering of
     * the same waybill — and the copy tells the customer to print the first.
     */
    labels?: ShipmentEmailAttachment[] | null;
  },
): Promise<ShipmentEmailResult> {
  try {
    if (!process.env.RESEND_API_KEY) {
      Sentry.addBreadcrumb({
        level: "warning",
        message: "Skipping AWB email — RESEND_API_KEY not set",
        data: { shipmentId },
      });
      return NOT_SENT;
    }

    const target = await resolveShipmentEmailTarget(
      shipmentId,
      ShipmentStatus.BOOKED,
    );
    if (!target) return NOT_SENT;

    // The waybill just issued wins over whatever tracking the shipment carried
    // before: this email is about THIS number, and the label attached to it
    // prints exactly this one.
    const ctx: ShipmentEmailContext = {
      ...target.ctx,
      trackingNumber: input.awbNumber,
      trackingUrl: input.trackingUrl?.trim() || target.ctx.trackingUrl,
    };

    const labels = (input.labels ?? []).filter(
      (label) => Boolean(label?.url) && Boolean(label?.filename),
    );

    const copy = getAwbReadyCopy(ctx, {
      // "confirmed with ..." in the body. The name comes from whatever the
      // booking adapter reported, which for an own-brand vendor is the vendor
      // ("ShipGlobal Direct"), so it takes the same swap as the service line
      // above. A genuine carrier (DHL, Delhivery) is returned untouched.
      carrierName: brandServiceName(input.carrierName) || null,
      labelCount: labels.length,
    });

    return await dispatchShipmentEmail(
      target,
      copy,
      ctx,
      "shipment_awb",
      "awb_ready",
      labels.length ? labels : undefined,
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { location: "sendAwbReadyEmail" },
      extra: { shipmentId, awbNumber: input.awbNumber },
    });
    return NOT_SENT;
  }
}

/**
 * Sends the customer-facing email for a first-mile (door → hub) milestone. Same
 * guarantees as sendShipmentMilestoneEmail: never throws, no-ops for stages that
 * do not warrant an email, and routes through the exact same recipient/identity
 * logic so a BA's client-email choices are honoured here too.
 *
 * The email carries the FIRST-MILE courier's tracking (not the HAWB), so the
 * resolved main-leg tracking in ctx is swapped out before rendering.
 */
export async function sendFirstMileMilestoneEmail(
  shipmentId: string,
  status: FirstMileStatus,
): Promise<ShipmentEmailResult> {
  try {
    if (!isFirstMileEmailMilestone(status)) return NOT_SENT;

    if (!process.env.RESEND_API_KEY) {
      Sentry.addBreadcrumb({
        level: "warning",
        message: `Skipping first-mile email (${status}) — RESEND_API_KEY not set`,
        data: { shipmentId },
      });
      return NOT_SENT;
    }

    // First-mile updates belong to the "processing" phase for the purpose of the
    // BA client-email opt-in gate — there is no dedicated first-mile milestone
    // in that setting, and PROCESSING is the closest true equivalent.
    const target = await resolveShipmentEmailTarget(shipmentId, ShipmentStatus.PROCESSING);
    if (!target) return NOT_SENT;

    const ctx: ShipmentEmailContext = {
      ...target.ctx,
      trackingNumber: target.firstMileTrackingNumber,
      trackingUrl: target.firstMileTrackingUrl,
    };

    const copy = getFirstMileMilestoneCopy(status, ctx);
    if (!copy) return NOT_SENT;

    return await dispatchShipmentEmail(
      target,
      copy,
      ctx,
      "first_mile_status",
      `first_mile:${status}`,
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { location: "sendFirstMileMilestoneEmail" },
      extra: { shipmentId, status },
    });
    return NOT_SENT;
  }
}
