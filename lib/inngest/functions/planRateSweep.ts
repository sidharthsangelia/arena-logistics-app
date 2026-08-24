/**
 * lib/inngest/functions/planRateSweep.ts
 *
 * Opens a sweep: decide who is being asked, open the run row, fan out eighty
 * lanes, then wait around long enough to notice if the run never closes itself.
 *
 * ── THE SCHEDULE ────────────────────────────────────────────────────────────
 * `TZ=Asia/Kolkata 0 1 * /5 * *` — 01:00 IST, every fifth day of the month.
 *
 * Day-of-month stepping is worth understanding rather than discovering: it
 * fires on the 1st, 6th, 11th, 16th, 21st, 26th and 31st, then resets with the
 * month, so the gap across a month boundary is sometimes one day rather than
 * five. That is harmless here. The data is only ever fresher than intended,
 * never staler, and the alternative (an every-N-days cron that actually means
 * it) needs state this job would rather not keep.
 *
 * ── WHY THE PLANNER OUTLIVES THE FAN-OUT ────────────────────────────────────
 * It could send the eighty events and exit. Instead it sleeps past the point
 * the sweep should have finished and force-closes anything still RUNNING.
 *
 * That matters because a run stuck in RUNNING is not a cosmetic problem: the
 * next cron refuses to start while one is in flight, so a single stranded lane
 * would quietly stop the sweep from ever running again. The lane's own
 * onFailure handler covers the ordinary failure; this covers the ones it cannot
 * see, like a lane that never started because the event was dropped.
 */

import * as Sentry from "@sentry/nextjs";

import { RateSweepTrigger } from "@/generated/prisma";
import { adapterRegistry } from "@/lib/rate-adapters/vendors/index";
import {
  RAW_RESPONSE_RETENTION_DAYS,
  SWEEP_COUNTRIES,
  estimatedVendorRuntimeMinutes,
} from "@/lib/rateSweep/config";
import {
  createSweepRun,
  findRunningSweep,
  forceFinaliseIfStuck,
  pruneRawResponses,
} from "@/lib/rateSweep/run";

import {
  inngest,
  rateSweepFinaliseRequested,
  rateSweepLaneRequested,
  rateSweepRequested,
} from "../client";

/**
 * How long to wait past the slowest vendor's estimate before deciding a run is
 * stuck rather than slow.
 *
 * ── THIS IS A SAFETY NET, NOT A DEADLINE ────────────────────────────────────
 * The failure it exists to prevent is a run stuck in RUNNING for ever, which
 * blocks every future sweep. The failure it can CAUSE, if it is too tight, is
 * far worse and has already happened: on 20 Aug it fired at 158 minutes, one
 * minute after the estimate ran out, while sKart was still legitimately working
 * through its lanes. The run was closed, marked COMPLETED, and the rest of the
 * matrix was simply never collected.
 *
 * So the estimate is now measured rather than idealised (see
 * estimatedVendorRuntimeMinutes) and the margin on top of it is generous. A
 * backstop that fires an hour late costs nothing; one that fires ten minutes
 * early costs a third of the matrix.
 */
const BACKSTOP_MARGIN_MINUTES = 90;

/**
 * A run that started less than this ago blocks a new one. Older than this and
 * something has gone badly wrong, so the cron proceeds rather than being
 * blocked for ever by one bad night.
 *
 * Must stay comfortably above the backstop, or the next cron would declare a
 * still-healthy run stale and start a second sweep alongside it — which is the
 * one thing that could get a vendor account rate-limited.
 */
const STALE_RUN_HOURS = 8;

export const planRateSweep = inngest.createFunction(
  {
    id: "plan-rate-sweep",
    name: "Rate sweep: plan and fan out",

    triggers: [
      { cron: "TZ=Asia/Kolkata 0 1 */5 * *" },
      rateSweepRequested,
    ],

    // Two sweeps at once would double every vendor's call rate at exactly the
    // moment the pacing is tuned to stay under an undocumented ceiling. This is
    // the belt; the running-run check below is the braces, and covers the case
    // where the previous planner has already exited.
    concurrency: [{ limit: 1 }],

    retries: 2,
  },

  async ({ event, step, logger }) => {
    // Two triggers, two payload shapes. The cron sends its own event data, so
    // event.data is a union and has to be narrowed before either field is read;
    // a cron run legitimately has neither.
    const manual =
      event.name === rateSweepRequested.name
        ? (event.data as { requestedByUserId?: string; vendorIds?: string[] })
        : undefined;

    const requestedVendorIds = manual?.vendorIds;
    const requestedBy = manual?.requestedByUserId ?? null;

    // Read from the registry, never from a list in this file. A vendor added to
    // lib/rate-adapters/vendors/index.ts is swept from its first night with no
    // change here, which is the whole point of the adapter registry.
    const vendorIds = await step.run("resolve-vendors", async () => {
      const registered = adapterRegistry.listVendorIds();

      if (!requestedVendorIds?.length) return registered;

      // A manual re-run naming a vendor that is not registered is a typo, and
      // silently sweeping everything instead would be a surprising amount of
      // work to trigger by accident.
      return requestedVendorIds.filter((id: string) => registered.includes(id));
    });

    if (vendorIds.length === 0) {
      logger.error("Rate sweep found no vendors to query", {
        requestedVendorIds,
      });

      await step.run("report-no-vendors", async () => {
        Sentry.captureMessage("Rate sweep found no registered vendors", {
          level: "error",
          tags: { location: "planRateSweep" },
          extra: { requestedVendorIds },
        });
      });

      return { skipped: "no vendors" };
    }

    const inFlight = await step.run("check-in-flight", async () => {
      const running = await findRunningSweep();
      if (!running) return null;

      const ageHours = (Date.now() - running.startedAt.getTime()) / 3_600_000;
      return { id: running.id, ageHours };
    });

    if (inFlight && inFlight.ageHours < STALE_RUN_HOURS) {
      logger.warn("Rate sweep already in flight, skipping", inFlight);
      return { skipped: "already running", runId: inFlight.id };
    }

    // An older run still marked RUNNING is one nothing is going to finish. Close
    // it before opening a new one, or it blocks every future sweep.
    if (inFlight) {
      await step.run("close-stale-run", () => forceFinaliseIfStuck(inFlight.id));
    }

    const run = await step.run("create-run", () =>
      createSweepRun({
        vendorIds,
        trigger: requestedBy ? RateSweepTrigger.MANUAL : RateSweepTrigger.CRON,
        triggeredBy: requestedBy,
      }),
    );

    // One step, one batch. Eighty separate sends would be eighty HTTP round
    // trips and eighty chances for a partial fan-out.
    await step.sendEvent(
      "fan-out-lanes",
      vendorIds.flatMap((vendorId) =>
        SWEEP_COUNTRIES.map((country) => ({
          name: rateSweepLaneRequested.name,
          data: { runId: run.runId, vendorId, countryCode: country.code },
        })),
      ),
    );

    logger.info("Rate sweep fanned out", {
      runId: run.runId,
      lanes: run.laneCount,
      plannedCalls: run.plannedCalls,
    });

    // Sized off the slowest vendor's MEASURED throughput rather than its
    // configured pacing, so adding a slow vendor or another country extends the
    // backstop automatically instead of quietly making it too short.
    const backstopMinutes =
      Math.max(
        ...vendorIds.map((id: string) => estimatedVendorRuntimeMinutes(id)),
      ) + BACKSTOP_MARGIN_MINUTES;

    logger.info("Rate sweep backstop armed", {
      runId: run.runId,
      backstopMinutes,
    });

    await step.sleep("await-lanes", `${backstopMinutes}m`);

    const forced = await step.run("backstop-finalise", () =>
      forceFinaliseIfStuck(run.runId),
    );

    // forceFinaliseIfStuck returns null when the last lane already closed the
    // run, which is the normal path. Only the abnormal one needs announcing,
    // and it goes through the same finalise function so the alerting rules live
    // in exactly one place.
    if (forced) {
      await step.sendEvent("announce-forced-finalise", {
        name: rateSweepFinaliseRequested.name,
        data: { runId: run.runId, forced: true },
      });
    }

    // Housekeeping rides along with the sweep rather than owning a cron of its
    // own: one fewer schedule to forget, and it runs right after the write that
    // made it necessary.
    const pruned = await step.run("prune-raw-responses", () => {
      const cutoff = new Date(
        Date.now() - RAW_RESPONSE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      return pruneRawResponses(cutoff);
    });

    return {
      runId: run.runId,
      lanes: run.laneCount,
      plannedCalls: run.plannedCalls,
      forcedFinalise: Boolean(forced),
      prunedRawResponses: pruned,
    };
  },
);
