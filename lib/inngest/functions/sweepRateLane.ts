/**
 * lib/inngest/functions/sweepRateLane.ts
 *
 * One vendor, one country, thirty weights. One of these per lane per sweep.
 *
 * ── HOW FAST THIS ACTUALLY HITS A VENDOR ────────────────────────────────────
 * Two things shape it, and an earlier version of this comment was wrong about
 * both, in a way that mattered. What follows is what the run data says.
 *
 *   concurrency: { limit: 1, key: "event.data.vendorId" }
 *       Exactly one step per vendor EXECUTES at a time. It does NOT mean one
 *       lane at a time: a run that is sleeping is not executing, so it gives up
 *       the slot, and all twenty-six of a vendor's lanes interleave through that
 *       single slot from the moment they are fanned out. Measured on the 20 Aug
 *       run, every lane for a vendor started within five minutes of the others
 *       and then advanced in lockstep.
 *
 *   step.sleep(pacingDelayMsFor(vendorId)) between cells
 *       Paces one LANE. It does not pace the vendor, because the other
 *       twenty-five lanes are free to use the slot while this one sleeps.
 *
 * So the real call rate per vendor is one call per (vendor latency + platform
 * step overhead), and the pacing figures in config.ts are a ceiling that has
 * never been reached rather than the rate being achieved. Measured: aramex
 * 15/min, shipglobal 12/min, skart 5.3/min against a configured 8. If a vendor
 * ever needs a genuinely enforced ceiling, it needs a throttle, not a sleep.
 *
 * ── WHY THE SLEEPS ARE DURABLE STEPS ────────────────────────────────────────
 * A `setTimeout` would hold a serverless handler open for the duration and burn
 * billed compute doing nothing. `step.sleep` suspends the run entirely and
 * resumes it later, which is also the difference between a job that survives a
 * deploy and one that silently stops halfway through the matrix.
 *
 * ── WHAT HAPPENS WHEN A CELL GOES WRONG ─────────────────────────────────────
 * The governing rule, and the one this file exists to enforce: A BAD CELL COSTS
 * ONE CELL. It used to cost the rest of the lane. `retries` is per step, but an
 * exhausted step throws into the function body, and a body that does not catch
 * it ends the run with its remaining slabs unasked and unrecorded. That is how
 * a single failing write at 0.25kg turned into a country with no rates at all.
 * Every cell is therefore wrapped, and a cell that gives up is recorded as a
 * gap and stepped over.
 *
 *   429            RetryAfterError with the vendor's own interval, so the step
 *                  waits exactly as long as they asked before trying again.
 *   401 / 403      the whole vendor is abandoned for this run. The remaining
 *                  cells are written as SKIPPED in one insert so the gap is
 *                  explained. Continuing would be hundreds more failures
 *                  against a dead key.
 *   5xx / timeout  Inngest retries that one cell. The cells already done are
 *                  memoised, so a retry costs one call, not thirty. If the
 *                  retries run out, the lane carries on to the next slab.
 *   no service     recorded and stepped over. Not an error, and not retried.
 */

import * as Sentry from "@sentry/nextjs";
import { RetryAfterError, StepError } from "inngest";

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
  recordBlankCells,
  type SweepCellOutcome,
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

    // One executing step per vendor at a time. Read the note at the top of this
    // file before touching it: it does less than its name suggests.
    concurrency: [{ limit: 1, key: "event.data.vendorId" }],

    // Per step: a cell that fails is retried on its own and the twenty-nine
    // already done stay memoised, so a retry costs one vendor call, not thirty.
    // Three is enough for a transient 5xx, and the body now catches a cell that
    // exhausts them rather than letting it end the lane.
    retries: 3,

    // Every lane for a vendor shares one execution slot, so a lane's wall-clock
    // life is most of the vendor's whole share of the matrix: measured at just
    // over two hours for sKart, the slowest. This is the outer bound that stops
    // a genuinely wedged lane from sitting there for ever, not a target.
    timeouts: { finish: "5h" },

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
    /** Where the loop gave up, so the untouched tail can be recorded in one go. */
    let stoppedAt = WEIGHT_SLABS_KG.length;
    /** Slabs whose cell exhausted its retries. Recorded together at the end. */
    const abandonedSlabs: number[] = [];
    /** The first thing that went wrong, which is usually the only interesting one. */
    let firstFailureMessage: string | null = null;

    for (let index = 0; index < WEIGHT_SLABS_KG.length; index += 1) {
      const weightKg = WEIGHT_SLABS_KG[index];

      // Before the call, not after, so the pace holds even when a cell fails
      // fast. Skipped on the first cell because the queue wait already spaced
      // this lane from the previous one.
      if (index > 0) {
        await step.sleep(`pace-${weightKg}`, pacingMs);
      }

      let outcome: SweepCellOutcome;

      try {
        outcome = await step.run(`quote-${weightKg}`, async () => {
          try {
            return await executeSweepCell({
              runId,
              adapter,
              cell: { country, weightKg },
              attempt: attempt + 1,
            });
          } catch (error) {
            if (error instanceof SweepCellRetriableError) {
              // Hand a 429 back to the platform with the vendor's own interval,
              // so this cell waits exactly as long as they asked before its next
              // attempt instead of guessing.
              if (error.kind === "RATE_LIMITED") {
                const seconds =
                  error.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
                throw new RetryAfterError(error.message, `${seconds}s`);
              }
            }
            throw error;
          }
        });
      } catch (error) {
        // THE POINT OF THIS CATCH. The step has used up all its retries, and
        // Inngest has rejected it into the body for us to decide about. Letting
        // it propagate ends the run — the SDK treats a step's own StepError as
        // non-retriable, so the lane simply stops — which forfeits every slab
        // after this one, unasked and unrecorded. One bad write at 0.25kg is
        // how a country ends up with no rates at all. So the cell is noted as a
        // gap and the lane moves on to the next weight.
        //
        // Nothing is swallowed: the slab is recorded below, counted into the
        // lane's failure, and reported to Sentry.
        //
        // ── ONLY A FAILED STEP ────────────────────────────────────────────
        // Narrow on purpose. A step that has not run yet does not reject at all
        // (the SDK suspends the run on an unsettled promise), so nothing here
        // can interfere with normal control flow. But anything that is NOT this
        // step reporting its own failure is a bug in our code or in the SDK, and
        // must be allowed to fail the lane loudly rather than be filed away as
        // thirty cells of "the vendor was flaky".
        if (!isFailedStep(error)) throw error;

        abandonedSlabs.push(weightKg);

        firstFailureMessage ??=
          error instanceof Error ? error.message : String(error);

        continue;
      }

      if (outcome.stopVendor) {
        stopReason = `${vendorId} returned ${outcome.status} on ${country.code} at ${weightKg}kg; abandoned for this run.`;
        stoppedAt = index + 1;

        Sentry.captureMessage("Rate sweep abandoned a vendor mid-run", {
          level: "error",
          tags: { location: "sweepRateLane", vendorId },
          extra: { runId, countryCode, weightKg, status: outcome.status },
        });

        // Nothing after this can succeed, so there is no reason to keep paying
        // a pacing sleep and a step for each remaining slab just to write the
        // same row thirty times. The tail is recorded in one insert below.
        break;
      }
    }

    // ── Account for every cell that did not record itself ────────────────────
    // Absence in this table has to mean "never attempted" and nothing else, so
    // the two kinds of gap are filled in before the lane reports. Both are one
    // batched insert that skips any cell which did manage to write its own row,
    // because that row carries the real vendor error and this one would not.
    //
    // Best-effort on purpose: these are an explanation of a failure, and a lane
    // must never be lost because its explanation could not be written down.
    const gaps: Array<{
      slabs: number[];
      status: RateSweepCallStatus;
      errorKind: string;
      reason: string;
      stepId: string;
    }> = [];

    if (abandonedSlabs.length > 0) {
      gaps.push({
        slabs: abandonedSlabs,
        status: RateSweepCallStatus.VENDOR_ERROR,
        errorKind: "RETRIES_EXHAUSTED",
        reason:
          firstFailureMessage ??
          "Cell exhausted its retries without recording a result.",
        stepId: "record-abandoned-cells",
      });
    }

    if (stopReason && stoppedAt < WEIGHT_SLABS_KG.length) {
      gaps.push({
        slabs: WEIGHT_SLABS_KG.slice(stoppedAt),
        status: RateSweepCallStatus.SKIPPED,
        errorKind: "SKIPPED",
        reason: stopReason,
        stepId: "record-skipped-cells",
      });
    }

    for (const gap of gaps) {
      try {
        await step.run(gap.stepId, () =>
          recordBlankCells({
            runId,
            vendorId,
            vendorName: adapter.vendorName,
            cells: gap.slabs.map((weightKg) => ({ country, weightKg })),
            status: gap.status,
            errorKind: gap.errorKind,
            reason: gap.reason,
          }),
        );
      } catch (error) {
        if (!isFailedStep(error)) throw error;

        Sentry.captureException(error, {
          level: "warning",
          tags: { location: "sweepRateLane.recordGaps", vendorId },
          extra: { runId, countryCode, kind: gap.errorKind, cells: gap.slabs.length },
        });
      }
    }

    if (abandonedSlabs.length > 0) {
      Sentry.captureMessage("Rate sweep lane lost cells to exhausted retries", {
        level: "warning",
        tags: { location: "sweepRateLane", vendorId },
        extra: {
          runId,
          countryCode,
          lostCells: abandonedSlabs.length,
          slabs: abandonedSlabs,
          firstError: firstFailureMessage,
        },
      });
    }

    return finishLane(
      stopReason !== null || abandonedSlabs.length > 0,
      stopReason ??
        (abandonedSlabs.length > 0
          ? `${abandonedSlabs.length} cells exhausted their retries`
          : null),
    );
  },
);

/**
 * Is this a step reporting that it has run out of retries?
 *
 * `instanceof` first, then the name, because the SDK itself duck-types its own
 * error classes this way (see `retriability` in inngest's execution engine) and
 * a bundler that ends up with two copies of the package would otherwise make
 * the instance check quietly false — which here would mean failing a whole lane
 * over one bad cell, the exact thing this is here to prevent.
 */
function isFailedStep(error: unknown): boolean {
  return (
    error instanceof StepError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: string }).name === "StepError")
  );
}

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
