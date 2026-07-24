import "server-only";

import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import type { NoticeSeverity, ShipmentStatus } from "@/generated/prisma";
import { NOTIFICATION_KIND_META, type NotificationKindKey } from "./config";

/**
 * WRITING TO THE INBOX
 * -----------------------------------------------------------------------------
 * Every notification in the app is created through `emitNotification`, which
 * holds three guarantees the callers would otherwise each have to remember:
 *
 *   1. It never throws. A notification is a side effect of something that already
 *      succeeded, so a failure to record it must not turn a completed booking or
 *      a committed status change into an error the user sees. Failures go to
 *      Sentry, which is where somebody can actually act on them.
 *
 *   2. adminOnly is derived from the kind, not passed in. Money notifications
 *      carry amounts, and Phase 1 removed money from non-admin arena members
 *      everywhere; a caller that forgot the flag would quietly undo that. The
 *      kind metadata decides, so there is nothing to forget.
 *
 *   3. dedupeKey collisions are a success, not an error. The scheduled sweep
 *      re-evaluates the same facts every run and computes the same key for each,
 *      so the second run inserting nothing is the intended outcome.
 *
 * Emitters are safe to call from inside `after()`, which is how the request paths
 * use them: the person who triggered the event is not the person reading the
 * notification, so nobody should wait on the write.
 */

interface EmitInput {
  kind: NotificationKindKey;
  title: string;
  body?: string | null;
  severity?: NoticeSeverity;
  /** In-app path. Rejected if it is not one. */
  linkHref?: string | null;
  /** Required for ORG kinds, ignored for ARENA ones. */
  orgId?: string | null;
  shipmentId?: string | null;
  /** Clerk userId when a person authored this. */
  createdBy?: string | null;
  /** Natural key for facts a job re-checks. Omit for one-off events. */
  dedupeKey?: string | null;
}

/**
 * An in-app path and nothing else.
 *
 * The leading-double-slash check is the one that matters: "//evil.example" is a
 * protocol-relative URL that passes a naive "starts with /" test and navigates
 * clean off the site. These strings reach an href, and one of them is authored by
 * hand on the notices screen.
 */
function safePath(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed.slice(0, 500);
}

export async function emitNotification(input: EmitInput): Promise<boolean> {
  try {
    const meta = NOTIFICATION_KIND_META[input.kind];
    if (!meta) {
      Sentry.captureMessage("emitNotification: unknown kind", {
        level: "warning",
        extra: { kind: input.kind },
      });
      return false;
    }

    const scope = meta.scope;
    const orgId = scope === "ORG" ? (input.orgId ?? null) : null;

    // An ORG notification with no org is addressed to nobody. Better to lose it
    // loudly here than to write a row no inbox query will ever return.
    if (scope === "ORG" && !orgId) {
      Sentry.captureMessage("emitNotification: ORG kind without an orgId", {
        level: "warning",
        extra: { kind: input.kind, title: input.title },
      });
      return false;
    }

    const title = input.title.trim().slice(0, 160);
    if (!title) return false;

    await prisma.notification.create({
      data: {
        scope,
        orgId,
        kind: input.kind,
        severity: input.severity ?? "INFO",
        title,
        body: input.body?.trim().slice(0, 600) || null,
        linkHref: safePath(input.linkHref),
        adminOnly: meta.money,
        dedupeKey: input.dedupeKey ?? null,
        shipmentId: input.shipmentId ?? null,
        createdBy: input.createdBy ?? null,
      },
    });

    return true;
  } catch (error) {
    // A unique violation on dedupeKey means the fact was already recorded, which
    // is exactly what the key is for. Not an error, and not worth a Sentry event.
    if (isDuplicateKey(error)) return false;

    Sentry.captureException(error, {
      tags: { location: "emitNotification" },
      extra: { kind: input.kind, orgId: input.orgId ?? null },
    });
    return false;
  }
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

// ---------------------------------------------------------------------------
// Arena: a tenant just booked
// ---------------------------------------------------------------------------

/**
 * Deliberately carries no amount. This is the one arena notification every ops
 * member sees, and the shipment number plus the route is what they need to pick
 * the work up. The quoted total is on the booking itself, behind the money gate.
 */
export async function notifyBookingPlaced(shipmentId: string): Promise<void> {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        shipmentNumber: true,
        paymentDeferred: true,
        org: { select: { name: true, companyName: true } },
        pickupAddress: { select: { city: true, country: true } },
        deliveryAddress: { select: { city: true, country: true } },
      },
    });
    if (!shipment) return;

    const orgLabel =
      shipment.org?.companyName?.trim() || shipment.org?.name?.trim() || "A customer";
    const route = [
      place(shipment.pickupAddress),
      place(shipment.deliveryAddress),
    ].filter(Boolean);

    const parts = [`${orgLabel} booked ${shipment.shipmentNumber}`];
    if (route.length === 2) parts.push(`${route[0]} to ${route[1]}`);
    if (shipment.paymentDeferred) parts.push("Payment is to be collected later");

    await emitNotification({
      kind: "BOOKING_PLACED",
      title: `New booking from ${orgLabel}`,
      body: parts.slice(1).join(". ") || `Shipment ${shipment.shipmentNumber}`,
      severity: "INFO",
      linkHref: `/arena-dashboard/bookings/${shipmentId}`,
      shipmentId,
      // One booking is one event, so a retried action cannot double up.
      dedupeKey: `booking-placed:${shipmentId}`,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "notifyBookingPlaced" },
      extra: { shipmentId },
    });
  }
}

function place(
  address: { city: string | null; country: string | null } | null,
): string | null {
  if (!address) return null;
  return [address.city?.trim(), address.country?.trim()].filter(Boolean).join(", ") || null;
}

// ---------------------------------------------------------------------------
// Tenant: their shipment moved
// ---------------------------------------------------------------------------

/**
 * Fires for every real transition, including the ones that send no email.
 *
 * That is the point of having both. CUSTOMS_HOLD and ON_HOLD have no customer
 * email, by an earlier decision that they need a human explanation rather than a
 * template, and before this there was no way for a tenant to learn about them at
 * all short of opening the shipment. The inbox is where those now land.
 */
export async function notifyShipmentStatusChanged(
  shipmentId: string,
  status: ShipmentStatus,
): Promise<void> {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { orgId: true, shipmentNumber: true },
    });
    if (!shipment) return;

    const copy = TENANT_STATUS_COPY[status];
    if (!copy) return; // DRAFT and PENDING_PAYMENT are not news to anybody

    await emitNotification({
      kind: "SHIPMENT_STATUS",
      orgId: shipment.orgId,
      title: `${shipment.shipmentNumber}: ${copy.title}`,
      body: copy.body,
      severity: copy.severity,
      linkHref: `/shipments/${shipmentId}`,
      shipmentId,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "notifyShipmentStatusChanged" },
      extra: { shipmentId, status },
    });
  }
}

/**
 * Tenant-facing wording for each status.
 *
 * WARNING is used only where the tenant has something to do or decide. A shipment
 * moving through its normal stages is INFO, however much ops cares about it: if
 * routine progress arrives in amber, the colour stops meaning anything by the
 * third shipment.
 */
const TENANT_STATUS_COPY: Partial<
  Record<ShipmentStatus, { title: string; body: string; severity: NoticeSeverity }>
> = {
  BOOKED: {
    title: "Booking confirmed",
    body: "We have the booking and our team is arranging the carrier.",
    severity: "INFO",
  },
  PROCESSING: {
    title: "Being prepared",
    body: "We are finalising the carrier and getting the airway bill ready.",
    severity: "INFO",
  },
  DOCUMENTS_PENDING: {
    title: "We need a document",
    body: "Something is missing before this can move. Open the shipment to see what we need.",
    severity: "WARNING",
  },
  IN_TRANSIT: {
    title: "On its way",
    body: "The shipment has left and is moving toward its destination.",
    severity: "INFO",
  },
  CUSTOMS_HOLD: {
    title: "Held at customs",
    body: "Customs has stopped this shipment. We are on it and will come back to you.",
    severity: "WARNING",
  },
  ON_HOLD: {
    title: "On hold",
    body: "This shipment is paused. Our team will explain and get it moving again.",
    severity: "WARNING",
  },
  OUT_FOR_DELIVERY: {
    title: "Out for delivery",
    body: "Final leg. Someone should be available to receive it.",
    severity: "INFO",
  },
  DELIVERED: {
    title: "Delivered",
    body: "It arrived safely. Thank you for shipping with us.",
    severity: "SUCCESS",
  },
  CANCELLED: {
    title: "Cancelled",
    body: "This shipment has been cancelled. Talk to us if that was not expected.",
    severity: "WARNING",
  },
};

// ---------------------------------------------------------------------------
// Arena: money that failed
// ---------------------------------------------------------------------------

/**
 * A top-up the bank rejected. Written adminOnly by way of the kind metadata,
 * since it names an amount.
 *
 * There is deliberately no counterpart for a SUCCESSFUL top-up. Money arriving is
 * the normal case, several times a day, and a notification per success would bury
 * the failures inside the noise of things that went fine. Successful top-ups are
 * on the wallets ledger, which is where you go to look at them.
 */
export async function notifyTopUpFailed(params: {
  walletTransactionId: string;
  orgName: string;
  amount: number;
  reason: string | null;
}): Promise<void> {
  const amountLabel = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(params.amount);

  await emitNotification({
    kind: "PAYMENT_FAILED",
    title: `Top-up failed: ${params.orgName}`,
    body: [
      `${amountLabel} did not go through.`,
      params.reason?.trim() || null,
      "They may not be able to book until this is sorted.",
    ]
      .filter(Boolean)
      .join(" "),
    severity: "CRITICAL",
    linkHref: "/arena-dashboard/wallets?tab=transactions&status=FAILED",
    // Razorpay retries webhooks, and will deliver the same failure more than once.
    dedupeKey: `topup-failed:${params.walletTransactionId}`,
  });
}

// ---------------------------------------------------------------------------
// Arena: the scheduled attention sweep
//
// Each of these takes an explicit `bucket` that forms part of the dedupe key, so
// a debt that stays unpaid notifies once when it crosses a week, again at two
// weeks, and then not again. Without the bucket it would either notify every
// single run or exactly once and then go quiet while getting worse.
// ---------------------------------------------------------------------------

export async function notifyCollectionOverdue(params: {
  shipmentId: string;
  shipmentNumber: string;
  orgName: string;
  owed: number;
  ageDays: number;
  bucket: string;
}): Promise<boolean> {
  const owedLabel = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(params.owed);

  return emitNotification({
    kind: "COLLECTION_OVERDUE",
    title: `${owedLabel} still to collect from ${params.orgName}`,
    body: `${params.shipmentNumber} was booked ${params.ageDays} days ago without payment, and nothing has been recorded against it yet.`,
    severity: params.ageDays >= 30 ? "CRITICAL" : "WARNING",
    linkHref: `/arena-dashboard/bookings/${params.shipmentId}`,
    shipmentId: params.shipmentId,
    dedupeKey: `collection-overdue:${params.shipmentId}:${params.bucket}`,
  });
}

export async function notifyShipmentStuck(params: {
  shipmentId: string;
  shipmentNumber: string;
  orgName: string;
  status: string;
  statusLabel: string;
  days: number;
  bucket: string;
}): Promise<boolean> {
  return emitNotification({
    kind: "SHIPMENT_STUCK",
    title: `${params.shipmentNumber} has sat at ${params.statusLabel} for ${params.days} days`,
    body: `${params.orgName} is waiting. Nothing has moved on this since it reached ${params.statusLabel}.`,
    severity: params.days >= 7 ? "CRITICAL" : "WARNING",
    linkHref: `/arena-dashboard/bookings/${params.shipmentId}`,
    shipmentId: params.shipmentId,
    dedupeKey: `shipment-stuck:${params.shipmentId}:${params.status}:${params.bucket}`,
  });
}

export async function notifyQuoteExpiring(params: {
  quoteId: string;
  quoteNumber: string;
  orgName: string;
  daysLeft: number;
}): Promise<boolean> {
  return emitNotification({
    kind: "QUOTE_EXPIRING",
    title: `Quote ${params.quoteNumber} lapses in ${params.daysLeft === 0 ? "under a day" : `${params.daysLeft} days`}`,
    body: `${params.orgName} has not accepted it yet. A nudge now is easier than requoting later.`,
    severity: "WARNING",
    linkHref: `/arena-dashboard/quotes`,
    // One warning per quote, ever. A quote has a single expiry, so there is no
    // escalation to stage here.
    dedupeKey: `quote-expiring:${params.quoteId}`,
  });
}

// ---------------------------------------------------------------------------
// Tenant: ops wrote to them
// ---------------------------------------------------------------------------

export async function notifyArenaMessage(params: {
  orgIds: string[];
  title: string;
  body: string;
  severity: NoticeSeverity;
  linkHref: string | null;
  createdBy: string | null;
}): Promise<number> {
  // One row per org rather than one row with many recipients, so read state,
  // deletion and the per-org inbox query all stay simple. The counts here are
  // tens of orgs, not thousands.
  const results = await Promise.all(
    params.orgIds.map((orgId) =>
      emitNotification({
        kind: "ARENA_MESSAGE",
        orgId,
        title: params.title,
        body: params.body,
        severity: params.severity,
        linkHref: params.linkHref,
        createdBy: params.createdBy,
      }),
    ),
  );

  return results.filter(Boolean).length;
}
