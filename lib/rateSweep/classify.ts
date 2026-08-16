/**
 * lib/rateSweep/classify.ts
 *
 * How a vendor failure becomes a stored status and a retry decision.
 *
 * PURE MODULE, and separate from execute.ts for exactly that reason: execute.ts
 * is `server-only` because it touches Prisma, and these two functions are the
 * part of it most worth testing. Rules that decide whether thousands of unattended
 * calls get retried should not be reachable only through a database.
 */

import { RateSweepCallStatus } from "@/generated/prisma";
import type { RateErrorKind } from "@/lib/rate-adapters/core/errors";

/** The stored outcome for a failure of this kind. */
export function statusForErrorKind(
  kind: RateErrorKind | undefined,
): RateSweepCallStatus {
  switch (kind) {
    case "NO_SERVICE":
      return RateSweepCallStatus.NO_SERVICE;
    case "AUTH_ERROR":
      return RateSweepCallStatus.AUTH_ERROR;
    case "RATE_LIMITED":
      return RateSweepCallStatus.RATE_LIMITED;
    case "TIMEOUT":
      return RateSweepCallStatus.TIMEOUT;
    case "CONFIG_ERROR":
      return RateSweepCallStatus.CONFIG_ERROR;
    default:
      return RateSweepCallStatus.VENDOR_ERROR;
  }
}

/**
 * Kinds where another attempt cannot help.
 *
 * NO_SERVICE is a lane the vendor does not fly, CONFIG_ERROR is ours to fix and
 * AUTH_ERROR is a credential to rotate. Retrying any of them just spends the
 * pacing budget on a certainty.
 *
 * Anything unrecognised is retriable, and the asymmetry is deliberate: a
 * needless retry costs one call, a missed retry costs the lane for five days.
 */
export function isTerminalKind(kind: RateErrorKind | undefined): boolean {
  return kind === "NO_SERVICE" || kind === "AUTH_ERROR" || kind === "CONFIG_ERROR";
}
