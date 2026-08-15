/**
 * lib/inngest/functions/sweepRateLane.ts
 *
 * One vendor, one country, thirty weights. Eighty of these run per sweep.
 *
 * ── THIS FUNCTION IS THE RATE LIMITER ───────────────────────────────────────
 * Everything about how fast the sweep hits a vendor is decided by two lines of
 * config on this function and nothing else, so they are worth reading carefully
 * before changing either.
 *
 *   concurrency: { limit: 1, key: "event.data.vendorId" }
 *       One lane per vendor in flight at a time. The other nineteen queue.
 *       Without this, eighty lanes would start at once and every pacing sleep
 *       below would be multiplied by twenty.
 *
 *   step.sleep(pacingDelayMsFor(vendorId)) between cells
 *       Turns "one lane at a time" into a known calls-per-minute figure.
 *
 * Together: exactly one call per vendor per pacing interval, across the whole
 * sweep, enforced by the platform rather than by anything we have to keep
 * correct across crashes and deploys.
 *
 * sKart publishes ten requests a minute and is paced at eight, so its share of
 * the matrix takes about 75 minutes. Everyone else is at thirty and finishes in
 * twenty. All four vendors run in parallel because the concurrency key is the
 * vendor, so the sweep is done in a little over an hour.
 *
 * ── WHY THE SLEEPS ARE DURABLE STEPS ────────────────────────────────────────
 * A `setTimeout` would hold an HTTP handler open for 75 minutes and die with the
 * first deploy. `step.sleep` suspends the run entirely and resumes it later,
 * which is the difference between a job that survives a Friday deploy and one
 * that silently stops halfway through the matrix.
 *
 * ── WHAT HAPPENS WHEN A VENDOR MISBEHAVES ───────────────────────────────────
 *   429            RetryAfterError with the vendor's own interval. Because this
 *                  run holds the vendor's only concurrency slot while it waits,
 *                  every other lane for that vendor waits with it. One 429
 *                  pauses the vendor, not just this lane.
 *   401 / 403      the whole vendor is abandoned for this run. The remaining
 *                  cells are written as SKIPPED so the gap is explained, and the
 *                  other nineteen lanes for that vendor stop as they start.
 *                  Continuing would be 600 more failures against a dead key.
 *   5xx / timeout  Inngest retries that one cell. The cells already done are
 *                  memoised, so a retry costs one call, not thirty.
 *   no service     recorded and skipped. Not an error, and not retried.
 */

import * as Sentry from "@sentry/nextjs";
import { RetryAfterError } from "inngest";

import { RateSweepCallStatus, RateSweepStatus } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { adapterRegistry } from "@/lib/rate-adapters/vendors/index";
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  SWEEP_COUNTRIES,
  WEIGHT_SLABS_KG,
  pacingDelayMsFor,
} from "@/lib/rateSweep/config";
import {
  SweepCellRetriableError,
  executeSweepCell,
  recordSkippedCell,
} from "@/lib/rateSweep/execute";
import { completeLane } from "@/lib/rateSweep/run";

import {
  inngest,
  rateSweepFinaliseRequested,
  rateSweepLaneRequested,
} from "../client";

export const sweepRateLane = inngest.createFunction(
  {
    id: "sweep-rate-lane",
    name: "Rate sweep: one vendor, one country",

    triggers: [rateSweepLaneRequested],

    // THE rate limit. See the note at the top of this file before touching it.
    concurrency: [{ limit: 1, key: "event.data.vendorId" }],

    // Per cell, not per lane: a cell that fails is retried on its own and the
    // twenty-nine already done stay memoised. Three is enough for a transient
    // 5xx and small enough that a genuinely broken lane fails while the sweep
    // still has night left to finish the others.
    retries: 3,

    // A lane cannot take longer than its own pacing plus slack. Without this,
    // one wedged lane holds a vendor's concurrency slot forever and silently
    // costs that vendor the entire sweep.
    timeouts: { finish: "3h" },

    /**
     * The lane died with its retries exhausted, so the counter increment at the
     * end of the body never ran. Without this handler the run would sit at
     * 79/80 for ever and never finalise.
     *
     * Deliberately does the same two things the happy path does: count the lane,
     * and fire finalise if it was the last. The planner's sleep is a second
     * backstop behind this one, not a replacement for it.
     */
    onFailure: async ({ event, error, step }) => {
      const { runId, vendorId, countryCode } = event.data.event.data;

      Sentry.captureException(error, {
        tags: { location: "sweepRateLane.onFailure", vendorId },
        extra: { runId, countryCode },
      });

      const completion = await step.run("count-failed-lane", () =>
        completeLane({ runId, failed: true }),
      );

      if (completion.wasLast) {
        await step.sendEvent("finalise-after-failure", {
          name: rateSweepFinaliseRequested.name,
          data: { runId },
        });
      }
    },
  },

  async ({ event, step, attempt, logger }) => {
    const { runId, vendorId, countryCode } = event.data;

    /**
     * Count the lane and, if it was the last one standing, ask for the run to
     * be closed.
     *
     * The increment is atomic and returns the post-increment value, so exactly
     * one lane can ever see itself as last. Firing an event rather than
     * finalising inline keeps the closing work out of a run whose concurrency
     * slot the next lane is already waiting for.
     *
     * A closure rather than a module-level function purely so `step` keeps its
     * real type instead of being hand-declared at the call site.
     */
    const finishLane = async (failed: boolean, reason: string | null) => {
      const completion = await step.run("complete-lane", () =>
        completeLane({ runId, failed }),
      );

      if (completion.wasLast) {
        await step.sendEvent("finalise-sweep", {
          name: rateSweepFinaliseRequested.name,
          data: { runId },
        });
      }

      return {
        vendorId,
        countryCode,
        stopped: reason,
        lanesCompleted: completion.lanesCompleted,
        laneCount: completion.laneCount,
      };
    };

    const country = SWEEP_COUNTRIES.find((c) => c.code === countryCode);
    const adapter = adapterRegistry.get(vendorId);

    // Neither of these can be fixed by retrying: the config changed under a
    // queued event, or a vendor was removed from the registry between the
    // planner fanning out and this lane starting. Count the lane and leave,
    // rather than failing and making the operator wonder what broke.
    if (!country || !adapter) {
      logger.warn("Rate sweep lane has nothing to do", {
        runId,
        vendorId,
        countryCode,
        hasCountry: Boolean(country),
        hasAdapter: Boolean(adapter),
      });

      return finishLane(true, "unknown vendor or country");
    }

    const pacingMs = pacingDelayMsFor(vendorId);
    let stopReason: string | null = null;

    for (let index = 0; index < WEIGHT_SLABS_KG.length; index += 1) {
      const weightKg = WEIGHT_SLABS_KG[index];

      // Every remaining cell after a stop is written as SKIPPED rather than
      // left absent, so the table never has an unexplained hole. A gap that
      // says why is worth the row it costs.
      if (stopReason) {
        await step.run(`skip-${weightKg}`, () =>
          recordSkippedCell({
            runId,
            vendorId,
            vendorName: adapter.vendorName,
            cell: { country, weightKg },
            reason: stopReason!,
          }),
        );
        continue;
      }

      // Before the call, not after, so the pace holds even when a cell fails
      // fast. Skipped on the first cell because the queue wait already spaced
      // this lane from the previous one.
      if (index > 0) {
        await step.sleep(`pace-${weightKg}`, pacingMs);
      }

      const outcome = await step.run(`quote-${weightKg}`, async () => {
        try {
          return await executeSweepCell({
            runId,
            adapter,
            cell: { country, weightKg },
            attempt: attempt + 1,
          });
        } catch (error) {
          if (error instanceof SweepCellRetriableError) {
            // Hand a 429 back to the platform with the vendor's own interval.
            // This run keeps the vendor's concurrency slot while it waits, so
            // the pause applies to every lane for that vendor, not just this one.
            if (error.kind === "RATE_LIMITED") {
              const seconds =
                error.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
              throw new RetryAfterError(error.message, `${seconds}s`);
            }
          }
          throw error;
        }
      });

      if (outcome.stopVendor) {
        stopReason = `${vendorId} returned ${outcome.status} on ${country.code} at ${weightKg}kg; abandoned for this run.`;

        Sentry.captureMessage("Rate sweep abandoned a vendor mid-run", {
          level: "error",
          tags: { location: "sweepRateLane", vendorId },
          extra: { runId, countryCode, weightKg, status: outcome.status },
        });
      }
    }

    return finishLane(stopReason !== null, stopReason);
  },
);

/**
 * How many cells of a run are still unaccounted for. Read by the admin screen
 * to show progress on a sweep in flight, and by the planner before it decides a
 * run is stuck rather than merely slow.
 */
export async function sweepProgress(runId: string) {
  const [run, calls] = await Promise.all([
    prisma.rateSweepRun.findUnique({
      where: { id: runId },
      select: {
        status: true,
        laneCount: true,
        lanesCompleted: true,
        plannedCalls: true,
      },
    }),
    prisma.rateSweepCall.groupBy({
      by: ["status"],
      where: { runId },
      _count: { _all: true },
    }),
  ]);

  if (!run) return null;

  const made = calls.reduce((sum, group) => sum + group._count._all, 0);

  return {
    isRunning: run.status === RateSweepStatus.RUNNING,
    lanesCompleted: run.lanesCompleted,
    laneCount: run.laneCount,
    callsMade: made,
    plannedCalls: run.plannedCalls,
    ok: calls.find((g) => g.status === RateSweepCallStatus.OK)?._count._all ?? 0,
  };
}
