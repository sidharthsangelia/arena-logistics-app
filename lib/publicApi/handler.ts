/**
 * lib/publicApi/handler.ts
 * -----------------------------------------------------------------------------
 * The wrapper every /api/v1 route runs inside, so the things that must happen
 * on every request cannot be forgotten on one of them.
 *
 * In order:
 *   1. mint a request id                 — before anything can fail
 *   2. authenticate the key              — 401 with no hint about why
 *   3. check the scope                   — 403
 *   4. check the global budget, then the per-key one
 *   5. run the route
 *   6. catch everything                  — Sentry, then one opaque 500
 *
 * ── WHY THE GLOBAL BUDGET IS CHECKED FIRST ──────────────────────────────────
 * It is the one that protects us rather than the caller. Checking it first
 * means a flood is rejected by the cheapest control available, and a caller
 * whose own budget is fine still cannot push total spend past the ceiling.
 *
 * ── WHY THE 500 IS OPAQUE ───────────────────────────────────────────────────
 * An unhandled error's message is written for us and routinely contains a
 * vendor name, a URL or a stack frame. The caller gets a fixed sentence and the
 * request id; the detail goes to Sentry under that same id, which is the only
 * place it is any use.
 */

import { NextResponse, type NextRequest } from "next/server";
import { nanoid } from "nanoid";
import * as Sentry from "@sentry/nextjs";

import type { RateLimitPolicy } from "@/lib/rateLimit";
import { apiError, type ApiErrorBody } from "./errors";
import { hasConfiguredKeys, resolveConsumer, type ApiConsumer, type ApiScope } from "./keys";
import { checkQuota } from "./quota";

/** Largest body we will read. A rate request is under 4 KB in every real case. */
const MAX_BODY_BYTES = 64 * 1024;

export interface PublicApiContext {
  requestId: string;
  consumer: ApiConsumer;
  req: NextRequest;
}

export interface PublicApiRouteOptions {
  /**
   * Scope the key must hold. Omitted only by endpoints that every valid key may
   * call whatever it is scoped to — today that is the key check itself, which
   * has to work for a key with no scopes or it cannot report that fact.
   */
  scope?: ApiScope;
  /** Per-key budget for this endpoint. */
  policy: RateLimitPolicy;
  /** Label for Sentry tags and the leak guard, e.g. "rates:international". */
  endpoint: string;
}

type Handler = (ctx: PublicApiContext) => Promise<NextResponse>;

/**
 * Read the presented key.
 *
 * Both spellings are accepted because both are what an integrator reaches for:
 * `x-api-key` is the one we document, and `Authorization: Bearer` is what most
 * HTTP clients make easiest. Neither is more trusted than the other.
 */
function presentedKey(req: NextRequest): string | null {
  const header = req.headers.get("x-api-key");
  if (header) return header;

  const authorization = req.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return null;
}

export function withPublicApi(
  options: PublicApiRouteOptions,
  handler: Handler,
): (req: NextRequest) => Promise<NextResponse> {
  return async function route(req: NextRequest): Promise<NextResponse> {
    const requestId = `req_${nanoid(16)}`;

    try {
      // -- 1. Authenticate --------------------------------------------------
      const consumer = resolveConsumer(presentedKey(req));

      if (!consumer) {
        // One message for "no key", "wrong key" and "no keys configured".
        // Telling them apart is free reconnaissance and buys the caller
        // nothing: all three are fixed the same way, by checking the key.
        if (!hasConfiguredKeys()) {
          Sentry.captureMessage("Public API called with no keys configured", {
            level: "warning",
            tags: { location: "publicApi.withPublicApi", endpoint: options.endpoint },
          });
        }

        return apiError(
          requestId,
          "UNAUTHORIZED",
          "Missing or invalid API key. Send it as the x-api-key header.",
        );
      }

      Sentry.setTag("arena.api.consumer", consumer.name);
      Sentry.setTag("arena.api.requestId", requestId);

      // -- 2. Scope ---------------------------------------------------------
      if (options.scope && !consumer.scopes.includes(options.scope)) {
        return apiError(
          requestId,
          "FORBIDDEN",
          `This API key is not permitted to call ${options.endpoint}.`,
        );
      }

      // -- 3. Budgets -------------------------------------------------------
      const global = await checkQuota("publicApiGlobal", "all");
      if (!global.ok) {
        return apiError(
          requestId,
          "RATE_LIMITED",
          "The API is currently over capacity. Retry shortly.",
          { retryAfterSeconds: global.retryAfterSeconds },
        );
      }

      const perKey = await checkQuota(options.policy, consumer.name);
      if (!perKey.ok) {
        return apiError(
          requestId,
          "RATE_LIMITED",
          "Too many requests for this API key. Retry after the window resets.",
          { retryAfterSeconds: perKey.retryAfterSeconds },
        );
      }

      // -- 4. Run -----------------------------------------------------------
      return await handler({ requestId, consumer, req });
    } catch (err) {
      Sentry.captureException(err, {
        tags: {
          location: "publicApi.withPublicApi",
          endpoint: options.endpoint,
          requestId,
        },
      });

      return apiError(
        requestId,
        "INTERNAL_ERROR",
        "Something went wrong on our side. Quote this request id if it persists.",
      );
    }
  };
}

export type ParsedBody =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse<ApiErrorBody> };

/**
 * Read and parse a JSON body, with a byte ceiling.
 *
 * Content-Length is checked first so an oversized body is refused before it is
 * buffered, and the buffered length is checked too, because Content-Length is
 * supplied by the caller and a chunked request has none at all.
 */
export async function readJsonBody(req: NextRequest, requestId: string): Promise<ParsedBody> {
  const declared = Number(req.headers.get("content-length") ?? "");

  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: apiError(
        requestId,
        "PAYLOAD_TOO_LARGE",
        `Request body must be under ${MAX_BODY_BYTES / 1024} KB.`,
      ),
    };
  }

  let text: string;

  try {
    text = await req.text();
  } catch {
    return {
      ok: false,
      response: apiError(requestId, "INVALID_JSON", "Could not read the request body."),
    };
  }

  if (text.length > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: apiError(
        requestId,
        "PAYLOAD_TOO_LARGE",
        `Request body must be under ${MAX_BODY_BYTES / 1024} KB.`,
      ),
    };
  }

  if (!text.trim()) {
    return {
      ok: false,
      response: apiError(requestId, "INVALID_JSON", "Request body is empty. Send a JSON object."),
    };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: apiError(requestId, "INVALID_JSON", "Request body is not valid JSON."),
    };
  }
}
