import "server-only";

import type {
  SpeedoPostCreateOrderResponse,
  SpeedoPostEnvelope,
  SpeedoPostRatePayload,
  SpeedoPostRateOption,
  SpeedoPostServiceProviderData,
  SpeedoPostServiceabilityEntry,
  SpeedoPostServiceabilityPayload,
  SpeedoPostTrackData,
} from "./types";

/**
 * lib/speedopost/client.ts
 * -----------------------------------------------------------------------------
 * Thin, typed client over SpeedoPost's API. Both adapters (rates and tracking)
 * go through it so there is one place that knows about the token, the envelope
 * and the failure vocabulary.
 *
 * ── WHY A TOKEN CACHE ───────────────────────────────────────────────────────
 * Unlike Shipmozo (static key headers) and sKart (credentials in the body),
 * SpeedoPost wants a JWT obtained from a separate call. Fetching one per API
 * call would double every request and hammer an endpoint that exists to be
 * called rarely, so the token is held in module state until shortly before its
 * own `exp` claim.
 *
 * Two things make that safe rather than clever:
 *
 *   1. SINGLE FLIGHT. Concurrent callers share one in-flight authentication.
 *      Without it the rate adapter's two parallel calls (B2C and B2B) would
 *      race into two logins on a cold process, every time.
 *   2. ONE RETRY ON "Invalid token.". A cached token can be revoked server-side
 *      or outlive a deploy, and SpeedoPost reports that as an ordinary FAIL
 *      body rather than a 401. That one message, and only that one, discards
 *      the cache and replays the request once.
 *
 * The cache is pinned to globalThis for the same reason the adapter registries
 * are: dev HMR and multiple server module graphs would otherwise each keep
 * their own token and re-authenticate independently.
 * ────────────────────────────────────────────────────────────────────────────
 */

// --- CONFIG -------------------------------------------------------------------

/**
 * Live by default. UAT is https://uat.speedopost.com and is one env var away.
 * Deliberately NOT defaulted to UAT: a missing variable in production would
 * then quote prices from a test system as though they were real.
 */
const BASE_URL = (
  process.env.SPEEDOPOST_API_URL ?? "https://admin.speedopost.com"
).replace(/\/+$/, "");

const USER_ID = process.env.SPEEDOPOST_USER_ID ?? "";
const PASSWORD = process.env.SPEEDOPOST_PASSWORD ?? "";

const AUTH_PATH = "/jwt/token";
const API_PREFIX = "/util-service/api/auth/v1";

/** How long before a token's own expiry we go and get a new one. */
const TOKEN_EXPIRY_SKEW_MS = 60_000;

/**
 * Lifetime assumed when a token carries no `exp` claim. Short on purpose: a
 * wrong guess costs one extra login, while trusting an unknown token for hours
 * costs a failed request on every call until it is evicted.
 */
const TOKEN_FALLBACK_TTL_MS = 10 * 60_000;

/** The exact message SpeedoPost returns for a token it will not accept. */
const INVALID_TOKEN_MESSAGE = "invalid token";

// --- ERRORS -------------------------------------------------------------------

export class SpeedoPostApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** True when SpeedoPost refused the token itself, not the request. */
    readonly isAuthFailure = false,
  ) {
    super(message);
    this.name = "SpeedoPostApiError";
  }
}

export function isSpeedoPostConfigured(): boolean {
  return Boolean(USER_ID && PASSWORD);
}

// --- TOKEN --------------------------------------------------------------------

interface TokenCache {
  token: string;
  /** Epoch ms after which the token must not be reused. */
  expiresAt: number;
}

interface SpeedoPostGlobals {
  __arenaSpeedoPostToken?: TokenCache | null;
  __arenaSpeedoPostTokenInFlight?: Promise<string> | null;
}

const globalForSpeedoPost = globalThis as unknown as SpeedoPostGlobals;

/** Drop the cached token. Called when SpeedoPost tells us it is no good. */
function clearToken(): void {
  globalForSpeedoPost.__arenaSpeedoPostToken = null;
}

/**
 * A JWT's `exp` claim in epoch ms, or null when there isn't one we can read.
 *
 * The payload segment is decoded without verifying the signature, which is
 * correct here: we are not authenticating the token, we are reading when to
 * stop using it. A token we cannot parse simply falls back to the short TTL.
 */
function readTokenExpiry(token: string): number | null {
  const segments = token.split(".");
  if (segments.length < 2) return null;

  try {
    // base64url → base64, then pad. atob exists in both Node 18+ and edge.
    const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const claims = JSON.parse(atob(padded)) as { exp?: unknown };
    const exp = Number(claims.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** POST /jwt/token. The one call that does not carry an Authorization header. */
async function authenticate(): Promise<string> {
  if (!isSpeedoPostConfigured()) {
    throw new SpeedoPostApiError(
      "SpeedoPost is not configured. Set SPEEDOPOST_USER_ID and SPEEDOPOST_PASSWORD.",
      undefined,
      true,
    );
  }

  const res = await fetch(`${BASE_URL}${AUTH_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ userId: USER_ID, password: PASSWORD }),
    cache: "no-store",
  });

  const raw = await res.text();

  if (!res.ok) {
    throw new SpeedoPostApiError(
      `SpeedoPost authentication returned ${res.status} ${res.statusText}: ${raw.slice(0, 300)}`,
      res.status,
      true,
    );
  }

  let json: SpeedoPostEnvelope<string>;
  try {
    json = JSON.parse(raw) as SpeedoPostEnvelope<string>;
  } catch {
    throw new SpeedoPostApiError(
      `SpeedoPost authentication returned an unparseable body: ${raw.slice(0, 300)}`,
      res.status,
      true,
    );
  }

  const token = typeof json.response === "string" ? json.response.trim() : "";

  if (!isSuccess(json) || !token) {
    throw new SpeedoPostApiError(
      `SpeedoPost authentication failed: ${json.message || "no token returned"}`,
      res.status,
      true,
    );
  }

  const exp = readTokenExpiry(token);
  globalForSpeedoPost.__arenaSpeedoPostToken = {
    token,
    expiresAt: exp
      ? exp - TOKEN_EXPIRY_SKEW_MS
      : Date.now() + TOKEN_FALLBACK_TTL_MS,
  };

  return token;
}

/**
 * A usable token: the cached one while it is still good, otherwise a fresh one.
 * Concurrent callers on a cold cache share a single authentication rather than
 * each starting their own.
 */
async function getToken(): Promise<string> {
  const cached = globalForSpeedoPost.__arenaSpeedoPostToken;
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const inFlight = globalForSpeedoPost.__arenaSpeedoPostTokenInFlight;
  if (inFlight) return inFlight;

  const pending = authenticate().finally(() => {
    globalForSpeedoPost.__arenaSpeedoPostTokenInFlight = null;
  });
  globalForSpeedoPost.__arenaSpeedoPostTokenInFlight = pending;

  return pending;
}

// --- ENVELOPE -----------------------------------------------------------------

function isSuccess(envelope: SpeedoPostEnvelope<unknown>): boolean {
  return String(envelope.status ?? "").trim().toUpperCase() === "SUCCESS";
}

function looksLikeInvalidToken(envelope: SpeedoPostEnvelope<unknown>): boolean {
  return String(envelope.message ?? "")
    .toLowerCase()
    .includes(INVALID_TOKEN_MESSAGE);
}

// --- REQUEST ------------------------------------------------------------------

interface RequestOptions {
  method: "GET" | "POST";
  path: string;
  label: string;
  body?: unknown;
  query?: Record<string, string>;
}

/**
 * One authenticated call, unwrapped to its `response` payload.
 *
 * `null` is returned only for a SUCCESS whose payload really is empty —
 * callers decide whether that is an answer or a miss, because the two differ
 * per endpoint (an empty rate list is "nobody serves this lane", an empty
 * tracking body is "we do not know this AWB").
 */
async function request<T>(options: RequestOptions): Promise<T | null> {
  // The token is refused on its own body rather than a 401, so the retry is
  // driven by the message and is allowed exactly once. A second failure means
  // the credentials are wrong, and replaying that forever would lock the
  // account rather than fix it.
  try {
    return await send<T>(options, await getToken());
  } catch (err) {
    if (err instanceof SpeedoPostApiError && err.isAuthFailure) {
      clearToken();
      // Re-authenticating cannot fix bad credentials; only a rejected token.
      if (isSpeedoPostConfigured()) {
        return send<T>(options, await getToken());
      }
    }
    throw err;
  }
}

async function send<T>(
  { method, path, label, body, query }: RequestOptions,
  token: string,
): Promise<T | null> {
  const url = new URL(`${BASE_URL}${API_PREFIX}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });

  const raw = await res.text();

  if (!res.ok) {
    throw new SpeedoPostApiError(
      `SpeedoPost ${label} returned ${res.status} ${res.statusText}: ${raw.slice(0, 300)}`,
      res.status,
      res.status === 401 || res.status === 403,
    );
  }

  let json: SpeedoPostEnvelope<T>;
  try {
    json = JSON.parse(raw) as SpeedoPostEnvelope<T>;
  } catch {
    throw new SpeedoPostApiError(
      `SpeedoPost ${label} returned an unparseable body: ${raw.slice(0, 300)}`,
      res.status,
    );
  }

  if (!isSuccess(json)) {
    throw new SpeedoPostApiError(
      `SpeedoPost ${label} error: ${json.message || "Unknown error"}`,
      res.status,
      looksLikeInvalidToken(json),
    );
  }

  return (json.response ?? null) as T | null;
}

// --- ENDPOINTS ----------------------------------------------------------------

/**
 * POST /EstimatedRate. One call prices ONE segment (B2B or B2C), so the rate
 * adapter makes two and merges.
 *
 * An empty array is a real answer here — it means no provider in that segment
 * serves the lane — so it is returned as an empty array rather than thrown.
 */
export async function estimatedRate(
  payload: SpeedoPostRatePayload,
): Promise<SpeedoPostRateOption[]> {
  const data = await request<SpeedoPostRateOption[]>({
    method: "POST",
    path: "/EstimatedRate",
    label: "EstimatedRate",
    body: payload,
  });

  return Array.isArray(data) ? data : [];
}

/**
 * GET /TrackingDetails. Returns null when SpeedoPost answers SUCCESS with
 * nothing, which the tracking adapter treats as "not our waybill".
 */
export async function trackingDetails(
  awb: string,
): Promise<SpeedoPostTrackData | null> {
  return request<SpeedoPostTrackData>({
    method: "GET",
    path: "/TrackingDetails",
    label: "TrackingDetails",
    query: { awb, trackingType: "AWB" },
  });
}

/**
 * POST /Serviceability. Not used by the rate path (EstimatedRate already only
 * answers for providers that can price the lane), but exported because it is
 * the cheapest possible "can we even ship this?" check for ops tooling.
 *
 * De-duplicated by provider code on the way out: the vendor's own documentation
 * shows the same eight providers repeated five times in one response, and
 * whether that is a doc artefact or a live bug is unverified.
 */
export async function serviceability(
  payload: SpeedoPostServiceabilityPayload,
): Promise<SpeedoPostServiceabilityEntry[]> {
  const data = await request<SpeedoPostServiceabilityEntry[]>({
    method: "POST",
    path: "/Serviceability",
    label: "Serviceability",
    body: payload,
  });

  if (!Array.isArray(data)) return [];

  const seen = new Set<string>();
  return data.filter((entry) => {
    const key = String(entry.serviceProviderCode ?? entry.serviceProviderName ?? "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * GET /ServiceProvider. The catalogue mapping a serviceProviderCode to its
 * segment. Exported for the booking adapter that will need it: CreateOrder
 * takes an orderType AND a serviceProviderCode, and the two must agree.
 */
export async function serviceProviders(): Promise<SpeedoPostServiceProviderData> {
  const data = await request<SpeedoPostServiceProviderData>({
    method: "GET",
    path: "/ServiceProvider",
    label: "ServiceProvider",
  });

  return data ?? {};
}

/**
 * Exported for tests and for the booking work that follows. Nothing in the rate
 * or tracking path calls it directly.
 */
export type { SpeedoPostCreateOrderResponse };

/** Test seam: forget any cached token. Not used by application code. */
export function __resetSpeedoPostTokenCache(): void {
  clearToken();
  globalForSpeedoPost.__arenaSpeedoPostTokenInFlight = null;
}
