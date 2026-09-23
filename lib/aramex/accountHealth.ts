/**
 * PER-ACCOUNT CIRCUIT BREAKER
 * -----------------------------------------------------------------------------
 * Stops querying ONE Aramex account whose credentials are being rejected, while
 * leaving the others alone.
 *
 * ── THE FAILURE THIS EXISTS FOR ─────────────────────────────────────────────
 * Arena holds several Aramex contracts and the rate adapter prices every lane
 * against all of them. That created a gap the single-account version did not
 * have: if ONE account's PIN is rotated, the others keep quoting, so every call
 * still "succeeds" and nothing upstream ever learns.
 *
 * The scheduled rate sweep is where that gets expensive. Its AUTH_ERROR →
 * abandon-the-vendor path exists precisely so a rotated key does not burn six
 * hundred rejected calls in a night — and it only fires when a call fails
 * OUTRIGHT. A partial auth failure never reaches it. So the sweep would run to
 * completion, look healthy, quietly hold half a matrix, and hammer a rejecting
 * account six hundred times. Aramex locks accounts out for that.
 *
 * ── WHY SKIP THE ACCOUNT RATHER THAN STOP THE VENDOR ────────────────────────
 * Stopping all of Aramex on one bad PIN would throw away the working account's
 * rates for the whole run, which is a real cost to avoid a real cost. Skipping
 * just the rejected account keeps the good matrix complete AND stops the
 * hammering. The alert is what gets the PIN fixed.
 *
 * ── WHY ONLY AUTH FAILURES TRIP IT ──────────────────────────────────────────
 * An auth failure is DETERMINISTIC: a wrong PIN is wrong on every call, so
 * three in a row is not bad luck. A timeout or a 503 is the opposite — transient
 * by nature, and suspending an account over a bad minute would silently stop
 * pricing a contract that was fine. Any success resets the counter, so a
 * genuinely working account can never accumulate its way to suspension.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT TOUCH ───────────────────────────────────
 * BOOKING. A booking must go out on the account that quoted it or not at all
 * (lib/booking-adapters/vendors/aramex), so "this account is unhealthy, use
 * another" is never the right answer there — it would bill the export to the
 * wrong contract. A booking against a rejecting account must fail loudly. Hence
 * this is consulted by the RATE adapter only, and `aramexAccountByKey` knows
 * nothing about it.
 *
 * ── SCOPE ───────────────────────────────────────────────────────────────────
 * Per server process, pinned to globalThis like the adapter registry. Not
 * shared across instances, and not durable. That is a deliberate ceiling rather
 * than an oversight: this is a cost control, not a correctness mechanism, and
 * the worst case of a cold process is that it re-learns in three calls instead
 * of knowing immediately. A durable version would need a table written on the
 * hot path of every rate search to save a handful of calls.
 */

import * as Sentry from "@sentry/nextjs";

/** Consecutive credential rejections before an account is put aside. */
const SUSPEND_AFTER_FAILURES = 3;

/**
 * How long an account stays suspended.
 *
 * Long enough that a full sweep (tens of minutes) does not keep re-probing a
 * dead account, short enough that a PIN corrected at 10am is being used again
 * by 10:30 without a deploy or a restart.
 */
const SUSPENSION_MS = 30 * 60 * 1000;

interface AramexAccountHealth {
  consecutiveAuthFailures: number;
  /** Epoch ms, or null when the account is in service. */
  suspendedUntil: number | null;
  /** So one rotated key produces one alert, not six hundred. */
  alerted: boolean;
}

const globalForHealth = globalThis as unknown as {
  __arenaAramexAccountHealth?: Map<string, AramexAccountHealth>;
};

const health: Map<string, AramexAccountHealth> =
  globalForHealth.__arenaAramexAccountHealth ?? new Map();

globalForHealth.__arenaAramexAccountHealth = health;

function entryFor(key: string): AramexAccountHealth {
  let entry = health.get(key);
  if (!entry) {
    entry = { consecutiveAuthFailures: 0, suspendedUntil: null, alerted: false };
    health.set(key, entry);
  }
  return entry;
}

/**
 * Should this account be skipped right now?
 *
 * Clears an expired suspension as a side effect, resetting the counter so the
 * account gets a clean three attempts rather than being re-suspended by one
 * stale failure.
 */
export function isAramexAccountSuspended(
  key: string,
  now: number = Date.now(),
): boolean {
  const entry = health.get(key);
  if (!entry?.suspendedUntil) return false;

  if (now >= entry.suspendedUntil) {
    entry.suspendedUntil = null;
    entry.consecutiveAuthFailures = 0;
    entry.alerted = false;
    return false;
  }

  return true;
}

/**
 * Aramex rejected this account's credentials.
 *
 * Returns true when THIS call is the one that suspended it, so the caller can
 * say so once in its own logs without having to track that itself.
 */
export function recordAramexAuthFailure(
  key: string,
  message: string,
  now: number = Date.now(),
): boolean {
  const entry = entryFor(key);
  entry.consecutiveAuthFailures += 1;

  if (entry.consecutiveAuthFailures < SUSPEND_AFTER_FAILURES) return false;
  if (entry.suspendedUntil && now < entry.suspendedUntil) return false;

  entry.suspendedUntil = now + SUSPENSION_MS;

  const firstAlert = !entry.alerted;
  entry.alerted = true;

  if (firstAlert) {
    // An error, not a warning. Half the rate matrix silently going missing, and
    // customers quietly losing access to a contract's prices, is not something
    // to find out about from a dashboard nobody opened.
    Sentry.captureMessage("Aramex account suspended after credential failures", {
      level: "error",
      tags: { location: "aramexAccountHealth", aramexAccount: key },
      extra: {
        account: key,
        consecutiveAuthFailures: entry.consecutiveAuthFailures,
        suspendedForMinutes: SUSPENSION_MS / 60_000,
        lastMessage: message,
      },
    });
  }

  return firstAlert;
}

/**
 * The account answered. Clears the streak.
 *
 * Called on every success, so an account that fails twice and then works never
 * carries those two failures towards a later suspension.
 */
export function recordAramexAccountSuccess(key: string): void {
  const entry = health.get(key);
  if (!entry) return;
  if (entry.consecutiveAuthFailures === 0 && !entry.suspendedUntil) return;

  entry.consecutiveAuthFailures = 0;
  entry.suspendedUntil = null;
  entry.alerted = false;
}

/** Test seam. Never called in application code. */
export function resetAramexAccountHealth(): void {
  health.clear();
}

/** Read-only view, for a health endpoint or a test assertion. */
export function aramexAccountHealthSnapshot(): Record<
  string,
  { consecutiveAuthFailures: number; suspended: boolean }
> {
  const now = Date.now();
  return Object.fromEntries(
    [...health.entries()].map(([key, entry]) => [
      key,
      {
        consecutiveAuthFailures: entry.consecutiveAuthFailures,
        suspended: !!entry.suspendedUntil && now < entry.suspendedUntil,
      },
    ]),
  );
}
