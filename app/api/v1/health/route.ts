/**
 * GET /api/v1/health
 * -----------------------------------------------------------------------------
 * "Is my key working, and what is it allowed to do?"
 *
 * The first thing an integrating team needs, and the thing they would otherwise
 * discover by firing a rate request — which costs us four live vendor calls to
 * answer a question about a header. This touches no vendor, no shipment and no
 * pricing, so it can be called freely while they wire things up.
 *
 * ── WHAT IT DELIBERATELY DOES NOT REPORT ────────────────────────────────────
 * Not the markup percentage, and not whether one is configured. That number is
 * our margin; an endpoint that confirms it is set would also confirm what it is
 * to anyone comparing quotes against it. If markup is misconfigured the rate
 * endpoints fail loudly with MISCONFIGURED and we hear about it from Sentry,
 * which is the right place for that to surface.
 */

import { apiSuccess } from "@/lib/publicApi/errors";
import { withPublicApi } from "@/lib/publicApi/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withPublicApi(
  // No `scope`: a key with no scopes still needs to be told that it has none,
  // and a 403 here would read as "your key is wrong" when the key is fine.
  { policy: "publicApiHealth", endpoint: "health" },
  async (ctx) =>
    apiSuccess(ctx.requestId, {
      status: "ok" as const,
      /** The name this key is known by in our logs. Quote it in support threads. */
      consumer: ctx.consumer.name,
      /** Endpoints this key may call. */
      scopes: ctx.consumer.scopes,
      /**
       * Whether the key is bound to an Arena account. False means tracking by
       * ARN will be refused and only carrier waybills will resolve.
       */
      orgBound: Boolean(ctx.consumer.orgId),
      /** Server time, so a caller can spot clock skew against Retry-After. */
      serverTime: new Date().toISOString(),
    }),
);
