/**
 * lib/inngest/functions/finaliseRateSweep.ts
 *
 * Closes a sweep: count what landed, judge each vendor on its own, decide
 * whether a person needs to know.
 *
 * ── WHY THIS IS ITS OWN FUNCTION ────────────────────────────────────────────
 * Two different things can decide a run is over: the last lane to report, and
 * the planner's backstop when the counter never gets there. Both are expected.
 * Putting the closing logic in one function they both send an event to means
 * there is one implementation of "was this run any good", rather than two that
 * drift.
 *
 * `idempotency` on the run id makes the duplicate harmless at the platform
 * level, and the notification's dedupeKey makes it harmless at the inbox level.
 * Belt and braces, because the failure this guards against is an ops team
 * getting two alerts for one problem and starting to ignore both.
 *
 * ── WHAT GETS ANNOUNCED, AND WHAT DOES NOT ──────────────────────────────────
 * A healthy run says nothing. This runs every five days for ever, and a job
 * that reports its own success on a schedule trains everyone to filter it, so
 * that when it finally does have something to say, nobody reads it.
 */

import * as Sentry from "@sentry/nextjs";

import { RateSweepStatus } from "@/generated/prisma";
import { notifyRateSweepDegraded } from "@/lib/notifications/emit";
import { finaliseSweepRun } from "@/lib/rateSweep/run";

import { inngest, rateSweepFinaliseRequested } from "../client";

export const finaliseRateSweep = inngest.createFunction(
  {
    id: "finalise-rate-sweep",
    name: "Rate sweep: close out and judge",

    triggers: [rateSweepFinaliseRequested],

    // The last lane and the planner's backstop can both ask. One wins, the
    // other is dropped for 24 hours, which is far longer than any run lives.
    idempotency: "event.data.runId",

    retries: 3,
  },

  async ({ event, step, logger }) => {
    const { runId, forced } = event.data;

    // `forced` is threaded in rather than being applied to the row afterwards.
    // The backstop has usually already finalised this run once; without the flag
    // this second pass recomputes a clean-looking summary and erases the note
    // explaining that lanes never reported.
    const summary = await step.run("finalise", () =>
      finaliseSweepRun(runId, { forced: Boolean(forced) }),
    );

    if (!summary) {
      logger.warn("Rate sweep finalise found no run", { runId });
      return { runId, missing: true };
    }

    logger.info("Rate sweep finished", {
      runId,
      status: summary.status,
      okCalls: summary.okCalls,
      failedCalls: summary.failedCalls,
      missingCalls: summary.missingCalls,
      snapshots: summary.snapshotCount,
      degraded: summary.degradedVendors,
    });

    if (summary.status === RateSweepStatus.COMPLETED && !forced) {
      return {
        runId,
        status: summary.status,
        snapshots: summary.snapshotCount,
      };
    }

    await step.run("announce", async () => {
      // Sentry gets the per-vendor detail because that is where someone debugs
      // it; the inbox notification gets the headline because that is where
      // someone notices it. Neither is a substitute for the other.
      Sentry.captureMessage(`Rate sweep ${summary.status.toLowerCase()}`, {
        level: summary.status === RateSweepStatus.FAILED ? "error" : "warning",
        tags: { location: "finaliseRateSweep" },
        extra: {
          runId,
          forced: Boolean(forced),
          snapshotCount: summary.snapshotCount,
          missingCalls: summary.missingCalls,
          note: summary.note,
          vendors: summary.vendors.map((v) => ({
            vendorId: v.vendorId,
            expected: v.expected,
            attempted: v.attempted,
            ok: v.ok,
            noService: v.noService,
            failedRows: v.failedRows,
            missing: v.missing,
            lanesEmpty: v.lanesEmpty,
            lanesPartial: v.lanesPartial,
            failureRatio: Number(v.failureRatio.toFixed(3)),
            silent: v.silent,
          })),
        },
      });

      // A forced finalise with no degraded vendor means lanes went missing
      // without failing, which is a platform-level problem rather than a vendor
      // one. Still worth an inbox row, named for what it is.
      const degradedVendors = summary.degradedVendors.length
        ? summary.degradedVendors
        : forced
          ? ["lanes that never reported"]
          : [];

      if (degradedVendors.length === 0) return;

      await notifyRateSweepDegraded({
        runId,
        degradedVendors,
        snapshotCount: summary.snapshotCount,
        totalVendors: summary.vendors.length,
      });
    });

    return {
      runId,
      status: summary.status,
      snapshots: summary.snapshotCount,
      degraded: summary.degradedVendors,
    };
  },
);
