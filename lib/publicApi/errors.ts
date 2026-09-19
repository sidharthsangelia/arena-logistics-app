/**
 * lib/publicApi/errors.ts
 * -----------------------------------------------------------------------------
 * The error vocabulary of the public API, and the only two response builders
 * the /api/v1 routes are allowed to use.
 *
 * ── WHY CODES AND NOT JUST MESSAGES ─────────────────────────────────────────
 * The old POST /api/rates answered `{ error: "some sentence" }`. An integrator
 * branching on that has to string-match our prose, which means any reword on
 * our side is a silent breaking change on theirs. So every failure carries a
 * stable machine code; the message is for humans and may change freely.
 *
 * ── WHY EVERY RESPONSE CARRIES A REQUEST ID ─────────────────────────────────
 * The integrating team cannot read our logs, and we cannot read theirs. The id
 * is printed in the response, tagged on the Sentry event, and returned in the
 * `x-arena-request-id` header, so "it failed at 14:02" becomes one searchable
 * token instead of a conversation.
 */

import { NextResponse } from "next/server";

/**
 * Stable failure codes. Add to this union; never renumber or repurpose one,
 * because a partner's code is branching on the string.
 */
export type ApiErrorCode =
  /** No key, or a key we do not recognise. */
  | "UNAUTHORIZED"
  /** Valid key, but it is not permitted to call this endpoint. */
  | "FORBIDDEN"
  /** Body was not valid JSON. */
  | "INVALID_JSON"
  /** Body parsed but failed schema validation. `details` says where. */
  | "INVALID_REQUEST"
  /** Body exceeded the byte ceiling before we would parse it. */
  | "PAYLOAD_TOO_LARGE"
  /** Over the per-key or global budget. Honour `Retry-After`. */
  | "RATE_LIMITED"
  /** Tracking: nothing found for that number. */
  | "NOT_FOUND"
  /** Every vendor failed for a reason other than "we don't serve this lane". */
  | "UPSTREAM_UNAVAILABLE"
  /** Our own configuration is wrong or missing. Not the caller's fault. */
  | "MISCONFIGURED"
  /** Anything unhandled. Already in Sentry by the time you read it. */
  | "INTERNAL_ERROR";

/** HTTP status for each code, so two routes can never disagree. */
const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_JSON: 400,
  INVALID_REQUEST: 422,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  UPSTREAM_UNAVAILABLE: 502,
  MISCONFIGURED: 500,
  INTERNAL_ERROR: 500,
};

/** One field-level validation problem, in the shape zod issues flatten to. */
export interface ApiFieldIssue {
  /** Dotted path into the request body, e.g. "shipment.packages.0.weightKg". */
  path: string;
  message: string;
}

export interface ApiErrorBody {
  requestId: string;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiFieldIssue[];
  };
}

export interface ApiErrorOptions {
  details?: ApiFieldIssue[];
  /** Seconds, for 429 only. Sets the Retry-After header as well as the body. */
  retryAfterSeconds?: number;
  /** Extra response headers. */
  headers?: Record<string, string>;
}

export function apiError(
  requestId: string,
  code: ApiErrorCode,
  message: string,
  options: ApiErrorOptions = {},
): NextResponse<ApiErrorBody> {
  const headers: Record<string, string> = {
    "x-arena-request-id": requestId,
    // A partner's cache, or a CDN in front of them, must never keep a failure.
    "Cache-Control": "no-store",
    ...options.headers,
  };

  if (options.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(options.retryAfterSeconds)));
  }

  return NextResponse.json(
    {
      requestId,
      error: {
        code,
        message,
        ...(options.details && options.details.length > 0
          ? { details: options.details }
          : {}),
      },
    },
    { status: STATUS_BY_CODE[code], headers },
  );
}

export function apiSuccess<T extends object>(
  requestId: string,
  body: T,
  headers: Record<string, string> = {},
): NextResponse<T & { requestId: string }> {
  return NextResponse.json(
    { requestId, ...body },
    {
      status: 200,
      headers: {
        "x-arena-request-id": requestId,
        // Prices and tracking are both time-sensitive and key-scoped. Whatever
        // caching we do happens server-side, where we control invalidation.
        "Cache-Control": "no-store",
        ...headers,
      },
    },
  );
}
