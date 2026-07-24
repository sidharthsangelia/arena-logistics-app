import "server-only";

import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { Prisma } from "@/generated/prisma";
import {
  notifyCollectionOverdue,
  notifyQuoteExpiring,
  notifyShipmentStuck,
} from "./emit";
import { pruneOldNotifications } from "./queries";

/**
 * THE ATTENTION SWEEP
 * -----------------------------------------------------------------------------
 * The other notifications in this app are reactions to something happening. These
 * three are the opposite: they fire because nothing happened. A booking nobody
 * picked up, a debt nobody chased, a quote nobody followed up. There is no event to
 * hang them off, so something has to go looking.
 *
 * Idempotency is the whole design. The sweep re-evaluates the same facts on every
 * run and computes the same dedupeKey for each, so running it twice in an hour or
 * five times after a retry produces the same inbox. That is what makes it safe to
 * point a cron at without any run-state to keep.
 *
 * Escalation comes from putting a bucket in the key. A debt at eight days notifies
 * once; the same debt at sixteen days computes a different key and notifies again.
 * Without the bucket it would either shout every single run or go quiet forever
 * while quietly getting worse, and both of those teach people to ignore it.
 */

export interface SweepSummary {
  collectionsNotified: number;
  stuckNotified: number;
  quotesNotified: number;
  pruned: number;
  /** Wall clock, so a slow sweep is visible in the response rather than inferred. */
  durationMs: number;
}

const DAY_MS = 86_400_000;

/**
 * Days a shipment may sit in each status before somebody should look at it.
 *
 * These are per status because the tolerances genuinely differ by an order of
 * magnitude: a booking untouched for two days is a problem, and a container in
 * transit for two days is Tuesday. A single global threshold would have to be set
 * to the longest of them, which would make it useless for the short ones.
 *
 * Statuses absent from this map are terminal (DELIVERED, CANCELLED) or not yet real
 * work (DRAFT, PENDING_PAYMENT), and are never chased.
 */
const STUCK_TOLERANCE_DAYS: Record<string, number> = {
  BOOKED: 2,
  PROCESSING: 3,
  DOCUMENTS_PENDING: 3,
  CUSTOMS_HOLD: 3,
  ON_HOLD: 5,
  IN_TRANSIT: 12,
  OUT_FOR_DELIVERY: 3,
};

const STATUS_LABELS: Record<string, string> = {
  BOOKED: "Booked",
  PROCESSING: "Processing",
  DOCUMENTS_PENDING: "Documents pending",
  CUSTOMS_HOLD: "Customs hold",
  ON_HOLD: "On hold",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
};

/**
 * How many escalations a single stuck shipment can produce, ever.
 *
 * Past the third nobody is learning anything new, and the row is still sitting in
 * the history and on the bookings queue. A notification that repeats forever is one
 * people filter out, which costs us the first one too.
 */
const MAX_STUCK_ESCALATIONS = 3;

/** Ages at which an uncollected payment is worth saying something about again. */
const COLLECTION_BUCKETS = [7, 14, 30, 60] as const;

/**
 * The highest threshold this age has passed, or null if none.
 *
 * Returning only the highest is what keeps a 40-day debt from emitting the 7, 14 and
 * 30 day notifications all at once the first time the sweep sees it.
 */
export function collectionBucketFor(ageDays: number): number | null {
  let bucket: number | null = null;
  for (const threshold of COLLECTION_BUCKETS) {
    if (ageDays >= threshold) bucket = threshold;
  }
  return bucket;
}

/** Which multiple of the tolerance this delay has reached, capped. */
export function stuckBucketFor(days: number, toleranceDays: number): number | null {
  if (toleranceDays <= 0 || days < toleranceDays) return null;
  return Math.min(Math.floor(days / toleranceDays), MAX_STUCK_ESCALATIONS);
}

export async function runAttentionSweep(now = new Date()): Promise<SweepSummary> {
  const startedAt = Date.now();

  // Sequential rather than parallel, on purpose. This runs on a schedule with
  // nobody waiting, and three concurrent sweeps against a serverless Postgres
  // connection buys milliseconds at the cost of connection pressure.
  const collectionsNotified = await sweepCollections(now);
  const stuckNotified = await sweepStuckShipments(now);
  const quotesNotified = await sweepExpiringQuotes(now);
  const pruned = await pruneOldNotifications();

  return {
    collectionsNotified,
    stuckNotified,
    quotesNotified,
    pruned,
    durationMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Uncollected deferred payments
// ---------------------------------------------------------------------------

async function sweepCollections(now: Date): Promise<number> {
  try {
    const oldest = COLLECTION_BUCKETS[0];
    const cutoff = new Date(now.getTime() - oldest * DAY_MS);

    const shipments = await prisma.shipment.findMany({
      where: {
        paymentDeferred: true,
        paymentCollectionStatus: { in: ["PENDING", "PART_PAID"] },
        // Age is measured from the booking, not from row creation: a draft that sat
        // for a week before being booked does not owe us anything for that week.
        // COALESCE is done in JS below, since bookedAt is nullable for legacy rows.
        OR: [{ bookedAt: { lt: cutoff } }, { bookedAt: null, createdAt: { lt: cutoff } }],
      },
      select: {
        id: true,
        shipmentNumber: true,
        quotedTotal: true,
        paymentCollectedAmount: true,
        bookedAt: true,
        createdAt: true,
        org: { select: { name: true, companyName: true } },
      },
    });

    let notified = 0;

    for (const shipment of shipments) {
      const reference = shipment.bookedAt ?? shipment.createdAt;
      const ageDays = Math.floor((now.getTime() - reference.getTime()) / DAY_MS);
      const bucket = collectionBucketFor(ageDays);
      if (bucket === null) continue;

      const owed =
        Number(shipment.quotedTotal ?? 0) - Number(shipment.paymentCollectedAmount);
      // Settled to within a rupee. Chasing somebody for 40 paise is worse than not
      // chasing them at all.
      if (owed < 1) continue;

      const created = await notifyCollectionOverdue({
        shipmentId: shipment.id,
        shipmentNumber: shipment.shipmentNumber,
        orgName:
          shipment.org?.companyName?.trim() || shipment.org?.name?.trim() || "A customer",
        owed,
        ageDays,
        bucket: String(bucket),
      });

      if (created) notified += 1;
    }

    return notified;
  } catch (error) {
    Sentry.captureException(error, { tags: { location: "sweepCollections" } });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Shipments that have stopped moving
// ---------------------------------------------------------------------------

interface StuckRow {
  id: string;
  shipmentNumber: string;
  status: string;
  orgName: string | null;
  lastMovedAt: Date;
}

async function sweepStuckShipments(now: Date): Promise<number> {
  try {
    const statuses = Object.keys(STUCK_TOLERANCE_DAYS);

    // Raw, because "when did this shipment enter its current status" is a max over a
    // related table, and Prisma's query API cannot express that without fetching
    // every status event for every open shipment and reducing in memory.
    //
    // Joining the events on toStatus = current status is what makes the timestamp
    // mean "entered this status" rather than "was last touched at all". Shipment
    // updatedAt would have been the easy answer and the wrong one: any edit to any
    // field would reset it and hide a shipment that has genuinely stalled.
    const rows = await prisma.$queryRaw<StuckRow[]>`
      SELECT
        s.id,
        s."shipmentNumber",
        s.status::text AS status,
        COALESCE(NULLIF(TRIM(o."companyName"), ''), o.name) AS "orgName",
        COALESCE(MAX(e."createdAt"), s."bookedAt", s."createdAt") AS "lastMovedAt"
      FROM "Shipment" s
      JOIN "Org" o ON o.id = s."orgId"
      LEFT JOIN "ShipmentStatusEvent" e
        ON e."shipmentId" = s.id AND e."toStatus" = s.status
      WHERE s.status::text IN (${Prisma.join(statuses)})
      GROUP BY s.id, s."shipmentNumber", s.status, o."companyName", o.name, s."bookedAt", s."createdAt"
    `;

    let notified = 0;

    for (const row of rows) {
      const tolerance = STUCK_TOLERANCE_DAYS[row.status];
      if (!tolerance) continue;

      const days = Math.floor(
        (now.getTime() - new Date(row.lastMovedAt).getTime()) / DAY_MS,
      );
      const bucket = stuckBucketFor(days, tolerance);
      if (bucket === null) continue;

      const created = await notifyShipmentStuck({
        shipmentId: row.id,
        shipmentNumber: row.shipmentNumber,
        orgName: row.orgName?.trim() || "A customer",
        status: row.status,
        statusLabel: STATUS_LABELS[row.status] ?? row.status,
        days,
        bucket: String(bucket),
      });

      if (created) notified += 1;
    }

    return notified;
  } catch (error) {
    Sentry.captureException(error, { tags: { location: "sweepStuckShipments" } });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Quotes about to lapse
// ---------------------------------------------------------------------------

/** How far ahead to warn. Long enough to act, short enough to still be urgent. */
const QUOTE_WARNING_DAYS = 3;

async function sweepExpiringQuotes(now: Date): Promise<number> {
  try {
    const horizon = new Date(now.getTime() + QUOTE_WARNING_DAYS * DAY_MS);

    const quotes = await prisma.quote.findMany({
      where: {
        // Only quotes actually in front of a customer. A DRAFT lapsing is nothing,
        // and an ACCEPTED one lapsing is not a thing that can happen.
        status: "SENT",
        validUntil: { gt: now, lte: horizon },
      },
      select: {
        id: true,
        quoteNumber: true,
        validUntil: true,
        org: { select: { name: true, companyName: true } },
      },
      // Bounded so one badly seeded dataset cannot turn a sweep into a mail merge.
      take: 200,
    });

    let notified = 0;

    for (const quote of quotes) {
      const daysLeft = Math.max(
        0,
        Math.floor((quote.validUntil.getTime() - now.getTime()) / DAY_MS),
      );

      const created = await notifyQuoteExpiring({
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        orgName:
          quote.org?.companyName?.trim() || quote.org?.name?.trim() || "A customer",
        daysLeft,
      });

      if (created) notified += 1;
    }

    return notified;
  } catch (error) {
    Sentry.captureException(error, { tags: { location: "sweepExpiringQuotes" } });
    return 0;
  }
}
