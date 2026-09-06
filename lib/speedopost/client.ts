import "server-only";

import type {
  SpeedoPostCreateOrderData,
  SpeedoPostCreateOrderPayload,
  SpeedoPostCreateOrderResponse,
  SpeedoPostCreatePickupData,
  SpeedoPostCreatePickupPayload,
  SpeedoPostCreateWarehousePayload,
  SpeedoPostCreateWarehouseResponse,
  SpeedoPostEnvelope,
  SpeedoPostOrderType,
  SpeedoPostRatePayload,
  SpeedoPostRateOption,
  SpeedoPostServiceProviderData,
  SpeedoPostServiceProviderEntry,
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
    /**
     * True only when we read a complete `status: FAIL` envelope back.
     *
     * This is the difference between "SpeedoPost considered the request and
     * said no" and "we do not know what happened" (a timeout, a socket reset, a
     * 502 from something in front of them, a body we could not parse). The two
     * are indistinguishable from the message alone and the booking adapter has
     * to treat them very differently: a refusal created nothing, while an
     * unknown outcome may have created a parcel we hold no waybill for.
     */
    readonly vendorRefused = false,
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
  __arenaSpeedoPostProviders?: {
    byCode: Map<string, SpeedoPostProviderInfo>;
    expiresAt: number;
  } | null;
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

/**
 * WHY THIS HINT EXISTS.
 *
 * "Invalid username or password." has twice now meant correct credentials that
 * were CORRUPTED ON THE WAY IN rather than wrong ones. Next runs dotenv-expand
 * over .env, so a bare `$` in a secret starts a variable reference and
 * everything after it is substituted away: an 11-character password arrives as
 * 7, and SpeedoPost quite reasonably rejects it. The vendor's message is
 * indistinguishable from genuinely bad keys, which is what sends people to
 * re-check credentials that were right all along.
 *
 * We cannot know the intended password, so this does not try to detect the
 * truncation. It appends the one question worth asking first, and prints the
 * loaded LENGTH — never the secret — so the reader can compare it against what
 * they believe is in .env and see a mismatch immediately.
 *
 * The fix is always the same: escape as `\$` in .env. Quotes do not help, and
 * the backslash is NOT part of the password — Next strips it at load time.
 */
function credentialShapeHint(): string {
  return (
    ` (sent userId of ${USER_ID.length} chars and password of ${PASSWORD.length} chars.` +
    ` If that password length is shorter than the real one, a bare "$" in .env has been` +
    ` eaten by dotenv-expand. Escape it as \\$ and restart the dev server.)`
  );
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
      `SpeedoPost authentication failed: ${json.message || "no token returned"}`
        + credentialShapeHint(),
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
  const envelope = await requestEnvelope<T>(options);
  return (envelope.response ?? null) as T | null;
}

/**
 * The same call, unwrapped only as far as the envelope.
 *
 * CreateWarehouse needs this: it is the one endpoint that puts its payload
 * (`warehouseId`) at the TOP level of the envelope rather than inside
 * `response`, so unwrapping to `response` throws away the only field it
 * returns.
 */
async function requestEnvelope<T>(
  options: RequestOptions,
): Promise<SpeedoPostEnvelope<T>> {
  return withToken((token) => send<T>(options, token));
}

/**
 * Run one authenticated call, replaying it once if the token is refused.
 *
 * The token is refused on its own body rather than a 401, so the retry is
 * driven by the message and is allowed exactly once. A second failure means the
 * credentials are wrong, and replaying that forever would lock the account
 * rather than fix it.
 *
 * WHICH CALLS MAY SAFELY GO THROUGH THIS. Every one that is either read-only or
 * naturally idempotent. `CreateOrder` is neither, and a replay of it is a second
 * parcel — but the replay only ever happens on a `SpeedoPostApiError` carrying
 * `isAuthFailure`, which is a complete, parsed FAIL envelope saying the token
 * was not accepted. SpeedoPost cannot both refuse the token and create the
 * order, so no ambiguous outcome reaches this path: a timeout or a lost
 * response is not an auth failure and propagates untouched.
 */
async function withToken<R>(fn: (token: string) => Promise<R>): Promise<R> {
  try {
    return await fn(await getToken());
  } catch (err) {
    if (err instanceof SpeedoPostApiError && err.isAuthFailure) {
      clearToken();
      // Re-authenticating cannot fix bad credentials; only a rejected token.
      if (isSpeedoPostConfigured()) {
        return fn(await getToken());
      }
    }
    throw err;
  }
}

async function send<T>(
  { method, path, label, body, query }: RequestOptions,
  token: string,
): Promise<SpeedoPostEnvelope<T>> {
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
      true,
    );
  }

  return json;
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

// --- BOOKING ENDPOINTS --------------------------------------------------------
//
// Everything below this line CHANGES SOMETHING at SpeedoPost. The rate and
// tracking calls above are reads and can be replayed freely; these cannot, and
// the one that matters is CreateOrder — a replay of it is a second parcel on a
// real vehicle. See the note on `withToken` for why the token retry is still
// safe here, and lib/booking-adapters/vendors/speedopost for how an ambiguous
// outcome is handled.

/**
 * POST /CreateWarehouse. The pickup location an order will collect from.
 *
 * Returns the NAME rather than the id, and that is not a mistake. SpeedoPost
 * hands back a `warehouseId`, but `CreateOrder` and `CreatePickupRequest` both
 * address a warehouse by `warehouseName`, so the name is the real key and the id
 * is the one thing nothing can be done with. The name we sent is echoed back so
 * the caller stores what it will actually use.
 */
export async function createWarehouse(
  payload: SpeedoPostCreateWarehousePayload,
): Promise<{ warehouseName: string; warehouseId: string | null }> {
  const envelope = await requestEnvelope<unknown>({
    method: "POST",
    path: "/CreateWarehouse",
    label: "CreateWarehouse",
    body: payload,
  });

  // `warehouseId` sits at the top level of the envelope on this endpoint alone.
  const warehouseId = (envelope as SpeedoPostCreateWarehouseResponse).warehouseId;

  return {
    warehouseName: payload.warehouseName,
    warehouseId: warehouseId != null ? String(warehouseId).trim() || null : null,
  };
}

/**
 * POST /CreateOrder. Creates the shipment AND assigns the courier in one call.
 *
 * There is no separate assign step in this API: `serviceProviderCode` goes in
 * and the waybill comes back. Omitting that field is not a validation error —
 * their documentation says the system then "assigns a random one" — so the
 * payload type makes it required and the adapter refuses to build a payload
 * without it.
 *
 * The SUCCESS shape is UNCONFIRMED (their docs carry no example), which is why
 * this returns whatever object came back rather than a narrowed one. Reading a
 * waybill out of it is the adapter's job, and it logs the full body the first
 * time so the type can be tightened from evidence instead of hope.
 */
export async function createOrder(
  payload: SpeedoPostCreateOrderPayload,
): Promise<SpeedoPostCreateOrderData | null> {
  return request<SpeedoPostCreateOrderData>({
    method: "POST",
    path: "/CreateOrder",
    label: "CreateOrder",
    body: payload,
  });
}

/**
 * POST /CreatePickupRequest. Asks the carrier to come and collect.
 *
 * Separate from the order, per carrier, per warehouse. Their date validation
 * runs against IST and rejects the past, so the caller builds the date and time
 * in IST — see speedoPostPickupSlot.
 */
export async function createPickupRequest(
  payload: SpeedoPostCreatePickupPayload,
): Promise<SpeedoPostCreatePickupData | null> {
  return request<SpeedoPostCreatePickupData>({
    method: "POST",
    path: "/CreatePickupRequest",
    label: "CreatePickupRequest",
    body: payload,
  });
}

/**
 * GET /CancelOrder?awb=. Cancels the shipment.
 *
 * A GET that mutates. It is exported for ops tooling and the booking adapter
 * and must never be put behind anything a browser can follow on its own: a
 * prefetch, a link preview or a crawler would cancel a live consignment.
 */
export async function cancelOrderByAwb(awb: string): Promise<void> {
  await request<unknown>({
    method: "GET",
    path: "/CancelOrder",
    label: "CancelOrder",
    query: { awb },
  });
}

/**
 * GET /PrintLabel?awb=. The carrier's own waybill.
 *
 * Read RAW rather than through the JSON path, because what comes back is not
 * documented at all: their only captured example is a failure. It could be a
 * PDF body, a JSON envelope carrying a URL, or one carrying base64. All three
 * are returned here untouched and the adapter decides, so this function never
 * has to guess.
 */
export async function printLabel(
  awb: string,
): Promise<{ bytes: Uint8Array; contentType: string; text: string }> {
  return withToken(async (token) => {
    const url = new URL(`${BASE_URL}${API_PREFIX}/PrintLabel`);
    url.searchParams.set("awb", awb);

    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, accept: "*/*" },
      cache: "no-store",
    });

    const buffer = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "";

    if (!res.ok) {
      throw new SpeedoPostApiError(
        `SpeedoPost PrintLabel returned ${res.status} ${res.statusText}`,
        res.status,
        res.status === 401 || res.status === 403,
      );
    }

    // A refusal arrives as HTTP 200 with a FAIL envelope, same as everywhere
    // else, so the JSON has to be inspected even on a "successful" response.
    const text = new TextDecoder().decode(buffer);
    if (contentType.includes("json") || text.trimStart().startsWith("{")) {
      let json: SpeedoPostEnvelope<unknown> | null = null;
      try {
        json = JSON.parse(text) as SpeedoPostEnvelope<unknown>;
      } catch {
        json = null;
      }
      if (json && !isSuccess(json)) {
        throw new SpeedoPostApiError(
          `SpeedoPost PrintLabel error: ${json.message || "Unknown error"}`,
          res.status,
          looksLikeInvalidToken(json),
          true,
        );
      }
    }

    return { bytes: buffer, contentType, text };
  });
}

// --- PROVIDER SEGMENTS --------------------------------------------------------

/**
 * Which segment a provider code belongs to, and what SpeedoPost calls it.
 *
 * `CreateOrder` takes BOTH an `orderType` and a `serviceProviderCode` and the
 * two have to agree, but a shipment only stores the code. This is the lookup
 * that recovers the rest, and it is why the segment is not persisted anywhere:
 * SpeedoPost already publishes the mapping and the codes do not overlap between
 * the two lists.
 *
 * Cached because it changes on the timescale of SpeedoPost signing a new
 * carrier, and a booking should not spend a round trip re-reading a catalogue
 * that was correct a minute ago. An hour is short enough that a newly added
 * provider becomes bookable the same day without a deploy.
 */
const PROVIDER_CATALOGUE_TTL_MS = 60 * 60_000;

export interface SpeedoPostProviderInfo {
  code: string;
  name: string;
  orderType: SpeedoPostOrderType;
}

export async function speedoPostProviderCatalogue(): Promise<
  Map<string, SpeedoPostProviderInfo>
> {
  const cached = globalForSpeedoPost.__arenaSpeedoPostProviders;
  if (cached && cached.expiresAt > Date.now()) return cached.byCode;

  const data = await serviceProviders();
  const byCode = new Map<string, SpeedoPostProviderInfo>();

  const load = (
    entries: SpeedoPostServiceProviderEntry[] | null | undefined,
    orderType: SpeedoPostOrderType,
  ) => {
    for (const entry of entries ?? []) {
      const code = String(entry.serviceProviderCode ?? "").trim();
      if (!code) continue;
      // First writer wins. Their documentation says the two lists do not
      // overlap; if that ever stops being true, a code claimed by both is far
      // likelier to be the parcel network, and quietly reclassifying a B2C
      // booking as freight is the more expensive way to be wrong.
      if (byCode.has(code)) continue;
      byCode.set(code, {
        code,
        name: String(entry.serviceProviderName ?? "").trim(),
        orderType,
      });
    }
  };

  load(data.b2cServiceProvider, "B2C");
  load(data.b2bServiceProvider, "B2B");

  globalForSpeedoPost.__arenaSpeedoPostProviders = {
    byCode,
    expiresAt: Date.now() + PROVIDER_CATALOGUE_TTL_MS,
  };

  return byCode;
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
  globalForSpeedoPost.__arenaSpeedoPostProviders = null;
}
