"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { Decimal } from "@/generated/prisma/runtime/client";
import {
  ArenaForbiddenError,
  getActorName,
  requireArenaAdmin,
  requireArenaMember,
} from "@/utils/arena-auth";
import { amountOwed, deriveCollectionStatus } from "@/lib/wallet/collections";
import {
  recordCollectionSchema,
  reverseCollectionSchema,
  writeOffCollectionSchema,
  type CollectionMutationResult,
} from "@/lib/wallet/schema";

/**
 * Recording money collected on bookings that skipped payment up front.
 *
 * WHO CAN DO WHAT
 *   Recording a payment  — any Arena staff member. The person taking cash when a
 *     parcel reaches the hub is often not an admin, and making them find one would
 *     mean the payment gets written down on paper instead.
 *   Reversing a payment  — admins only. This is the operation that can hide money.
 *   Writing off a balance — admins only. It is a decision to stop chasing.
 *
 * THIS DOES NOT TOUCH THE WALLET. A deferred payment is money paid directly for
 * one shipment; it never passes through the org's wallet balance, so there is
 * nothing to credit and no cache to invalidate. Crediting the wallet here would
 * hand the org spendable balance they never topped up.
 */

const COLLECTION_PATHS = ["/arena-dashboard/wallets", "/arena-dashboard/bookings"];

function revalidateCollectionViews(shipmentId: string) {
  for (const path of COLLECTION_PATHS) revalidatePath(path);
  revalidatePath(`/arena-dashboard/bookings/${shipmentId}`);
}

function toNumber(value: Decimal | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Recompute a shipment's collected total and status from its live collection rows,
 * inside the caller's transaction.
 *
 * Always derived from the rows rather than incremented, so a reversal and a
 * recording share one code path and the cached figures on Shipment cannot drift
 * away from the collections behind them.
 */
async function syncShipmentCollectionState(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  shipmentId: string,
) {
  const [shipment, live] = await Promise.all([
    tx.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      select: { quotedTotal: true, paymentCollectionStatus: true },
    }),
    tx.paymentCollection.aggregate({
      where: { shipmentId, reversedAt: null },
      _sum: { amount: true },
    }),
  ]);

  const collected = toNumber(live._sum.amount);
  const quotedTotal = shipment.quotedTotal == null ? null : toNumber(shipment.quotedTotal);

  const status = deriveCollectionStatus({
    collected,
    quotedTotal,
    currentStatus: shipment.paymentCollectionStatus,
  });

  await tx.shipment.update({
    where: { id: shipmentId },
    data: {
      paymentCollectedAmount: new Decimal(collected.toFixed(4)),
      paymentCollectionStatus: status,
    },
  });

  return { collected, quotedTotal, status };
}

// ---------------------------------------------------------------------------
// Record a payment
// ---------------------------------------------------------------------------

export async function recordPaymentCollectionAction(
  input: unknown,
): Promise<CollectionMutationResult> {
  try {
    const staff = await requireArenaMember();

    const parsed = recordCollectionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
    }

    const { shipmentId, amount, method, reference, note, collectedAt } = parsed.data;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        shipmentNumber: true,
        currency: true,
        quotedTotal: true,
        paymentDeferred: true,
        paymentCollectedAmount: true,
      },
    });

    if (!shipment) return { ok: false, error: "That shipment no longer exists." };

    if (!shipment.paymentDeferred) {
      return {
        ok: false,
        error: "This booking was paid from the wallet at booking time, so there is nothing to collect.",
      };
    }

    if (shipment.quotedTotal == null) {
      return {
        ok: false,
        error:
          "This booking has no total on it, so there is no amount to collect against. Add the price to the shipment first.",
      };
    }

    const quotedTotal = toNumber(shipment.quotedTotal);
    const alreadyCollected = toNumber(shipment.paymentCollectedAmount);
    const owed = amountOwed(quotedTotal, alreadyCollected);

    if (owed <= 0) {
      return { ok: false, error: "This booking is already fully paid." };
    }

    // Over-collecting is a data entry error, not a credit. Rejecting it with the
    // exact figure is more useful than silently capping the amount.
    if (amount > owed + 0.01) {
      return {
        ok: false,
        error: `That is more than the ${owed.toLocaleString("en-IN", {
          style: "currency",
          currency: shipment.currency,
        })} still owed. Record the amount actually received.`,
      };
    }

    const actorName = await getActorName(staff.userId);

    const result = await prisma.$transaction(async (tx) => {
      await tx.paymentCollection.create({
        data: {
          shipmentId,
          amount: new Decimal(amount.toFixed(4)),
          currency: shipment.currency,
          method,
          reference,
          note,
          collectedAt: new Date(collectedAt),
          recordedByUserId: staff.userId,
          recordedByName: actorName,
        },
      });

      return syncShipmentCollectionState(tx, shipmentId);
    });

    revalidateCollectionViews(shipmentId);

    Sentry.addBreadcrumb({
      level: "info",
      message: `Collection recorded for ${shipment.shipmentNumber}`,
      data: { shipmentId, amount, method, by: staff.userId, status: result.status },
    });

    const remaining = amountOwed(result.quotedTotal, result.collected);

    return {
      ok: true,
      message:
        remaining > 0
          ? `Payment recorded. ${remaining.toLocaleString("en-IN", {
              style: "currency",
              currency: shipment.currency,
            })} still owed.`
          : "Payment recorded. This booking is now fully paid.",
    };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) return { ok: false, error: error.message };

    Sentry.captureException(error, { tags: { location: "recordPaymentCollectionAction" } });
    return { ok: false, error: "Could not record the payment. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Reverse a payment
// ---------------------------------------------------------------------------

export async function reversePaymentCollectionAction(
  input: unknown,
): Promise<CollectionMutationResult> {
  try {
    const admin = await requireArenaAdmin();

    const parsed = reverseCollectionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Give a reason for the reversal." };
    }

    const { collectionId, reason } = parsed.data;

    const collection = await prisma.paymentCollection.findUnique({
      where: { id: collectionId },
      select: { id: true, shipmentId: true, reversedAt: true, amount: true },
    });

    if (!collection) return { ok: false, error: "That payment record no longer exists." };
    if (collection.reversedAt) {
      return { ok: false, error: "That payment has already been reversed." };
    }

    const actorName = await getActorName(admin.userId);

    await prisma.$transaction(async (tx) => {
      // A reversal is a state, never a delete. The mistake stays in the history
      // with its reason attached, which is the whole point of an audit trail.
      await tx.paymentCollection.update({
        where: { id: collectionId },
        data: {
          reversedAt: new Date(),
          reversedByUserId: admin.userId,
          reversedByName: actorName,
          reversalReason: reason,
        },
      });

      await syncShipmentCollectionState(tx, collection.shipmentId);
    });

    revalidateCollectionViews(collection.shipmentId);

    Sentry.addBreadcrumb({
      level: "info",
      message: `Collection ${collectionId} reversed`,
      data: { collectionId, amount: toNumber(collection.amount), by: admin.userId },
    });

    return { ok: true, message: "Payment reversed. The balance owed has gone back up." };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) return { ok: false, error: error.message };

    Sentry.captureException(error, { tags: { location: "reversePaymentCollectionAction" } });
    return { ok: false, error: "Could not reverse the payment. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Write off a balance
// ---------------------------------------------------------------------------

export async function writeOffCollectionAction(
  input: unknown,
): Promise<CollectionMutationResult> {
  try {
    const admin = await requireArenaAdmin();

    const parsed = writeOffCollectionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Give a reason for writing this off." };
    }

    const { shipmentId, reason } = parsed.data;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        shipmentNumber: true,
        paymentDeferred: true,
        paymentCollectionStatus: true,
        internalNotes: true,
      },
    });

    if (!shipment) return { ok: false, error: "That shipment no longer exists." };

    if (!shipment.paymentDeferred) {
      return { ok: false, error: "This booking was paid at booking time, so there is nothing to write off." };
    }

    if (shipment.paymentCollectionStatus === "COLLECTED") {
      return { ok: false, error: "This booking is fully paid. There is nothing to write off." };
    }

    if (shipment.paymentCollectionStatus === "WRITTEN_OFF") {
      return { ok: false, error: "This balance is already written off." };
    }

    const actorName = await getActorName(admin.userId);
    const stamp = new Date().toISOString().slice(0, 10);

    // Appended to the ops notes rather than a dedicated column: it is exactly the
    // free-form operational history internalNotes exists for, and it shows up
    // wherever ops already reads the shipment.
    const entry = `[${stamp}] Balance written off by ${actorName ?? "an admin"}: ${reason}`;
    const internalNotes = shipment.internalNotes
      ? `${shipment.internalNotes}\n${entry}`
      : entry;

    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { paymentCollectionStatus: "WRITTEN_OFF", internalNotes },
    });

    revalidateCollectionViews(shipmentId);

    Sentry.captureMessage(`Deferred balance written off for ${shipment.shipmentNumber}`, {
      level: "warning",
      tags: { location: "writeOffCollectionAction" },
      extra: { shipmentId, reason, by: admin.userId },
    });

    return { ok: true, message: "Balance written off. It no longer counts as money owed." };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) return { ok: false, error: error.message };

    Sentry.captureException(error, { tags: { location: "writeOffCollectionAction" } });
    return { ok: false, error: "Could not write this off. Please try again." };
  }
}
