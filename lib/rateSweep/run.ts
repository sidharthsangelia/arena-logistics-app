/**
 * lib/rateSweep/run.ts
 *
 * The life of one sweep: open it, let eighty lanes report back independently,
 * work out whether it went well enough, close it.
 *
 * ── HOW A RUN KNOWS IT IS FINISHED ──────────────────────────────────────────
 * Not by polling, and not by one orchestrator awaiting eighty children.
 *
 * Each lane, as its very last act, increments `lanesCompleted` in a single
 * atomic UPDATE and reads back the new value. Exactly one lane sees that value
 * equal `laneCount`, and that lane fires the finalise event. Postgres decides
 * which one, so there is no race to lose and no window in which two lanes both
 * think they were last.
 *
 * The failure mode this has to survive is a lane that never reports at all,
 * which would leave the counter short and the run RUNNING forever. Two things
 * cover it: the lane function's onFailure handler increments the counter after
 * its retries are exhausted, and the planner sleeps past the run's expected
 * duration and force-finalises anything still open. Belt and braces, because a
 * run stuck in RUNNING silently stops the next cron from starting.
 *
 * ── WHAT COUNTS AS A BAD RUN ────────────────────────────────────────────────
 * Per vendor, and never in aggregate. Four vendors averaged together hide the
 * one that is completely down behind the three that are fine, and the vendor
 * that is down is the entire thing you needed to know.
 */

import "server-only";

import * as Sentry from "@sentry/nextjs";

import {
  Prisma,
  RateSweepCallStatus,
  RateSweepStatus,
  RateSweepTrigger,
} from "@/generated/prisma";
import { prisma } from "@/utils/db";

import {
  ALERT_ON_ZERO_ROWS,
  SWEEP_CONFIG_VERSION,
  SWEEP_COUNTRIES,
  SWEEP_ORIGIN,
  VENDOR_FAILURE_ALERT_RATIO,
  WEIGHT_SLABS_KG,
  plannedCallCount,
  snapshotSweepConfig,
} from "./config";

// ---------------------------------------------------------------------------
// Opening a run
// ---------------------------------------------------------------------------

export interface CreateRunInput {
  vendorIds: string[];
  trigger: RateSweepTrigger;
  triggeredBy?: string | null;
}

export async function createSweepRun(input: CreateRunInput): Promise<{
  runId: string;
  laneCount: number;
  plannedCalls: number;
}> {
  const laneCount = input.vendorIds.length * SWEEP_COUNTRIES.length;
  const plannedCalls = plannedCallCount(input.vendorIds.length);

  const run = await prisma.rateSweepRun.create({
    data: {
      trigger: input.trigger,
      triggeredBy: input.triggeredBy ?? null,
      status: RateSweepStatus.RUNNING,
      configVersion: SWEEP_CONFIG_VERSION,
      config: snapshotSweepConfig() as unknown as Prisma.InputJsonValue,
      originPincode: SWEEP_ORIGIN.pincode,
      originCity: SWEEP_ORIGIN.city,
      vendorIds: input.vendorIds,
      laneCount,
      plannedCalls,
    },
    select: { id: true },
  });

  return { runId: run.id, laneCount, plannedCalls };
}

/**
 * A run already in flight, if there is one.
 *
 * The cron checks this before opening another. Two overlapping sweeps would
 * double every vendor's call rate at exactly the moment the pacing is tuned to
 * stay under an undocumented ceiling, which is the one way this system could
 * get an account blocked.
 */
export async function findRunningSweep(): Promise<{ id: string; startedAt: Date } | null> {
  return prisma.rateSweepRun.findFirst({
    where: { status: RateSweepStatus.RUNNING },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  });
}

// ---------------------------------------------------------------------------
// Lane completion
// ---------------------------------------------------------------------------

/**
 * Mark one lane done and report whether this was the last.
 *
 * The increment and the read are one statement, which is what makes "was I
 * last" answerable at all. Written as raw SQL because Prisma's `update` with an
 * atomic increment does not return the post-increment value in a way that is
 * safe to compare against laneCount under concurrency.
 */
export async function completeLane(params: {
  runId: string;
  failed: boolean;
}): Promise<{ wasLast: boolean; lanesCompleted: number; laneCount: number }> {
  const rows = await prisma.$queryRaw<
    Array<{ lanesCompleted: number; laneCount: number }>
  >`
    UPDATE "RateSweepRun"
       SET "lanesCompleted" = "lanesCompleted" + 1,
           "lanesFailed"    = "lanesFailed" + ${params.failed ? 1 : 0}
     WHERE "id" = ${params.runId}
    RETURNING "lanesCompleted", "laneCount"
  `;

  const row = rows[0];
  if (!row) {
    // The run was deleted mid-sweep. Nothing left to finalise, and the caller
    // must not treat it as "I was last" and fire an event for a run that is gone.
    return { wasLast: false, lanesCompleted: 0, laneCount: 0 };
  }

  return {
    wasLast: row.lanesCompleted >= row.laneCount,
    lanesCompleted: row.lanesCompleted,
    laneCount: row.laneCount,
  };
}

// ---------------------------------------------------------------------------
// Finalising
// ---------------------------------------------------------------------------

export interface VendorHealth {
  vendorId: string;
  attempted: number;
  ok: number;
  /** Answered and declined. Excluded from the failure ratio; see below. */
  noService: number;
  /** Real failures: vendor errors, timeouts, auth, rate limits, skips. */
  failed: number;
  snapshots: number;
  /** failed / (attempted - noService), or 0 when nothing was attempted. */
  failureRatio: number;
  /** True when this vendor produced no usable rows at all. */
  silent: boolean;
  degraded: boolean;
}

export interface SweepSummary {
  runId: string;
  status: RateSweepStatus;
  okCalls: number;
  failedCalls: number;
  snapshotCount: number;
  vendors: VendorHealth[];
  degradedVendors: string[];
}

/**
 * Close the run: count what landed, judge each vendor, write the totals.
 *
 * Safe to call twice. The planner's backstop and the last lane can both reach
 * here, and finalising an already-finalised run recomputes the same numbers
 * rather than corrupting them.
 */
export async function finaliseSweepRun(runId: string): Promise<SweepSummary | null> {
  const run = await prisma.rateSweepRun.findUnique({
    where: { id: runId },
    select: { id: true, vendorIds: true, status: true },
  });

  if (!run) return null;

  const [callGroups, snapshotGroups] = await Promise.all([
    prisma.rateSweepCall.groupBy({
      by: ["vendorId", "status"],
      where: { runId },
      _count: { _all: true },
    }),
    prisma.vendorRateSnapshot.groupBy({
      by: ["vendorId"],
      where: { runId },
      _count: { _all: true },
    }),
  ]);

  const snapshotsByVendor = new Map(
    snapshotGroups.map((g) => [g.vendorId, g._count._all]),
  );

  const vendors: VendorHealth[] = run.vendorIds.map((vendorId) => {
    const forVendor = callGroups.filter((g) => g.vendorId === vendorId);

    const countOf = (status: RateSweepCallStatus) =>
      forVendor.find((g) => g.status === status)?._count._all ?? 0;

    const ok = countOf(RateSweepCallStatus.OK);
    const noService = countOf(RateSweepCallStatus.NO_SERVICE);
    const attempted = forVendor.reduce((sum, g) => sum + g._count._all, 0);
    const failed = attempted - ok - noService;
    const snapshots = snapshotsByVendor.get(vendorId) ?? 0;

    // NO_SERVICE comes out of the denominator, not just the numerator. A vendor
    // that does not fly to five of the twenty countries answers 150 calls
    // correctly by declining them, and counting those as attempts it failed
    // would put an honest vendor permanently near the alert threshold.
    const judged = attempted - noService;
    const failureRatio = judged > 0 ? failed / judged : 0;

    // Never attempted is not the same as silent. A run cancelled before a
    // vendor started should not report that vendor as down.
    const silent = attempted > 0 && ok === 0;

    return {
      vendorId,
      attempted,
      ok,
      noService,
      failed,
      snapshots,
      failureRatio,
      silent,
      degraded:
        (silent && ALERT_ON_ZERO_ROWS) || failureRatio > VENDOR_FAILURE_ALERT_RATIO,
    };
  });

  const okCalls = vendors.reduce((sum, v) => sum + v.ok, 0);
  const failedCalls = vendors.reduce((sum, v) => sum + v.failed, 0);
  const snapshotCount = vendors.reduce((sum, v) => sum + v.snapshots, 0);
  const degradedVendors = vendors.filter((v) => v.degraded).map((v) => v.vendorId);

  // No usable data at all is FAILED, not PARTIAL. The distinction matters to
  // anything that reads these rows later: PARTIAL still has good lanes worth
  // quoting from, FAILED has nothing.
  const status =
    snapshotCount === 0
      ? RateSweepStatus.FAILED
      : degradedVendors.length > 0
        ? RateSweepStatus.PARTIAL
        : RateSweepStatus.COMPLETED;

  await prisma.rateSweepRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: new Date(),
      okCalls,
      failedCalls,
      snapshotCount,
      notes: degradedVendors.length
        ? `Degraded: ${degradedVendors.join(", ")}`
        : null,
    },
  });

  return {
    runId,
    status,
    okCalls,
    failedCalls,
    snapshotCount,
    vendors,
    degradedVendors,
  };
}

/**
 * The backstop. Called by the planner long after the sweep should have ended,
 * and by the admin screen for a run that is visibly stuck.
 *
 * Returns null when the run had already closed itself, which is the normal case
 * and is not worth logging.
 */
export async function forceFinaliseIfStuck(
  runId: string,
): Promise<SweepSummary | null> {
  const run = await prisma.rateSweepRun.findUnique({
    where: { id: runId },
    select: { status: true, lanesCompleted: true, laneCount: true },
  });

  if (!run || run.status !== RateSweepStatus.RUNNING) return null;

  Sentry.captureMessage("Rate sweep force-finalised", {
    level: "warning",
    tags: { location: "rateSweep.forceFinalise" },
    extra: {
      runId,
      lanesCompleted: run.lanesCompleted,
      laneCount: run.laneCount,
    },
  });

  const summary = await finaliseSweepRun(runId);

  if (summary) {
    await prisma.rateSweepRun.update({
      where: { id: runId },
      data: {
        notes: `Force-finalised with ${run.lanesCompleted}/${run.laneCount} lanes reported.${
          summary.degradedVendors.length
            ? ` Degraded: ${summary.degradedVendors.join(", ")}`
            : ""
        }`,
      },
    });
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/**
 * Drop the stored vendor bodies from successful calls once they are past the
 * retention window.
 *
 * Failures are exempt. The raw body of a call that worked is a curiosity; the
 * raw body of one that did not is the evidence, and it is wanted months later
 * when somebody finally asks why a lane has been empty since spring.
 *
 * Runs as part of the sweep rather than on its own schedule: one fewer cron to
 * forget about, and the work is proportional to what the sweep just wrote.
 */
export async function pruneRawResponses(olderThan: Date): Promise<number> {
  const result = await prisma.rateSweepCall.updateMany({
    where: {
      status: RateSweepCallStatus.OK,
      capturedAt: { lt: olderThan },
      rawResponse: { not: Prisma.DbNull },
      rawPrunedAt: null,
    },
    data: { rawResponse: Prisma.DbNull, rawPrunedAt: new Date() },
  });

  return result.count;
}

/** Numbers for the admin header, cheap enough to read on every page load. */
export function describeMatrix() {
  return {
    countries: SWEEP_COUNTRIES.length,
    slabs: WEIGHT_SLABS_KG.length,
    configVersion: SWEEP_CONFIG_VERSION,
  };
}
