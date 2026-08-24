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
  SWEEP_CONFIG_VERSION,
  SWEEP_COUNTRIES,
  SWEEP_ORIGIN,
  WEIGHT_SLABS_KG,
  plannedCallCount,
  snapshotSweepConfig,
} from "./config";
import { describeVendorHealth, judgeVendor, type VendorHealth } from "./health";

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

/** Re-exported so callers keep importing the judgement from one place. */
export type { VendorHealth };

export interface SweepSummary {
  runId: string;
  status: RateSweepStatus;
  okCalls: number;
  failedCalls: number;
  /** Cells the run planned but never recorded at all. */
  missingCalls: number;
  snapshotCount: number;
  vendors: VendorHealth[];
  degradedVendors: string[];
  /** Human-readable, and exactly what lands in the run's notes column. */
  note: string | null;
}

/**
 * Close the run: count what landed against what was planned, judge each vendor,
 * write the totals.
 *
 * Safe to call twice, and it has to be: the planner's backstop and the last lane
 * can both reach here. Everything it writes, the notes included, is derived from
 * the rows and the run's own plan, so calling it again recomputes the same
 * answer instead of overwriting a better one with a blanker one. That was a real
 * bug: the backstop wrote "force-finalised with 100/104 lanes reported" and the
 * follow-up call, seeing no degraded vendor, set notes back to null.
 */
export async function finaliseSweepRun(
  runId: string,
  opts: { forced?: boolean } = {},
): Promise<SweepSummary | null> {
  const run = await prisma.rateSweepRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      vendorIds: true,
      status: true,
      laneCount: true,
      lanesCompleted: true,
      plannedCalls: true,
    },
  });

  if (!run) return null;

  const [callGroups, laneGroups, snapshotGroups] = await Promise.all([
    prisma.rateSweepCall.groupBy({
      by: ["vendorId", "status"],
      where: { runId },
      _count: { _all: true },
    }),
    // The lane-level view, which is the one that catches a whole country going
    // missing. A vendor can lose every USA cell — thirty of seven hundred and
    // eighty, under four percent — and no ratio computed over cells will ever
    // notice, because losing a country is not a small failure, it is a total
    // failure of a small part.
    prisma.rateSweepCall.groupBy({
      by: ["vendorId", "destCountryCode"],
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

  // Taken from the run's own stored plan, never from the current config file.
  // A country added to config.ts between this run starting and finishing must
  // not retrospectively turn a complete run into an incomplete one.
  const vendorCount = Math.max(1, run.vendorIds.length);
  const expectedPerVendor = Math.floor(run.plannedCalls / vendorCount);
  const lanesPerVendor = Math.floor(run.laneCount / vendorCount);
  const slabsPerLane =
    run.laneCount > 0 ? Math.floor(run.plannedCalls / run.laneCount) : 0;

  const vendors: VendorHealth[] = run.vendorIds.map((vendorId) => {
    const forVendor = callGroups.filter((g) => g.vendorId === vendorId);

    const countOf = (status: RateSweepCallStatus) =>
      forVendor.find((g) => g.status === status)?._count._all ?? 0;

    const lanes = laneGroups.filter((g) => g.vendorId === vendorId);

    return judgeVendor({
      vendorId,
      expected: expectedPerVendor,
      attempted: forVendor.reduce((sum, g) => sum + g._count._all, 0),
      ok: countOf(RateSweepCallStatus.OK),
      noService: countOf(RateSweepCallStatus.NO_SERVICE),
      snapshots: snapshotsByVendor.get(vendorId) ?? 0,
      lanesExpected: lanesPerVendor,
      lanesWithRows: lanes.length,
      lanesComplete:
        slabsPerLane > 0
          ? lanes.filter((g) => g._count._all >= slabsPerLane).length
          : 0,
    });
  });

  const okCalls = vendors.reduce((sum, v) => sum + v.ok, 0);
  // Rows that recorded a failure. Kept as the meaning of this column, so old
  // rows still mean what they meant; the cells that never got a row at all are
  // counted separately and say so.
  const failedCalls = vendors.reduce((sum, v) => sum + v.failedRows, 0);
  const missingCalls = vendors.reduce((sum, v) => sum + v.missing, 0);
  const snapshotCount = vendors.reduce((sum, v) => sum + v.snapshots, 0);
  const degraded = vendors.filter((v) => v.degraded);
  const degradedVendors = degraded.map((v) => v.vendorId);

  // No usable data at all is FAILED, not PARTIAL. The distinction matters to
  // anything that reads these rows later: PARTIAL still has good lanes worth
  // quoting from, FAILED has nothing.
  const status =
    snapshotCount === 0
      ? RateSweepStatus.FAILED
      : degradedVendors.length > 0
        ? RateSweepStatus.PARTIAL
        : RateSweepStatus.COMPLETED;

  const note = buildRunNote({
    forced: Boolean(opts.forced),
    lanesCompleted: run.lanesCompleted,
    laneCount: run.laneCount,
    okCalls,
    plannedCalls: run.plannedCalls,
    missingCalls,
    degraded,
  });

  await prisma.rateSweepRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: new Date(),
      okCalls,
      failedCalls,
      snapshotCount,
      notes: note,
    },
  });

  return {
    runId,
    status,
    okCalls,
    failedCalls,
    missingCalls,
    snapshotCount,
    vendors,
    degradedVendors,
    note,
  };
}

/**
 * The one sentence a person reads when they open a run that went wrong.
 *
 * Built here rather than at each call site so that whoever finalises the run —
 * the last lane, the backstop, or an admin pressing the button — writes exactly
 * the same thing, and so re-finalising cannot downgrade the explanation.
 */
function buildRunNote(input: {
  forced: boolean;
  lanesCompleted: number;
  laneCount: number;
  okCalls: number;
  plannedCalls: number;
  missingCalls: number;
  degraded: VendorHealth[];
}): string | null {
  const parts: string[] = [];

  if (input.forced) {
    parts.push(
      `Force-finalised with ${input.lanesCompleted}/${input.laneCount} lanes reported.`,
    );
  }

  if (input.missingCalls > 0) {
    parts.push(
      `${input.okCalls}/${input.plannedCalls} cells recorded, ${input.missingCalls} never attempted.`,
    );
  }

  if (input.degraded.length > 0) {
    parts.push(
      `Degraded: ${input.degraded.map(describeVendorHealth).join("; ")}.`,
    );
  }

  // A clean run says nothing, so the column stays a signal rather than becoming
  // a line of prose on every row that nobody reads.
  return parts.length > 0 ? parts.join(" ") : null;
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

  // The `forced` flag goes IN rather than the note being patched on afterwards.
  // Patching is what lost the explanation: this function wrote a good note, then
  // the finalise event ran finaliseSweepRun again and, finding no degraded
  // vendor, reset notes to null. Both paths now compose the same note from the
  // same inputs, so whichever runs last says the same thing.
  return finaliseSweepRun(runId, { forced: true });
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
