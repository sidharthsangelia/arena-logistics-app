/**
 * utils/rateLimit.test.ts
 *
 * The throttle in front of the rate calculators is a cost control: every call
 * it lets through spends real money at Shipmozo, sKart, Aramex, ShipGlobal or
 * SpeedoPost. It had no tests, which for a limiter is worse than it sounds —
 * an off-by-one in the window comparison or a bucket that is written on the
 * denial path fails silently in the permissive direction, and the only signal
 * is a vendor invoice at the end of the month.
 *
 * Time is injected by mocking the clock rather than sleeping, so the window
 * boundaries can be tested exactly.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

import {
  RATE_LIMIT_POLICIES,
  __resetRateLimitsForTests,
  checkRateLimit,
  rateLimit,
  rateLimitMessage,
} from "@/lib/rateLimit";

/** Pin Date.now so a "window" is a number of ticks, not a number of seconds. */
function at(ms: number) {
  mock.method(Date, "now", () => ms);
}

beforeEach(() => {
  mock.restoreAll();
  __resetRateLimitsForTests();
});

describe("sliding window", () => {
  it("allows exactly `limit` calls and denies the next", () => {
    at(1_000);
    for (let i = 0; i < 3; i++) {
      assert.equal(rateLimit("k", 3, 60_000).ok, true, `call ${i + 1} should pass`);
    }
    assert.equal(rateLimit("k", 3, 60_000).ok, false, "the 4th must be denied");
  });

  it("does not count a denied call against the window", () => {
    // Otherwise being throttled extends the penalty: each rejected retry would
    // push the window forward and a client that retries in a loop could never
    // recover.
    at(1_000);
    rateLimit("k", 1, 60_000);

    at(2_000);
    assert.equal(rateLimit("k", 1, 60_000).ok, false);
    at(3_000);
    assert.equal(rateLimit("k", 1, 60_000).ok, false);

    // The single allowed hit was at t=1000, so the window clears at t=61000 —
    // not 62000 or 63000, which is what counting the denials would produce.
    at(61_001);
    assert.equal(rateLimit("k", 1, 60_000).ok, true, "window must clear on the original hit");
  });

  it("slides rather than resetting in fixed blocks", () => {
    // A fixed-block limiter allows 2x the limit across a block boundary. This
    // one must not.
    at(0);
    rateLimit("k", 2, 60_000);
    at(59_000);
    rateLimit("k", 2, 60_000);

    at(59_500);
    assert.equal(rateLimit("k", 2, 60_000).ok, false, "still 2 hits inside the window");

    at(60_001);
    // The t=0 hit has aged out, the t=59000 one has not.
    assert.equal(rateLimit("k", 2, 60_000).ok, true);
    assert.equal(rateLimit("k", 2, 60_000).ok, false);
  });

  it("reports a retryAfter that is actually long enough to wait", () => {
    at(0);
    rateLimit("k", 1, 60_000);
    at(10_000);

    const denied = rateLimit("k", 1, 60_000);
    assert.equal(denied.ok, false);
    assert.equal(denied.retryAfterSeconds, 50);

    // Waiting exactly that long must succeed — a retryAfter that is one second
    // short trains clients to ignore it.
    at(10_000 + denied.retryAfterSeconds * 1_000 + 1);
    assert.equal(rateLimit("k", 1, 60_000).ok, true);
  });

  it("never advertises a zero-second wait", () => {
    at(0);
    rateLimit("k", 1, 60_000);
    at(59_999);
    assert.ok(rateLimit("k", 1, 60_000).retryAfterSeconds >= 1);
  });

  it("keeps keys independent", () => {
    at(0);
    rateLimit("a", 1, 60_000);
    assert.equal(rateLimit("a", 1, 60_000).ok, false);
    assert.equal(rateLimit("b", 1, 60_000).ok, true, "one org must not throttle another");
  });
});

describe("named policies", () => {
  it("gives international and domestic separate budgets", () => {
    // They spend against different vendor accounts. Pricing a domestic parcel
    // must not consume the export calculator's allowance.
    at(0);
    const { limit } = RATE_LIMIT_POLICIES.ratesInternational;
    for (let i = 0; i < limit; i++) checkRateLimit("ratesInternational", "org_1");

    assert.equal(checkRateLimit("ratesInternational", "org_1").ok, false);
    assert.equal(checkRateLimit("ratesDomestic", "org_1").ok, true);
  });

  it("namespaces the subject, so two policies cannot collide on one id", () => {
    at(0);
    checkRateLimit("ratesApiCaller", "all");
    // "all" is also the global bucket's subject. If the policy name were not
    // part of the key, one caller's hits would drain the process-wide budget.
    const { limit } = RATE_LIMIT_POLICIES.ratesApiGlobal;
    for (let i = 0; i < limit; i++) {
      assert.equal(checkRateLimit("ratesApiGlobal", "all").ok, true, `global call ${i + 1}`);
    }
  });

  it("caps the API route below what one caller alone could spend", () => {
    // The per-caller key on that route is an IP, which is rotatable, so the
    // global window is what actually bounds the cost. It has to be reachable.
    assert.ok(
      RATE_LIMIT_POLICIES.ratesApiGlobal.limit > RATE_LIMIT_POLICIES.ratesApiCaller.limit,
      "a global cap at or below the per-caller cap would throttle the first honest client",
    );
  });
});

describe("eviction", () => {
  it("drops buckets whose window has fully expired", () => {
    // The sweep only runs once the map is worth walking, so this pushes past
    // the threshold and then past the interval.
    at(0);
    for (let i = 0; i < 600; i++) rateLimit(`key-${i}`, 1, 60_000);

    // Every one of those is at its limit right now.
    assert.equal(rateLimit("key-0", 1, 60_000).ok, false);

    // Past the window and past the sweep interval: the entries are collectable.
    at(120_001);
    assert.equal(rateLimit("key-0", 1, 60_000).ok, true, "an aged-out key starts fresh");
  });

  it("does not evict a bucket that is still inside its window", () => {
    at(0);
    rateLimit("live", 1, 60_000);
    for (let i = 0; i < 600; i++) rateLimit(`filler-${i}`, 1, 1_000);

    // Long enough for the fillers to expire and a sweep to run, short enough
    // that "live" is still inside its 60s window.
    at(30_000);
    assert.equal(rateLimit("live", 1, 60_000).ok, false, "a live window must survive the sweep");
  });
});

describe("rateLimitMessage", () => {
  it("tells the customer what to do, with the number", () => {
    assert.equal(
      rateLimitMessage({ ok: false, retryAfterSeconds: 12 }),
      "Too many rate requests. Please wait 12s and try again.",
    );
  });
});
