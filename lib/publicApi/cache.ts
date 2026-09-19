/**
 * lib/publicApi/cache.ts
 * -----------------------------------------------------------------------------
 * A short-lived cache in front of the vendor fan-out.
 *
 * A price-comparison widget on a partner site asks the same lane over and over:
 * the same pincode pair, the same 0.5 kg parcel, every time a visitor loads the
 * page. Each of those is a live call to Shipmozo, sKart, Aramex and ShipGlobal
 * that we are billed for. Within a few minutes the answer does not change, so
 * paying for it more than once is waste with no upside.
 *
 * ── WHAT IS STORED IS COST, NOT PRICE ───────────────────────────────────────
 * The payload is the CanonicalRateResponse as the vendors returned it, with
 * markup NOT applied — `getRates` is called with markupPercent 0 and the markup
 * is applied to the cached quotes on the way out, on every request.
 *
 * That ordering is the whole design. If sell prices were cached, editing
 * ARENA_API_MARKUP_PERCENT would take effect gradually as entries expired, and
 * for the length of the TTL two callers could be quoted different margins for
 * the same lane. Caching cost means a markup change is live on the very next
 * request, and the cache can never become a second opinion about pricing.
 *
 * Because rows hold buying cost, nothing in this table is customer-facing and
 * nothing may be returned to a caller without going through
 * lib/publicApi/serialize.ts first.
 *
 * ── WHY THE KEY IS A HASH OF A NORMALISED REQUEST ───────────────────────────
 * Two requests that differ only in key order, casing or absent-vs-undefined
 * fields are the same question, and should not each pay for their own fan-out.
 * The normaliser sorts keys and lowercases the things that are case-insensitive
 * upstream (country codes, pincodes), so they collapse onto one row.
 */

import { createHash } from "node:crypto";

import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import type { CanonicalRateRequest, CanonicalRateResponse } from "@/lib/rate-adapters/core/types";

/** Default TTL. Overridable with ARENA_API_RATE_CACHE_TTL_SECONDS. */
const DEFAULT_TTL_SECONDS = 900; // 15 minutes
const MIN_TTL_SECONDS = 0; // 0 disables the cache entirely
const MAX_TTL_SECONDS = 3600;

export function rateCacheTtlSeconds(): number {
  const raw = process.env.ARENA_API_RATE_CACHE_TTL_SECONDS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_TTL_SECONDS;

  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_TTL_SECONDS || n > MAX_TTL_SECONDS) {
    // A bad TTL is a config typo, not a reason to stop quoting. Fall back to the
    // default rather than disabling the cache or caching for a day by accident.
    return DEFAULT_TTL_SECONDS;
  }

  return Math.floor(n);
}

/**
 * Deterministic JSON: object keys sorted at every level, undefined dropped.
 * `JSON.stringify` preserves insertion order, so without this the same request
 * built by two different code paths hashes differently.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);

  return `{${entries.join(",")}}`;
}

/** Lowercase the fields upstream treats case-insensitively, so "in" == "IN". */
function normaliseRequest(request: CanonicalRateRequest): unknown {
  const address = (a: CanonicalRateRequest["origin"]) => ({
    ...a,
    city: a.city?.trim().toLowerCase(),
    country: a.country?.trim().toLowerCase(),
    countryCode: a.countryCode?.trim().toLowerCase(),
    pincode: a.pincode?.trim().toLowerCase(),
    stateCode: a.stateCode?.trim().toLowerCase(),
    line1: a.line1?.trim().toLowerCase(),
  });

  return {
    origin: address(request.origin),
    destination: address(request.destination),
    shipment: request.shipment,
  };
}

export function rateCacheKey(
  scope: "international" | "domestic",
  request: CanonicalRateRequest,
  vendorIds: string[] | undefined,
): string {
  const payload = stableStringify({
    // Versioned so a change to the normaliser or to what we store cannot serve
    // rows written under the old rules. Bump it whenever either changes.
    v: 1,
    scope,
    vendorIds: vendorIds ? [...vendorIds].sort() : null,
    request: normaliseRequest(request),
  });

  return createHash("sha256").update(payload).digest("hex");
}

/**
 * A cached fan-out, or null. Never throws: a cache that cannot be read is a
 * cache miss, which costs a vendor call and nothing else.
 */
export async function readRateCache(
  cacheKey: string,
): Promise<CanonicalRateResponse | null> {
  if (rateCacheTtlSeconds() === 0) return null;

  try {
    const row = await prisma.apiRateCacheEntry.findFirst({
      where: { cacheKey, expiresAt: { gt: new Date() } },
      select: { payload: true },
    });

    if (!row) return null;

    const payload = row.payload as unknown as CanonicalRateResponse;

    // A row written by an older shape would otherwise reach the serialiser and
    // fail there, past the point where we can still fall back to a live call.
    if (!payload || !Array.isArray(payload.quotes)) return null;

    return payload;
  } catch (err) {
    Sentry.captureException(err, {
      level: "warning",
      tags: { location: "publicApi.readRateCache" },
    });
    return null;
  }
}

/**
 * Store a fan-out. Only successful ones with at least one quote: caching "no
 * rates" would pin a lane shut for the whole TTL after one transient vendor
 * wobble, and an empty answer is cheap to recompute anyway.
 */
export async function writeRateCache(
  cacheKey: string,
  response: CanonicalRateResponse,
): Promise<void> {
  const ttl = rateCacheTtlSeconds();
  if (ttl === 0) return;
  if (!response.success || response.quotes.length === 0) return;

  const expiresAt = new Date(Date.now() + ttl * 1000);

  try {
    await prisma.apiRateCacheEntry.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        payload: response as unknown as object,
        expiresAt,
      },
      update: {
        payload: response as unknown as object,
        expiresAt,
      },
    });
  } catch (err) {
    Sentry.captureException(err, {
      level: "warning",
      tags: { location: "publicApi.writeRateCache" },
    });
  }
}
