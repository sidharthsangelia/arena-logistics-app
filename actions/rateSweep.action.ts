"use server";

/**
 * actions/rateSweep.action.ts
 *
 * What an Arena admin can do to the scheduled rate sweep by hand.
 *
 * ── WHY ADMIN AND NOT MEMBER ────────────────────────────────────────────────
 * The read screens are open to any Arena member, because a stale quote grid is
 * an ops problem before it is a money one. Starting a run is not: a sweep is
 * 2,400 calls against vendor accounts that bill us and rate-limit us, and one
 * of them publishes a limit of ten requests a minute. That is a commercial
 * commitment, and commercial commitments go through requireArenaAdmin.
 *
 * This file is "use server", so it exports functions and nothing else. Shapes
 * live in lib/rateSweep/.
 */

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";

import { inngest, rateSweepRequested } from "@/lib/inngest/client";
import { adapterRegistry } from "@/lib/rate-adapters/vendors/index";
import { findRunningSweep, forceFinaliseIfStuck } from "@/lib/rateSweep/run";
import { requireArenaAdmin, ArenaForbiddenError } from "@/utils/arena-auth";

const SWEEPS_PATH = "/arena-dashboard/rate-sweeps";

export interface SweepActionResult {
  ok: boolean;
  message: string;
}

/**
 * Start a sweep now.
 *
 * Refuses while another is in flight rather than queueing behind it. Two sweeps
 * overlapping would double every vendor's call rate at exactly the moment the
 * pacing is tuned to stay under an undocumented ceiling, and "I pressed it
 * twice" must not be the thing that gets an account blocked.
 *
 * `vendorIds` narrows the run, which is what makes this button useful after
 * fixing one vendor's credentials: a repair costs 600 calls instead of 2,400.
 */
export async function startRateSweepAction(
  vendorIds?: string[],
): Promise<SweepActionResult> {
  try {
    const { userId } = await requireArenaAdmin();

    const running = await findRunningSweep();
    if (running) {
      return {
        ok: false,
        message:
          "A sweep is already running. Wait for it to finish, or force-close it if it is stuck.",
      };
    }

    const registered = adapterRegistry.listVendorIds();
    const requested = vendorIds?.filter((id) => registered.includes(id));

    if (vendorIds?.length && !requested?.length) {
      return {
        ok: false,
        message: `None of those vendors are registered. Available: ${registered.join(", ")}.`,
      };
    }

    await inngest.send({
      name: rateSweepRequested.name,
      data: { requestedByUserId: userId, vendorIds: requested },
    });

    revalidatePath(SWEEPS_PATH);

    return {
      ok: true,
      message: requested?.length
        ? `Sweep started for ${requested.join(", ")}. It will take about an hour.`
        : "Sweep started. It will take about an hour, and the page updates as lanes report in.",
    };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) {
      return { ok: false, message: error.message };
    }

    Sentry.captureException(error, { tags: { location: "startRateSweepAction" } });

    return {
      ok: false,
      message: "Could not start the sweep. The error has been reported.",
    };
  }
}

/**
 * Close out a run that is stuck in RUNNING.
 *
 * This is not cosmetic tidying. The cron refuses to start while a run is in
 * flight, so one stranded run blocks every future sweep, and the automatic
 * backstop only fires while the planner that opened it is still alive. If the
 * planner itself died, this button is the only way back.
 */
export async function forceFinaliseSweepAction(
  runId: string,
): Promise<SweepActionResult> {
  try {
    await requireArenaAdmin();

    const summary = await forceFinaliseIfStuck(runId);

    revalidatePath(SWEEPS_PATH);
    revalidatePath(`${SWEEPS_PATH}/${runId}`);

    if (!summary) {
      return { ok: true, message: "That run had already finished." };
    }

    return {
      ok: true,
      message: `Closed as ${summary.status}, with ${summary.snapshotCount.toLocaleString("en-IN")} rates kept.`,
    };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) {
      return { ok: false, message: error.message };
    }

    Sentry.captureException(error, {
      tags: { location: "forceFinaliseSweepAction" },
      extra: { runId },
    });

    return {
      ok: false,
      message: "Could not close the run. The error has been reported.",
    };
  }
}
