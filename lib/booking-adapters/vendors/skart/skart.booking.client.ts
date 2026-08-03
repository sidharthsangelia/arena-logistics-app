/**
 * SKART BOOKING CLIENT
 * -----------------------------------------------------------------------------
 * Thin, typed client over sKart's booking endpoints. The only file that knows
 * sKart's HTTP contract; everything above it works in canonical shapes.
 *
 * Credentials go in the BODY, not a header — sKart authenticates every call with
 * `user_name` and `password` inline. That is their design, and it means the
 * request bodies logged on failure must never be logged whole.
 *
 * RATE LIMIT: their responses carry `ratelimit-policy: 10;w=60`, i.e. ten
 * requests a minute. The booking function throttles below that (see
 * lib/inngest/functions/bookInternationalCarrier.ts); this client surfaces a 429
 * as retriable so the durable retry can absorb a burst that slips through.
 */

import "server-only";

import type {
  SkartBookingRequest,
  SkartBookingResponse,
  SkartBookingResult,
  SkartCountryEntry,
  SkartCourierEntry,
} from "./skart.booking.types";

const BASE_URL =
  process.env.SKART_BOOKING_API_URL ??
  "https://apiv2.skart-express.com/api/v1/booking";

const USERNAME = process.env.SKART_USERNAME ?? "";
const PASSWORD = process.env.SKART_PASSWORD ?? "";

export class SkartApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SkartApiError";
  }
}

export function isSkartConfigured(): boolean {
  return Boolean(USERNAME && PASSWORD);
}

export function skartCredentials(): { user_name: string; password: string } {
  return { user_name: USERNAME, password: PASSWORD };
}

// ---------------------------------------------------------------------------

/**
 * Place a booking. Returns the single result sKart wraps in an array.
 *
 * The array is the part worth stating plainly: `data` holds ONE booking inside a
 * list, and reading it as an object gives `undefined` for every field while the
 * call looks like it succeeded.
 */
export async function createBooking(
  payload: SkartBookingRequest,
): Promise<SkartBookingResult> {
  const res = await fetch(`${BASE_URL}/booking-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "*/*" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const raw = await res.text();

  if (!res.ok) {
    throw new SkartApiError(
      `sKart booking-api returned ${res.status} ${res.statusText}: ${raw.slice(0, 500)}`,
      res.status,
    );
  }

  let json: SkartBookingResponse;
  try {
    json = JSON.parse(raw) as SkartBookingResponse;
  } catch {
    throw new SkartApiError(
      `sKart booking-api: unparseable response: ${raw.slice(0, 500)}`,
    );
  }

  // A 200 is not proof of success. sKart answers a rejected booking with an
  // HTTP 200 and a non-200 statusCode in the body, exactly as the rate
  // calculator does (see lib/rate-adapters/vendors/skart/skart.adapter.ts).
  if (json.statusCode != null && json.statusCode !== 200) {
    throw new SkartApiError(
      `sKart booking-api error: ${json.message || "Unknown error"}`,
      json.statusCode,
    );
  }

  const result = Array.isArray(json.data) ? json.data[0] : json.data;

  if (!result) {
    throw new SkartApiError(
      `sKart booking-api returned no booking: ${json.message || raw.slice(0, 300)}`,
    );
  }

  return result;
}

/**
 * sKart's courier catalogue — every product they sell, with the numeric id the
 * booking API takes and the `parent_vendor` that decides the payload variant.
 *
 * The `courier_id` path segment is optional and the bare path lists all 94
 * products, verified against the live endpoint.
 *
 * A failure here resolves to an empty list rather than throwing: the caller
 * falls back to the curated ids, and a booking must never fail because a
 * convenience lookup did.
 */
export async function listCouriers(): Promise<SkartCourierEntry[]> {
  const query = new URLSearchParams({
    user_name: USERNAME,
    password: PASSWORD,
  });

  try {
    const res = await fetch(`${BASE_URL}/courier?${query.toString()}`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) return [];

    const json = (await res.json()) as {
      data?: SkartCourierEntry[] | SkartCourierEntry;
    };

    if (Array.isArray(json.data)) return json.data;
    return json.data ? [json.data] : [];
  } catch {
    return [];
  }
}

/**
 * sKart's country ids, for `destination_country_id`.
 *
 * Unlike listCouriers this DOES throw, because a destination we cannot resolve
 * is a booking we must not place: the id is required and there is no safe
 * default. The bare path returns all 249 countries.
 */
export async function listCountries(): Promise<SkartCountryEntry[]> {
  const query = new URLSearchParams({
    user_name: USERNAME,
    password: PASSWORD,
  });

  const res = await fetch(`${BASE_URL}/country?${query.toString()}`, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new SkartApiError(
      `sKart country lookup returned ${res.status} ${res.statusText}`,
      res.status,
    );
  }

  const json = (await res.json()) as { data?: unknown };
  return Array.isArray(json.data) ? (json.data as SkartCountryEntry[]) : [];
}

/** Download one of the PDFs sKart returns by URL. */
export async function fetchDocument(
  url: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new SkartApiError(
      `sKart document URL returned ${res.status} ${res.statusText}`,
      res.status,
    );
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0) {
    throw new SkartApiError(`sKart returned an empty document at ${url}`);
  }

  return {
    bytes,
    mimeType: res.headers.get("content-type") ?? "application/pdf",
  };
}
