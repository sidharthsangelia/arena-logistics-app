/**
 * GET /api/v1/track?query=ARN260130748291
 * -----------------------------------------------------------------------------
 * One number in, one merged timeline out. The caller does not have to know
 * which kind of number they are holding — a customer off a label does not.
 *
 * ── WHO MAY LOOK UP WHAT ────────────────────────────────────────────────────
 * Two kinds of number, two different rules, and conflating them is the whole
 * risk on this endpoint.
 *
 *   A CARRIER WAYBILL is the carrier's number, not ours. A customer can hold
 *   one for a shipment Arena never touched, and looking it up reveals nothing
 *   about our records. Any key may do it.
 *
 *   AN ARENA SHIPMENT NUMBER (ARN…) is ours, and it identifies a booking, an
 *   account and a route. ARN numbers are issued in sequence, so an endpoint
 *   that resolves any of them lets whoever holds a key walk our whole book.
 *   Only a key bound to an org in ARENA_API_KEYS may resolve one, and only
 *   within that org.
 *
 * That is the same rule the tenant UI runs under (TrackingScope in
 * lib/tracking/shipmentResolve.ts). The difference is only where the org comes
 * from: a Clerk session there, the API key here. Neither takes it from the
 * request, which is the point.
 *
 * A key with no org binding is given a scope that matches no shipment at all,
 * so even if an ARN slipped past the check above it would resolve to nothing
 * rather than to somebody's booking. The check and the scope are independent,
 * and either alone would be enough.
 */

import { z } from "zod";

import { trackByQuery } from "@/lib/services/shipmentTracking.service";
import { looksLikeShipmentNumber } from "@/lib/tracking/queryShape";
import type { TrackingScope } from "@/lib/tracking/shipmentResolve";
import { apiError, apiSuccess } from "@/lib/publicApi/errors";
import { withPublicApi } from "@/lib/publicApi/handler";
import type { ApiConsumer } from "@/lib/publicApi/keys";
import { scrubVendorBrands, toPublicTrackingResult } from "@/lib/publicApi/serialize";
import { toFieldIssues, trackQuerySchema } from "@/lib/publicApi/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A scope that can never match a row.
 *
 * Clerk org ids are "org_" + a base-something id, so this string is not one and
 * `orgId = "__arena_public_api_no_org__"` matches nothing. Using a sentinel
 * rather than widening TrackingScope keeps the "arena" branch — the one that
 * resolves ANY booking — unreachable from this file.
 */
const NO_ORG_SCOPE: TrackingScope = {
  kind: "org",
  orgId: "__arena_public_api_no_org__",
};

function scopeFor(consumer: ApiConsumer): TrackingScope {
  return consumer.orgId ? { kind: "org", orgId: consumer.orgId } : NO_ORG_SCOPE;
}

export const GET = withPublicApi(
  { scope: "track", policy: "publicApiTrack", endpoint: "track" },
  async (ctx) => {
    const url = new URL(ctx.req.url);

    // `awb` is accepted alongside `query` because it is the obvious name to
    // reach for and a 422 over a parameter alias is a wasted support round trip.
    const raw = url.searchParams.get("query") ?? url.searchParams.get("awb") ?? "";

    const parsed = trackQuerySchema.safeParse({ query: raw });

    if (!parsed.success) {
      return apiError(ctx.requestId, "INVALID_REQUEST", "The query parameter is not valid.", {
        details: toFieldIssues(parsed.error as z.ZodError),
      });
    }

    const { query } = parsed.data;

    if (looksLikeShipmentNumber(query) && !ctx.consumer.orgId) {
      // Named plainly: this is a configuration gap on our side, not a bad
      // request, and the integrator cannot fix it without telling us which
      // account their site sells for.
      return apiError(
        ctx.requestId,
        "FORBIDDEN",
        "This API key cannot resolve Arena shipment numbers. Track by carrier waybill, " +
          "or ask us to bind the key to your account.",
      );
    }

    const response = await trackByQuery({ query, scope: scopeFor(ctx.consumer) });

    if (!response.success || !response.result) {
      // One message whether the number is unknown, belongs to another account,
      // or was declined by every carrier. Distinguishing them would turn this
      // endpoint into an oracle for which numbers exist.
      return apiError(
        ctx.requestId,
        "NOT_FOUND",
        `No tracking information found for ${query}.`,
      );
    }

    const body = toPublicTrackingResult(response.result);

    return apiSuccess(ctx.requestId, scrubVendorBrands({ tracking: body }, "track"));
  },
);
