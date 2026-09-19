/**
 * lib/publicApi/quota.ts
 * -----------------------------------------------------------------------------
 * Two limiters in front of every /api/v1 call, and a reason for each.
 *
 *   LAYER 1  lib/rateLimit.ts, in process memory. Free, instant, and bounds
 *            nothing on its own: each lambda keeps its own window, so the real
 *            ceiling is limit x instance count. It is here to reject a caller
 *            already over budget on THIS instance without paying for a round
 *            trip to Neon.
 *
 *   LAYER 2  ApiRateLimitWindow in Postgres. One atomic increment, shared by
 *            every instance. This is the number that actually caps what a key
 *            can spend per minute no matter how Vercel spreads the traffic.
 *
 * Both must pass. Layer 1 alone was the state of the old POST /api/rates, and
 * with an IP as the subject it capped an honest client and nothing else.
 *
 * ── WHY A DATABASE FAILURE LETS THE CALL THROUGH ────────────────────────────
 * Fail-open, on purpose, with a Sentry event. A quota check that hard-fails
 * turns a Neon blip into a total outage of a partner's pricing page, and the
 * in-memory layer is still standing in that scenario. The thing we are
 * defending against is sustained overspend, and sustained overspend cannot hide
 * inside a database outage — we would hear about the outage first.
 *
 * ── WHY DENIED CALLS STILL COUNT ────────────────────────────────────────────
 * The increment happens before the verdict, so a caller hammering a closed door
 * keeps their own window full. That differs from the in-memory limiter, which
 * does not count denials. It is the right way round for a shared counter: the
 * alternative is a read, a decision and a write, which is three round trips and
 * a race, to reward the exact behaviour we are throttling.
 */

import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { RATE_LIMIT_POLICIES, rateLimit, type RateLimitPolicy } from "@/lib/rateLimit";

export interface QuotaVerdict {
  ok: boolean;
  /** Seconds until the window rolls. Only meaningful when `ok` is false. */
  retryAfterSeconds: number;
  /** Which layer said no. For the log line, never for the caller. */
  deniedBy?: "memory" | "database";
}

const ALLOWED: QuotaVerdict = { ok: true, retryAfterSeconds: 0 };

/**
 * Opportunistic cleanup. A cron for two tables that each hold minutes of rows
 * is more moving parts than the problem deserves, so roughly one call in fifty
 * pays for a delete of everything already expired.
 */
const SWEEP_PROBABILITY = 0.02;

/**
 * Check one policy for one subject against both layers.
 *
 * `subject` is the consumer name for per-key policies and a constant for the
 * global one. It is never the raw API key: this string reaches log lines.
 */
export async function checkQuota(
  policy: RateLimitPolicy,
  subject: string,
): Promise<QuotaVerdict> {
  const { limit, windowMs } = RATE_LIMIT_POLICIES[policy];

  // -- Layer 1: process memory --------------------------------------------
  const local = rateLimit(`${policy}:${subject}`, limit, windowMs);
  if (!local.ok) {
    return { ok: false, retryAfterSeconds: local.retryAfterSeconds, deniedBy: "memory" };
  }

  // -- Layer 2: shared counter --------------------------------------------
  const now = Date.now();
  // Truncating to a multiple of the window length is what makes the key
  // derivable by every instance without coordination: two lambdas computing
  // this at the same moment always land on the same row.
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + windowMs);
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000));

  const bucketKey = `${policy}:${subject}`;

  try {
    const row = await prisma.apiRateLimitWindow.upsert({
      where: { bucketKey_windowStart: { bucketKey, windowStart } },
      create: { bucketKey, windowStart, count: 1, expiresAt },
      update: { count: { increment: 1 } },
      select: { count: true },
    });

    if (row.count > limit) {
      return { ok: false, retryAfterSeconds, deniedBy: "database" };
    }
  } catch (err) {
    // Includes the P2002 that two concurrent upserts on a fresh window can
    // produce. Losing one increment out of a burst is not worth a retry loop in
    // front of a paid vendor call, and the next request in that window will
    // land on the row the winner created.
    Sentry.captureException(err, {
      level: "warning",
      tags: { location: "publicApi.checkQuota", policy },
    });
    return ALLOWED;
  }

  if (Math.random() < SWEEP_PROBABILITY) void sweepExpired();

  return ALLOWED;
}

async function sweepExpired(): Promise<void> {
  const now = new Date();

  try {
    await Promise.all([
      prisma.apiRateLimitWindow.deleteMany({ where: { expiresAt: { lte: now } } }),
      prisma.apiRateCacheEntry.deleteMany({ where: { expiresAt: { lte: now } } }),
    ]);
  } catch (err) {
    // Housekeeping. A failure here costs disk, not correctness.
    Sentry.captureException(err, {
      level: "warning",
      tags: { location: "publicApi.sweepExpired" },
    });
  }
}
