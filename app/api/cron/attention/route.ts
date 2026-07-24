import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { runAttentionSweep } from "@/lib/notifications/attentionSweep";

/**
 * THE SCHEDULED ATTENTION SWEEP
 * -----------------------------------------------------------------------------
 * Finds the things that need somebody because nothing happened: uncollected
 * payments, shipments that have stopped moving, quotes about to lapse. See
 * lib/notifications/attentionSweep.ts for why these cannot be event driven.
 *
 * Run it once a day. On Vercel that is a vercel.json cron entry; anywhere else it is
 * a curl in crontab. There is no run-state to keep, so a missed day costs nothing
 * and a double run produces the same inbox as a single one.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/attention
 *
 * GET rather than POST, because that is what every cron scheduler sends by default,
 * and the handler is idempotent so the usual objection to a mutating GET does not
 * bite here.
 */

// Needs Node's crypto for the constant-time comparison, and Prisma underneath.
export const runtime = "nodejs";
// Never cached: the whole job is a side effect, and a cached response would mean
// the sweep silently stopped running while the endpoint kept returning 200.
export const dynamic = "force-dynamic";

/**
 * Constant-time comparison, and a length check first.
 *
 * timingSafeEqual throws when the buffers differ in length, so the length has to be
 * compared before it, not by it. That comparison leaks the secret's length, which is
 * not worth defending: an attacker who knows the length still has to guess the
 * bytes, and the alternative is a handler that 500s on every wrong-length token.
 */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // A missing secret must not mean an open endpoint. Anyone could then run the
  // sweep, and while it writes nothing sensitive it is a free way to make us do work.
  if (!secret) {
    Sentry.captureMessage("Attention sweep called but CRON_SECRET is not set", {
      level: "error",
    });
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!provided || !tokenMatches(provided, secret)) {
    // Deliberately terse. A caller without the token learns only that it was wrong.
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  try {
    const summary = await runAttentionSweep();

    Sentry.addBreadcrumb({
      level: "info",
      message: "Attention sweep finished",
      data: { ...summary },
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    // The sweep's own steps each swallow and report their failures, so reaching
    // here means something more fundamental broke. Non-2xx so the scheduler's own
    // alerting notices.
    Sentry.captureException(error, { tags: { location: "cron/attention" } });
    return NextResponse.json({ error: "sweep failed" }, { status: 500 });
  }
}
