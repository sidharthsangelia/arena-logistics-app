/**
 * IN-MEMORY SLIDING-WINDOW RATE LIMITER
 * -----------------------------------------------------------------------------
 * A dependency-free throttle for server actions that fan out to paid upstream
 * vendor APIs (e.g. getRatesAction -> Shipmozo/sKart/Aramex). It caps how often
 * a single key (org) can trigger the expensive path.
 *
 * SCOPE / LIMITATIONS (read before relying on this for anything security-grade):
 *   - State lives in process memory, pinned to globalThis so it survives dev HMR
 *     and duplicate module graphs (same pattern as the adapter registry).
 *   - On serverless/multi-instance hosting each instance keeps its own window,
 *     so the effective ceiling is `limit * instanceCount`. That is fine here:
 *     the goal is to stop one tenant hammering the calculator from a single
 *     session, not to enforce a global quota. Move to Redis/Upstash if a hard
 *     cross-instance quota is ever required.
 *
 * The window is a timestamp log trimmed on each call — exact, no background
 * timers, and self-cleaning as keys go idle.
 */

type Bucket = number[]; // ascending request timestamps (ms) within the window

const globalForRateLimit = globalThis as unknown as {
  __arenaRateLimitBuckets?: Map<string, Bucket>;
};

const buckets =
  globalForRateLimit.__arenaRateLimitBuckets ?? new Map<string, Bucket>();
globalForRateLimit.__arenaRateLimitBuckets = buckets;

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
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  const existing = buckets.get(key) ?? [];
  // Drop timestamps that have aged out of the window.
  const recent = existing.filter((t) => t > windowStart);

  if (recent.length >= limit) {
    buckets.set(key, recent);
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + windowMs - now) / 1000),
    );
    return { ok: false, retryAfterSeconds };
  }

  recent.push(now);
  buckets.set(key, recent);
  return { ok: true, retryAfterSeconds: 0 };
}
