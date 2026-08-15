/**
 * RATE ADAPTER ERRORS
 * -----------------------------------------------------------------------------
 * A typed failure for the rate side, mirroring BookingAdapterError on the
 * booking side (lib/booking-adapters/core/base.booking.adapter.ts). Same shape,
 * same reasoning, deliberately not shared: the two adapter families have no
 * other coupling and one importing the other's core module would create it.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Until this file, every adapter threw a plain `Error` with the HTTP status
 * embedded in the message text, and BaseVendorAdapter flattened all of it into
 * one string. That is survivable for the live calculator, where a human reads
 * the message and tries again. It is not survivable for the scheduled rate
 * sweep, which makes thousands of calls unattended and has to tell three very
 * different situations apart without a person in the loop:
 *
 *   NO_SERVICE    the vendor answered, and the answer is "not this lane".
 *                 A fact worth storing. Retrying changes nothing.
 *   VENDOR_ERROR  a 5xx or a timeout. Retry it; the lane is probably fine.
 *   AUTH_ERROR    401/403. Stop this vendor for the whole run. Continuing
 *                 means six hundred more failures and, on some vendors, a
 *                 lockout.
 *   RATE_LIMITED  429. Back off, honour Retry-After, keep going slower.
 *
 * Telling them apart by grepping the message string was the alternative, and it
 * breaks the first time a vendor rewords an error.
 *
 * ── COMPATIBILITY ───────────────────────────────────────────────────────────
 * Every field the existing code reads is unchanged. `VendorError` gains three
 * optional fields, so the live rate calculator, the API route and the booking
 * service all keep working with no edit. An adapter that still throws a plain
 * Error still produces a sensible VendorError; it just classifies as UNKNOWN
 * and the sweep treats it as retriable, which is the safe default.
 */

/** How a vendor failure should be acted on, independent of its wording. */
export type RateErrorKind =
  /** The vendor answered and declined the lane. Not retriable, and not a fault. */
  | "NO_SERVICE"
  /** Credentials rejected. Stop querying this vendor until someone fixes it. */
  | "AUTH_ERROR"
  /** 429, or the vendor said slow down. Back off and continue. */
  | "RATE_LIMITED"
  /** 5xx, socket error, malformed body. Probably transient. */
  | "VENDOR_ERROR"
  /** Missing credentials or config on our side. No point retrying. */
  | "CONFIG_ERROR"
  /** The call did not come back in time. */
  | "TIMEOUT"
  /** Anything unclassified. Treated as retriable. */
  | "UNKNOWN";

export interface RateAdapterErrorOptions {
  kind?: RateErrorKind;
  status?: number;
  /** Seconds the vendor asked us to wait, parsed from Retry-After. */
  retryAfterSeconds?: number;
  retriable?: boolean;
  cause?: unknown;
}

export class RateAdapterError extends Error {
  readonly vendorId: string;
  readonly kind: RateErrorKind;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  readonly retriable: boolean;

  constructor(
    vendorId: string,
    message: string,
    opts: RateAdapterErrorOptions = {},
  ) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = "RateAdapterError";
    this.vendorId = vendorId;
    this.kind = opts.kind ?? "UNKNOWN";
    this.status = opts.status;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    // Explicit wins; otherwise the kind decides. Defaulting to retriable is the
    // conservative choice: a retriable error costs one extra call, a
    // non-retriable one that should have been retried loses the lane.
    this.retriable = opts.retriable ?? defaultRetriable(opts.kind ?? "UNKNOWN");
  }
}

function defaultRetriable(kind: RateErrorKind): boolean {
  switch (kind) {
    case "NO_SERVICE":
    case "AUTH_ERROR":
    case "CONFIG_ERROR":
      return false;
    default:
      return true;
  }
}

/**
 * Classify an HTTP status the way the sweep needs to act on it.
 *
 * 404 is deliberately NOT NO_SERVICE. A 404 from a rate endpoint means the URL
 * is wrong, which is our bug; vendors signal an unserviceable lane in the body
 * of a 200, and every adapter handles that in its own transformResponse.
 */
export function classifyHttpStatus(status: number): RateErrorKind {
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "VENDOR_ERROR";
  if (status >= 400) return "VENDOR_ERROR";
  return "UNKNOWN";
}

/**
 * Read Retry-After, which comes in two forms per RFC 9110: delta-seconds, or an
 * HTTP-date. Both are handled because vendors use both, and an unparsed header
 * silently becomes "no backoff at all", which is the opposite of what the
 * vendor asked for.
 *
 * Returns undefined rather than 0 when absent, so a caller can tell "no opinion"
 * from "retry immediately". Caps at an hour: a vendor asking us to wait longer
 * than the sweep's own window is telling us to give up for tonight, and the
 * sweep handles that by finishing the run rather than by sleeping through it.
 */
export function parseRetryAfter(
  header: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (!header) return undefined;

  const trimmed = header.trim();
  if (!trimmed) return undefined;

  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds)) {
    if (asSeconds < 0) return undefined;
    return Math.min(Math.ceil(asSeconds), 3600);
  }

  const asDate = Date.parse(trimmed);
  if (Number.isNaN(asDate)) return undefined;

  const seconds = Math.ceil((asDate - now) / 1000);
  if (seconds <= 0) return 0;
  return Math.min(seconds, 3600);
}

/**
 * Build a RateAdapterError from a fetch Response the adapter has already
 * decided is a failure. One call site per adapter instead of each one
 * re-deriving the status/kind/Retry-After trio and getting a different subset
 * of it right.
 */
export function errorFromResponse(
  vendorId: string,
  vendorLabel: string,
  res: { status: number; statusText?: string; headers?: Headers },
  body?: string,
): RateAdapterError {
  const kind = classifyHttpStatus(res.status);
  const suffix = body ? `: ${truncateBody(body)}` : "";

  return new RateAdapterError(
    vendorId,
    `${vendorLabel} returned ${res.status}${res.statusText ? ` ${res.statusText}` : ""}${suffix}`,
    {
      kind,
      status: res.status,
      retryAfterSeconds: parseRetryAfter(res.headers?.get("retry-after")),
    },
  );
}

/** Keeps a vendor's HTML error page out of the database and out of Sentry. */
export function truncateBody(body: string, max = 500): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

/**
 * Pull the classification off whatever was actually thrown. Plain Errors and
 * non-Error throws both land on UNKNOWN/retriable, which is why every caller
 * can use this without first checking the type.
 */
export function describeThrown(err: unknown): {
  message: string;
  kind: RateErrorKind;
  status?: number;
  retryAfterSeconds?: number;
  retriable: boolean;
} {
  if (err instanceof RateAdapterError) {
    return {
      message: err.message,
      kind: err.kind,
      status: err.status,
      retryAfterSeconds: err.retryAfterSeconds,
      retriable: err.retriable,
    };
  }

  // fetch() surfaces network failures and aborts as TypeError / AbortError.
  // Both are transient and both are worth naming, because "TypeError: fetch
  // failed" in a failure row is otherwise unreadable a month later.
  if (err instanceof Error) {
    const isAbort = err.name === "AbortError" || err.name === "TimeoutError";
    return {
      message: isAbort ? `Request timed out (${err.name})` : err.message,
      kind: isAbort ? "TIMEOUT" : "UNKNOWN",
      retriable: true,
    };
  }

  return { message: "Unknown vendor error", kind: "UNKNOWN", retriable: true };
}
