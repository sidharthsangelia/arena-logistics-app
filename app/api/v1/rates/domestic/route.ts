/**
 * POST /api/v1/rates/domestic
 * -----------------------------------------------------------------------------
 * India-to-India courier rates by PIN code pair, for a partner site.
 *
 * The domestic twin of the international route: same auth, same validation
 * discipline, same cache and markup path. The two differences are the adapter
 * registry it fans out over and the markup variable that applies
 * (ARENA_API_MARKUP_PERCENT_DOMESTIC).
 *
 * This is the COURIER calculator — the live, bookable one behind the tenant
 * domestic rates page. It is not the legacy air-cargo rate-card engine in
 * actions/domesticRates.action.ts, which prices from uploaded rate cards and is
 * deliberately not exposed here.
 */

import { DOMESTIC_CALCULATOR_VENDORS } from "@/lib/types";
import { domesticAdapterRegistry } from "@/lib/rate-adapters/vendors/domestic.index";
import { apiError } from "@/lib/publicApi/errors";
import { readJsonBody, withPublicApi } from "@/lib/publicApi/handler";
import { quoteForPublicApi } from "@/lib/publicApi/rates";
import {
  domesticRateRequestSchema,
  toCanonicalDomestic,
  toFieldIssues,
} from "@/lib/publicApi/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_VENDOR_IDS = new Set<string>(DOMESTIC_CALCULATOR_VENDORS.map((v) => v.id));

export const POST = withPublicApi(
  {
    scope: "rates:domestic",
    policy: "publicApiRatesDomestic",
    endpoint: "rates:domestic",
  },
  async (ctx) => {
    const body = await readJsonBody(ctx.req, ctx.requestId);
    if (!body.ok) return body.response;

    const parsed = domesticRateRequestSchema.safeParse(body.value);

    if (!parsed.success) {
      return apiError(ctx.requestId, "INVALID_REQUEST", "The request body is not valid.", {
        details: toFieldIssues(parsed.error),
      });
    }

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
      scope: "domestic",
      request: toCanonicalDomestic(parsed.data),
      vendorIds: parsed.data.vendorIds,
      registry: domesticAdapterRegistry,
    });
  },
);
