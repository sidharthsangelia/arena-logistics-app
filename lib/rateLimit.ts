/**
 * IN-MEMORY SLIDING-WINDOW RATE LIMITER
 * -----------------------------------------------------------------------------
 * A dependency-free throttle for the paths that fan out to paid upstream vendor
 * APIs (Shipmozo, sKart, Aramex, ShipGlobal). Every call on those
 * paths costs real money and real quota, so the cap is a cost control first and
 * an abuse control second.
 *
 * SCOPE / LIMITATIONS (read before relying on this for anything security-grade):
 *   - State lives in process memory, pinned to globalThis so it survives dev HMR
 *     and duplicate module graphs (same pattern as the adapter registry).
 *   - On serverless/multi-instance hosting each instance keeps its own window,
 *     so the effective ceiling is `limit * instanceCount`. That is fine here:
 *     the goal is to stop one tenant hammering the calculator from a single
 *     session, not to enforce a global quota. Move to Redis/Upstash if a hard
 *     cross-instance quota is ever required — `checkRateLimit` is the seam.
 *
 * The window is a timestamp log trimmed on each call — exact, no background
 * timers.
 */

/** Ascending request timestamps (ms) plus the moment this bucket goes stale. */
interface Bucket {
  times: number[];
  /** now + windowMs at the last write. Past this, the bucket is evictable. */
  expiresAt: number;
}

const globalForRateLimit = globalThis as unknown as {
  __arenaRateLimitBuckets?: Map<string, Bucket>;
  __arenaRateLimitLastSweep?: number;
};

const buckets = globalForRateLimit.__arenaRateLimitBuckets ?? new Map<string, Bucket>();
globalForRateLimit.__arenaRateLimitBuckets = buckets;

// ---------------------------------------------------------------------------
// Eviction
// ---------------------------------------------------------------------------
/**
 * The map grows one entry per distinct key and, before this, shrank never.
 *
 * The old comment claimed it was "self-cleaning as keys go idle", which was the
 * wrong way round: a bucket is only trimmed when its key is hit AGAIN, so a key
 * that goes quiet keeps its entry for the life of the process. One entry per org
 * is negligible; one entry per IP on an endpoint anyone can reach is not, and
 * that is exactly what the /api/rates key space is.
 *
 * So: sweep expired buckets, but not on every call (an O(n) walk in front of
 * every rate search is worse than the leak). Sweep when the map is big enough to
 * be worth walking and at most once a minute.
 */
const SWEEP_THRESHOLD = 512;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Hard ceiling, enforced after a sweep has already dropped everything expired.
 * Reaching it means live keys alone exceed the cap — a flood of distinct keys,
 * which only the IP-keyed path can produce.
 *
 * Evicting oldest-first is deliberately FAIL-OPEN: a dropped bucket grants its
 * key a fresh window. Fail-closed would be worse than the attack it defends
 * against — rejecting on a full map lets anyone lock out every real tenant by
 * flooding keys, turning a cost control into a denial-of-service lever. The
 * global backstop below is what actually bounds the damage in that scenario.
 */
const MAX_KEYS = 10_000;

function sweep(now: number): void {
  const lastSweep = globalForRateLimit.__arenaRateLimitLastSweep ?? 0;
  if (buckets.size < SWEEP_THRESHOLD || now - lastSweep < SWEEP_INTERVAL_MS) return;

  globalForRateLimit.__arenaRateLimitLastSweep = now;

  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) buckets.delete(key);
  }

  // Map iterates in insertion order, so the first keys out are the ones least
  // recently created.
  if (buckets.size > MAX_KEYS) {
    let toDrop = buckets.size - MAX_KEYS;
    for (const key of buckets.keys()) {
      if (toDrop-- <= 0) break;
      buckets.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------
/**
 * Named budgets, so the numbers live in one place instead of being retyped at
 * each call site. Two call sites that mean the same policy but drift to
 * different constants is how one of them ends up unthrottled in practice.
 *
 * International and domestic get SEPARATE budgets rather than sharing one.
 * They spend against different vendor accounts, and a customer pricing a
 * domestic parcel should not consume the allowance for the export calculator.
 */
export const RATE_LIMIT_POLICIES = {
  /** getRatesAction — Shipmozo, sKart, Aramex, ShipGlobal. Per org. */
  ratesInternational: { limit: 30, windowMs: 60_000 },
  /** getDomesticRatesAction — Shipmozo domestic. Per org. */
  ratesDomestic: { limit: 30, windowMs: 60_000 },
  /** POST /api/rates, per caller. Same fan-out, so the same per-caller budget. */
  ratesApiCaller: { limit: 30, windowMs: 60_000 },
  /**
   * POST /api/rates, whole process. The per-caller key on that route is an IP
   * when there is no session, and an IP is rotatable, so the per-caller budget
   * alone bounds nothing. This is the number that actually caps what the route
   * can spend: generous enough that real traffic never sees it, low enough that
   * a distributed flood costs us a bounded amount per instance per minute.
   */
  ratesApiGlobal: { limit: 300, windowMs: 60_000 },
} as const;

export type RateLimitPolicy = keyof typeof RATE_LIMIT_POLICIES;

export interface RateLimitResult {
  /** True when the request is allowed to proceed. */
  ok: boolean;
  /** Seconds until the next request would be allowed (only when `ok` is false). */
  retryAfterSeconds: number;
}

/**
 * Record a hit against `key` and report whether it is within `limit` requests
 * per `windowMs`. Call once per attempt; a denied call is NOT counted against
 * the window (so being throttled doesn't extend the penalty).
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const windowStart = now - windowMs;
  const existing = buckets.get(key)?.times ?? [];
  // Drop timestamps that have aged out of the window.
  const recent = existing.filter((t) => t > windowStart);

  if (recent.length >= limit) {
    buckets.set(key, { times: recent, expiresAt: now + windowMs });
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }

  recent.push(now);
  buckets.set(key, { times: recent, expiresAt: now + windowMs });
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * The form callers should reach for: a named policy plus the identity being
 * throttled. Keeps the budget and the key namespace together, so two call sites
 * on the same policy can never disagree about either.
 */
export function checkRateLimit(policy: RateLimitPolicy, subject: string): RateLimitResult {
  const { limit, windowMs } = RATE_LIMIT_POLICIES[policy];
  return rateLimit(`${policy}:${subject}`, limit, windowMs);
}

/**
 * One message, so a throttled customer reads the same sentence whichever
 * calculator they were using. Written as an instruction, not an apology.
 */
export function rateLimitMessage(result: RateLimitResult): string {
  return `Too many rate requests. Please wait ${result.retryAfterSeconds}s and try again.`;
}

/** Test-only: drop all window state. Not used by application code. */
export function __resetRateLimitsForTests(): void {
  buckets.clear();
  globalForRateLimit.__arenaRateLimitLastSweep = 0;
}
