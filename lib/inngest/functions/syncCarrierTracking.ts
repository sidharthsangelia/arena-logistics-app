import * as Sentry from "@sentry/nextjs";

import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/utils/db";
import { ShipmentMode } from "@/generated/prisma";
import { getShipmentLiveTracking } from "@/lib/services/shipmentLiveTracking.service";
import { syncShipmentStatusFromTracking } from "@/lib/tracking/carrierStatusSync";
import {
  CARRIER_SYNC_JOB_MAX_AGE_DAYS,
  SYNCABLE_STATUSES,
  carrierSyncSlotHour,
  carrierSyncWindowStart,
  isDueForCarrierSync,
} from "@/lib/tracking/carrierStatus";

/**
 * lib/inngest/functions/syncCarrierTracking.ts
 *
 * Every 4 hours, ask the carrier about the shipments still on their way that
 * are due this run, and move each status forward (with the milestone email)
 * when the scans are ahead. The detail page does the same on view; this covers
 * shipments nobody opens.
 *
 * WHO IS DUE. Older shipments are asked less often: every 4h in the first
 * week, 8h in the second, 12h after that, and not at all past 21 days. Out
 * for delivery is always due. The tiers and limits live in
 * lib/tracking/carrierStatus.ts (CARRIER_SYNC_TIERS) and are adjustable in
 * multiples of 4h; a slower tier simply joins fewer of these runs.
 *
 * COST. Inngest bills one execution per run plus one per step, so the work is
 * BATCHED: one step per BATCH_SIZE shipments, not one run per shipment. At 180
 * runs a month that is roughly 0.7k executions at 100 shipments in transit and
 * 36k at 10,000, inside the free tier. One run per shipment would be ~540k and
 * ~5.4M. Do not "simplify" this into a fan-out.
 *
 * TIME. A step is one HTTP invocation, capped by maxDuration (60s) on
 * app/api/inngest. Each lookup has a 10s deadline, so BATCH_SIZE / CONCURRENCY
 * lookups in a row must stay well under that: 50 / 10 is five deep, 50s at the
 * very worst and a few seconds normally.
 *
 * WHAT IS SKIPPED
 *   - anything delivered, cancelled or parked by ops (see SYNCABLE_STATUSES)
 *   - Shipmozo domestic: its webhook already pushes every scan
 *   - anything booked before CARRIER_SYNC_STARTS_AT (old trials and dead
 *     bookings) or more than CARRIER_SYNC_JOB_MAX_AGE_DAYS ago, so a waybill
 *     nobody closed is not polled for ever (lib/tracking/carrierStatus.ts)
 */

const BATCH_SIZE = 50;
const CONCURRENCY = 10;

export const syncCarrierTracking = inngest.createFunction(
  {
    id: "sync-carrier-tracking",
    name: "Tracking: sync shipment status from carriers",
    triggers: [{ cron: "TZ=Asia/Kolkata 15 */4 * * *" }],
    // Two overlapping sweeps would double every carrier's call rate.
    concurrency: [{ limit: 1 }],
    retries: 1,
  },

  async ({ step, logger }) => {
    const numbers = await step.run("list-shipments", async () => {
      // Read once inside the step, so a retried run keeps the slot it started in.
      const now = new Date();
      const slotHour = carrierSyncSlotHour(now);
      const since = carrierSyncWindowStart(now, CARRIER_SYNC_JOB_MAX_AGE_DAYS);
      const rows = await prisma.shipment.findMany({
        where: {
          status: { in: SYNCABLE_STATUSES },
          AND: [
            // Older rows have no bookedAt; their creation date stands in.
            {
              OR: [
                { bookedAt: { gte: since } },
                { bookedAt: null, createdAt: { gte: since } },
              ],
            },
          ],
          OR: [
            {
              mode: ShipmentMode.DOMESTIC,
              domesticAwbNumber: { not: null },
              // notIn also drops nulls, which the tracker reads as Shipmozo.
              domesticCourierVendorId: { notIn: ["shipmozo"] },
            },
            {
              mode: ShipmentMode.INTERNATIONAL,
              OR: [
                { intlAwbNumber: { not: null } },
                { hawbNumber: { not: null } },
                { mawbNumber: { not: null } },
              ],
            },
          ],
        },
        select: {
          shipmentNumber: true,
          status: true,
          bookedAt: true,
          createdAt: true,
        },
        orderBy: { bookedAt: "asc" },
      });
      // Filtered here rather than in SQL: the tier rule is easier to keep in
      // one tested function, and the row count is bounded by 21 days of bookings.
      return rows
        .filter((r) =>
          isDueForCarrierSync(r.status, r.bookedAt, r.createdAt, slotHour, now),
        )
        .map((r) => r.shipmentNumber);
    });

    if (numbers.length === 0) return { checked: 0, moved: 0, problems: 0 };

    let moved = 0;
    let problems = 0;
    let failed = 0;

    for (let i = 0; i < numbers.length; i += BATCH_SIZE) {
      const batch = numbers.slice(i, i + BATCH_SIZE);
      const result = await step.run(`sync-batch-${i / BATCH_SIZE}`, () =>
        syncBatch(batch),
      );
      moved += result.moved;
      problems += result.problems;
      failed += result.failed;
    }

    logger.info("Carrier tracking sync finished", {
      checked: numbers.length,
      moved,
      problems,
      failed,
    });
    return { checked: numbers.length, moved, problems, failed };
  },
);

async function syncBatch(
  numbers: string[],
): Promise<{ moved: number; problems: number; failed: number }> {
  let moved = 0;
  let problems = 0;
  let failed = 0;
  let next = 0;

  // A small worker pool: CONCURRENCY lookups in flight, never more, so one
  // batch cannot burst a carrier's rate limit.
  async function worker() {
    while (next < numbers.length) {
      const number = numbers[next++];
      try {
        const live = await getShipmentLiveTracking(number, { kind: "arena" });
        if (live.state === "unavailable") {
          failed++;
          continue;
        }
        const outcome = await syncShipmentStatusFromTracking(number, live);
        if (outcome.changed) moved++;
        if (outcome.problemRaised) problems++;
      } catch (err) {
        // One shipment never sinks the batch; a retried step would re-ask the
        // carrier for all fifty.
        failed++;
        Sentry.captureException(err, {
          tags: { location: "syncCarrierTracking" },
          extra: { shipmentNumber: number },
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, numbers.length) }, worker),
  );
  return { moved, problems, failed };
}
