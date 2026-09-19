/**
 * POST /api/v1/rates/international
 * -----------------------------------------------------------------------------
 * Export rates out of India, for a partner site. Quotes come back cheapest
 * first across every source we buy from, at the sell price defined by
 * ARENA_API_MARKUP_PERCENT_INTL.
 *
 * This route is deliberately thin: authenticate, validate, convert, delegate.
 * Everything with a judgement call in it lives in lib/publicApi/*.
 *
 * It replaces the old POST /api/rates, which answered unauthenticated callers
 * with raw un-marked-up vendor cost (PRODUCTION-READINESS-TENANT.md N1). That
 * route is deleted rather than left running, because leaving it up would have
 * made this one optional.
 */

import { AVAILABLE_VENDORS } from "@/lib/types";
import { apiError } from "@/lib/publicApi/errors";
import { readJsonBody, withPublicApi } from "@/lib/publicApi/handler";
import { quoteForPublicApi } from "@/lib/publicApi/rates";
import {
  internationalRateRequestSchema,
  toCanonicalInternational,
  toFieldIssues,
} from "@/lib/publicApi/schema";

// Node, not edge: the key comparison uses node:crypto and the quota counter
// uses Prisma. Dynamic because every response depends on the request and on
// state (quota, cache) that must never be prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_VENDOR_IDS = new Set<string>(AVAILABLE_VENDORS.map((v) => v.id));

export const POST = withPublicApi(
  {
    scope: "rates:international",
    policy: "publicApiRatesIntl",
    endpoint: "rates:international",
  },
  async (ctx) => {
    const body = await readJsonBody(ctx.req, ctx.requestId);
    if (!body.ok) return body.response;

    const parsed = internationalRateRequestSchema.safeParse(body.value);

    if (!parsed.success) {
      return apiError(ctx.requestId, "INVALID_REQUEST", "The request body is not valid.", {
        details: toFieldIssues(parsed.error),
      });
    }

    // An unknown vendor id is rejected rather than ignored. The server action
    // silently drops unknown ids and queries everyone, which is right for a
    // checkbox list the user cannot mistype. Here it would mean a caller
    // debugging one source gets a full fan-out and never learns their id was
    // wrong — a bill, and a confusing one.
    const unknown = (parsed.data.vendorIds ?? []).filter((id) => !VALID_VENDOR_IDS.has(id));

    if (unknown.length > 0) {
      return apiError(ctx.requestId, "INVALID_REQUEST", "Unknown vendorIds.", {
        details: unknown.map((id) => ({
          path: "vendorIds",
          message: `"${id}" is not a source on this endpoint.`,
        })),
      });
    }

    return quoteForPublicApi({
      ctx,
      scope: "international",
      request: toCanonicalInternational(parsed.data),
      vendorIds: parsed.data.vendorIds,
    });
  },
);
