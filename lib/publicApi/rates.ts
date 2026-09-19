/**
 * lib/publicApi/rates.ts
 * -----------------------------------------------------------------------------
 * The body of both rate endpoints. They differ only in which adapter registry
 * they fan out over and which markup variable applies, so the sequence lives
 * here once rather than being copied into two routes that then drift.
 *
 * ── THE ORDER OF OPERATIONS IS THE DESIGN ───────────────────────────────────
 *   markup resolved FIRST, before any vendor is called
 *     A misconfigured markup must fail before we have spent money, not after.
 *
 *   cache read/write happens around the fan-out, on PRE-MARKUP quotes
 *     See lib/publicApi/cache.ts. The markup is applied after the cache, every
 *     time, so changing the env var changes the next response rather than the
 *     next expiry.
 *
 *   markup applied through lib/pricing/markup.ts
 *     The same module the tenant calculator and the booking step use. Doing the
 *     multiplication here would be three lines and a second definition of what
 *     a sell price is.
 *
 *   serialise, THEN scrub
 *     The serialiser masks the fields we know about; the scrub catches the ones
 *     we forgot. Both run before anything is returned.
 */

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { applyMarkup } from "@/lib/pricing/markup";
import { getRates } from "@/lib/services/rate-calculator.service";
import type { AdapterRegistry } from "@/lib/rate-adapters/core/registry";
import type { CanonicalRateRequest, RateQuote } from "@/lib/rate-adapters/core/types";

import { apiError, apiSuccess } from "./errors";
import type { PublicApiContext } from "./handler";
import { rateCacheKey, readRateCache, writeRateCache } from "./cache";
import { resolveApiMarkup, type MarkupScope } from "./markup";
import {
  allFailuresAreNoService,
  scrubVendorBrands,
  toPublicQuote,
  toPublicWarning,
  type PublicQuote,
  type PublicWarning,
} from "./serialize";

export interface PublicRatesBody {
  /** Currency every quote is in. INR today for every source. */
  currency: string;
  /** Cheapest first. Empty when the lane is not served. */
  quotes: PublicQuote[];
  /** Sources that failed, named only by what kind of failure it was. */
  warnings: PublicWarning[];
  /** True when this answer came from our short-lived cache, not a live call. */
  cached: boolean;
}

export interface QuoteRequestParams {
  ctx: PublicApiContext;
  scope: MarkupScope;
  request: CanonicalRateRequest;
  /** Already validated against the registry by the route. */
  vendorIds?: string[];
  /** Domestic passes its own registry; international takes the default. */
  registry?: AdapterRegistry;
}

export async function quoteForPublicApi({
  ctx,
  scope,
  request,
  vendorIds,
  registry,
}: QuoteRequestParams): Promise<NextResponse> {
  const { requestId, consumer } = ctx;
  const endpoint = scope === "international" ? "rates:international" : "rates:domestic";

  // -- 1. Markup, before anything is spent ---------------------------------
  const markup = resolveApiMarkup(consumer, scope);

  if (!markup.ok) {
    // An operator problem, so it goes to Sentry at error level: nobody is
    // watching a partner's 500s, and this one means the endpoint is down until
    // an env var is fixed.
    Sentry.captureMessage("Public API markup is not configured", {
      level: "error",
      tags: { location: "publicApi.quote", endpoint, consumer: consumer.name },
      extra: { reason: markup.reason },
    });

    return apiError(
      requestId,
      "MISCONFIGURED",
      "Rate quoting is temporarily unavailable. Our team has been notified.",
    );
  }

  // -- 2. Cache, then the fan-out ------------------------------------------
  const cacheKey = rateCacheKey(scope, request, vendorIds);
  const cached = await readRateCache(cacheKey);

  const atCost = cached ?? (await fanOut());
  const fromCache = cached !== null;

  if (!fromCache) {
    // Fire-and-forget: a partner should not wait on our cache write, and a
    // failed write is a future cache miss rather than a failed request.
    void writeRateCache(cacheKey, atCost);
  }

  async function fanOut() {
    // markupPercent 0 on purpose — see the cache module. This is the only place
    // in the codebase that asks for un-marked-up quotes, and they never leave
    // this function without applyMarkup running over them below.
    return getRates(request, { vendorIds, markupPercent: 0, registry });
  }

  // -- 3. Sell price -------------------------------------------------------
  const sellQuotes: RateQuote[] = atCost.quotes.map((quote) =>
    applyMarkup(quote, markup.percent),
  );

  const warnings = atCost.vendorErrors.map(toPublicWarning);

  // -- 4. Decide the status ------------------------------------------------
  // No quotes has two very different meanings and an integrator has to be able
  // to tell them apart without reading prose: a lane nobody serves is a
  // complete answer, and every source being down is not.
  if (sellQuotes.length === 0 && !allFailuresAreNoService(atCost.vendorErrors)) {
    return apiError(
      requestId,
      "UPSTREAM_UNAVAILABLE",
      "No rate source responded successfully. This is usually transient; retry shortly.",
    );
  }

  const body: PublicRatesBody = {
    currency: sellQuotes[0]?.currency ?? "INR",
    quotes: sellQuotes.map(toPublicQuote),
    warnings,
    cached: fromCache,
  };

  return apiSuccess(requestId, scrubVendorBrands(body, endpoint));
}
