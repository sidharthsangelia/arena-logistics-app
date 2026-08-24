/**
 * lib/rateSweep/health.ts
 *
 * Was this vendor's share of the sweep any good?
 *
 * PURE MODULE. No Prisma, no server-only, no network. It exists as its own file
 * because the same judgement is needed in two places that must never disagree:
 * `finaliseSweepRun` decides the run's status and whether to wake somebody, and
 * the admin run screen shows a person the same numbers. Those were two separate
 * implementations of the arithmetic, and they had already drifted.
 *
 * ── WHY THE DENOMINATOR IS "EXPECTED" AND NOT "ATTEMPTED" ───────────────────
 * This is the whole point of the file, and it is the bug that let a sweep lose
 * a fifth of the matrix and still report COMPLETED.
 *
 * The obvious version counts the rows in the calls table: attempted, of which
 * ok, of which failed. Every one of those numbers is derived from rows that
 * EXIST. A lane that died before writing anything contributes nothing to the
 * numerator and nothing to the denominator, so it is arithmetically invisible:
 * a vendor that recorded 346 of its 780 cells scored a 0% failure rate, because
 * the 410 cells it never wrote were never counted as anything at all.
 *
 * So the denominator is what the run SET OUT to record, taken from the run's
 * own stored plan, and cells with no row are counted as missing. Absence is the
 * loudest signal this system has and it now has somewhere to be counted.
 *
 * ── AND WHY AN EMPTY LANE IS ITS OWN ALARM ──────────────────────────────────
 * A ratio alone is not enough. Losing every USA cell for a vendor is 30 of 780
 * cells, under 4%, nowhere near any sane threshold, and it is also the single
 * worst thing that can happen to this dataset: a whole country disappears from
 * a vendor's coverage with nothing in the table to say so. A lane that recorded
 * nothing is therefore a degradation on its own terms, whatever the ratio says.
 */

import { ALERT_ON_ZERO_ROWS, VENDOR_FAILURE_ALERT_RATIO } from "./config";

export interface VendorHealthInput {
  vendorId: string;
  /** Cells this vendor was supposed to record: its lanes x its weight slabs. */
  expected: number;
  /** Cells that actually produced a row, whatever the status on it. */
  attempted: number;
  ok: number;
  /** Answered and declined. Not a failure; see below. */
  noService: number;
  /** Product rows written. */
  snapshots: number;
  /** Lanes (vendor x country) this vendor was supposed to sweep. */
  lanesExpected: number;
  /** Lanes that produced at least one row. */
  lanesWithRows: number;
  /** Lanes that produced a row for every slab. */
  lanesComplete: number;
  /**
   * True while the sweep is still running.
   *
   * A cell that has not been swept YET is not a cell that went missing, and a
   * lane still sitting in the queue has not failed. Without this, the run screen
   * would open on a healthy sweep in progress and show every vendor as degraded
   * with hundreds of cells missing, which is the fastest way to teach somebody
   * that the degraded badge means nothing.
   */
  inFlight?: boolean;
}

export interface VendorHealth {
  vendorId: string;
  expected: number;
  attempted: number;
  ok: number;
  noService: number;
  /** Real failures: vendor errors, timeouts, auth, rate limits, skips. */
  failedRows: number;
  /** Cells that never produced a row at all. The number that used to vanish. */
  missing: number;
  /** failedRows + missing. Everything that is not a usable answer. */
  failed: number;
  snapshots: number;
  lanesExpected: number;
  lanesWithRows: number;
  lanesComplete: number;
  /** Lanes that recorded nothing whatsoever. Always worth an alert. */
  lanesEmpty: number;
  /** Lanes that started and stopped short. */
  lanesPartial: number;
  /** failed / (expected - noService), or 0 when nothing was expected. */
  failureRatio: number;
  /** True when this vendor produced no usable rows at all. */
  silent: boolean;
  degraded: boolean;
}

export function judgeVendor(input: VendorHealthInput): VendorHealth {
  const attempted = Math.max(0, input.attempted);

  // While the run is in flight, judge it only on what it has already done.
  // Everything still ahead of it is pending, not missing.
  const expected = input.inFlight
    ? attempted
    : Math.max(0, input.expected);
  const lanesExpected = input.inFlight
    ? input.lanesWithRows
    : Math.max(0, input.lanesExpected);

  const missing = Math.max(0, expected - attempted);
  const failedRows = Math.max(0, attempted - input.ok - input.noService);
  const failed = failedRows + missing;

  // NO_SERVICE comes out of the denominator, not just the numerator. A vendor
  // that does not fly to five of the destinations answers every call for them
  // correctly by declining them, and counting those as attempts it failed would
  // put an honest vendor permanently near the alert threshold.
  const judged = Math.max(0, expected - input.noService);

  const lanesEmpty = Math.max(0, lanesExpected - input.lanesWithRows);
  // A lane that has recorded some of its slabs is only "short" once the run is
  // over; until then it is simply still working through them.
  const lanesPartial = input.inFlight
    ? 0
    : Math.max(0, input.lanesWithRows - input.lanesComplete);

  // Nothing expected is not the same as nothing delivered. A run cancelled
  // before a vendor was ever asked must not report that vendor as down.
  const silent = expected > 0 && input.ok === 0;

  const failureRatio = judged > 0 ? failed / judged : 0;

  return {
    vendorId: input.vendorId,
    expected,
    attempted,
    ok: input.ok,
    noService: input.noService,
    failedRows,
    missing,
    failed,
    snapshots: input.snapshots,
    lanesExpected,
    lanesWithRows: input.lanesWithRows,
    lanesComplete: input.lanesComplete,
    lanesEmpty,
    lanesPartial,
    failureRatio,
    silent,
    degraded:
      (silent && ALERT_ON_ZERO_ROWS) ||
      lanesEmpty > 0 ||
      failureRatio > VENDOR_FAILURE_ALERT_RATIO,
  };
}

/**
 * One line explaining why a vendor is degraded, for the run's notes and for the
 * alert. Written from the numbers rather than assembled at each call site, so
 * the inbox row and the admin screen say the same thing.
 */
export function describeVendorHealth(health: VendorHealth): string {
  const parts: string[] = [];

  if (health.lanesEmpty > 0) {
    parts.push(
      `${health.lanesEmpty} ${health.lanesEmpty === 1 ? "lane" : "lanes"} recorded nothing`,
    );
  }
  if (health.lanesPartial > 0) {
    parts.push(`${health.lanesPartial} stopped short`);
  }
  if (health.missing > 0) {
    parts.push(`${health.missing} cells missing`);
  }
  if (health.failedRows > 0) {
    parts.push(`${health.failedRows} failed`);
  }
  if (parts.length === 0) {
    parts.push(`${(health.failureRatio * 100).toFixed(1)}% failure rate`);
  }

  return `${health.vendorId} (${parts.join(", ")})`;
}
