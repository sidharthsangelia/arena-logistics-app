import "server-only";

import type {
  ShipmozoAssignData,
  ShipmozoCountryEntry,
  ShipmozoCreateShipperData,
  ShipmozoCreateShipperPayload,
  ShipmozoCreateWarehouseData,
  ShipmozoCreateWarehousePayload,
  ShipmozoEnvelope,
  ShipmozoIntlPushOrderData,
  ShipmozoIntlPushOrderPayload,
  ShipmozoIntlRateProduct,
  ShipmozoIntlRateRequest,
  ShipmozoOrderDetailData,
  ShipmozoPushOrderData,
  ShipmozoPushOrderPayload,
  ShipmozoTrackData,
  ShipmozoWarehouseEntry,
} from "./types";
import { withPushOrderDefaults } from "./pushOrderDefaults";

/**
 * lib/shipmozo/client.ts
 *
 * Thin, typed client over Shipmozo's domestic order + tracking endpoints. Same
 * base URL and public/private-key auth the rate adapter already uses. Every
 * call returns the parsed `data` on success and throws a ShipmozoApiError with
 * Shipmozo's own message on failure, so callers get one predictable failure
 * mode to catch.
 */

const BASE_URL =
  process.env.SHIPMOZO_API_URL ?? "https://shipping-api.com/app/api/v1";
const PUBLIC_KEY = process.env.SHIPMOZO_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.SHIPMOZO_PRIVATE_KEY ?? "";

export class ShipmozoApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ShipmozoApiError";
  }
}

export function isShipmozoConfigured(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    accept: "application/json",
    "public-key": PUBLIC_KEY,
    "private-key": PRIVATE_KEY,
  };
}

async function parseEnvelope<T>(res: Response, label: string): Promise<T> {
  const raw = await res.text();

  if (!res.ok) {
    throw new ShipmozoApiError(
      `Shipmozo ${label} returned ${res.status} ${res.statusText}: ${raw.slice(0, 500)}`,
      res.status,
    );
  }

  let json: ShipmozoEnvelope<T>;
  try {
    json = JSON.parse(raw) as ShipmozoEnvelope<T>;
  } catch {
    throw new ShipmozoApiError(`Shipmozo ${label}: unparseable response: ${raw.slice(0, 500)}`);
  }

  if (String(json.result) !== "1") {
    // Shipmozo rejects a request with HTTP 200, result 0, and a `message` that
    // is frequently the literal string "Error". Whatever detail exists is in
    // `data`, so it goes into the thrown message too.
    //
    // This is not defensive padding. A refused push-order previously surfaced
    // as "Shipmozo push-order error: Error" and nothing else, which meant
    // working out WHICH field it disliked by rebuilding the payload by hand
    // from the database. The detail belongs where the failure is reported.
    throw new ShipmozoApiError(
      `Shipmozo ${label} error: ${json.message || "Unknown error"}${detailOf(json.data)}`,
    );
  }

  return (json.data ?? ({} as T)) as T;
}

/** Shipmozo's own explanation, when it sent one. Empty string when it did not. */
function detailOf(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data.trim() ? ` ${data.trim().slice(0, 400)}` : "";
  if (typeof data === "object" && Object.keys(data).length === 0) return "";
  try {
    return ` ${JSON.stringify(data).slice(0, 400)}`;
  } catch {
    return "";
  }
}

async function post<T>(path: string, body: unknown, label: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return parseEnvelope<T>(res, label);
}

async function get<T>(path: string, label: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: authHeaders(),
    cache: "no-store",
  });
  return parseEnvelope<T>(res, label);
}

// --- Orders ------------------------------------------------------------------

export function pushOrder(
  payload: ShipmozoPushOrderPayload,
): Promise<ShipmozoPushOrderData> {
  // Every documented key is filled in before this goes out. Shipmozo reads
  // fields without checking they exist, so an omitted optional is not "no
  // value", it is a refused order. See lib/shipmozo/pushOrderDefaults.ts.
  return post<ShipmozoPushOrderData>(
    "/push-order",
    withPushOrderDefaults(payload),
    "push-order",
  );
}

/** Assign a specific courier by Shipmozo courier id. Returns the AWB. */
export function assignCourier(
  orderId: string,
  courierId: string,
): Promise<ShipmozoAssignData> {
  return post<ShipmozoAssignData>(
    "/assign-courier",
    { order_id: orderId, courier_id: courierId },
    "assign-courier",
  );
}

/** Let Shipmozo pick the courier. Returns the AWB. */
export function autoAssignOrder(orderId: string): Promise<ShipmozoAssignData> {
  return post<ShipmozoAssignData>(
    "/auto-assign-order",
    { order_id: orderId },
    "auto-assign-order",
  );
}

export function schedulePickup(orderId: string): Promise<unknown> {
  return post<unknown>("/schedule-pickup", { order_id: orderId }, "schedule-pickup");
}

export function cancelOrder(orderId: string): Promise<unknown> {
  return post<unknown>("/cancel-order", { order_id: orderId }, "cancel-order");
}

/**
 * Look an order up by SHIPMOZO'S OWN HANDLE — the `order_id` their push-order
 * response returns, e.g. "56629AP704165902151".
 *
 * ── NOT OUR REFERENCE ───────────────────────────────────────────────────────
 * This used to be called with our own shipment id, on the belief that the
 * `order_id` we send in push-order is also the handle Shipmozo files it under.
 * It is not. They mint their own and echo ours back as `refrence_id`, and
 * asking for one of ours answers `result: 0, "Order id is not valid"`. The
 * lookup therefore never succeeded, and because it swallows its own errors the
 * failure was invisible.
 *
 * There is no documented way to search by `refrence_id`, so this can only
 * answer once we already hold their id — which is exactly when we least need
 * it. See the note on duplicate protection in the international adapter.
 *
 * Resolves to null on any failure rather than throwing: a diagnostic that can
 * fail the thing it is diagnosing is worse than no diagnostic.
 */
export async function getOrderDetail(
  orderId: string,
): Promise<ShipmozoOrderDetailData | null> {
  try {
    const data = await get<ShipmozoOrderDetailData | ShipmozoOrderDetailData[]>(
      `/get-order-detail/${encodeURIComponent(orderId)}`,
      "get-order-detail",
    );
    // Like get-order-label and track-order, a single record arrives wrapped in
    // a list. Read as an object it yields undefined for every field while the
    // call reports success.
    const detail = Array.isArray(data) ? data[0] : data;
    return detail ?? null;
  } catch {
    return null;
  }
}

// --- Labels ------------------------------------------------------------------

/**
 * Fetch the printable label for an AWB.
 *
 * Shipmozo documents this endpoint only as "Successful operation", with no
 * response schema, and `type_of_label=PDF` reads like a switch between a PDF
 * and something else. So this handles all three shapes it can plausibly answer
 * with — raw PDF bytes, an envelope carrying a URL, an envelope carrying base64
 * — instead of guessing one and breaking in production on a Sunday.
 */
export async function getOrderLabel(
  awb: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const res = await fetch(
    `${BASE_URL}/get-order-label/${encodeURIComponent(awb)}?type_of_label=PDF`,
    { method: "GET", headers: authHeaders(), cache: "no-store" },
  );

  if (!res.ok) {
    throw new ShipmozoApiError(
      `Shipmozo get-order-label returned ${res.status} ${res.statusText}`,
      res.status,
    );
  }

  const contentType = res.headers.get("content-type") ?? "";

  // 1. The document itself.
  if (contentType.includes("pdf") || contentType.includes("octet-stream")) {
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      mimeType: "application/pdf",
    };
  }

  const raw = await res.text();

  let payload: ShipmozoEnvelope<unknown>;
  try {
    payload = JSON.parse(raw) as ShipmozoEnvelope<unknown>;
  } catch {
    throw new ShipmozoApiError(
      `Shipmozo get-order-label: unparseable response: ${raw.slice(0, 300)}`,
    );
  }

  if (String(payload.result) !== "1") {
    throw new ShipmozoApiError(
      `Shipmozo get-order-label error: ${payload.message || "Unknown error"}`,
    );
  }

  const candidate = extractLabelString(payload.data);
  if (!candidate) {
    throw new ShipmozoApiError(
      `Shipmozo get-order-label returned no label for AWB ${awb}.`,
    );
  }

  // 2. A link to the document.
  if (/^https?:\/\//i.test(candidate)) {
    const fileRes = await fetch(candidate, { cache: "no-store" });
    if (!fileRes.ok) {
      throw new ShipmozoApiError(
        `Shipmozo label URL returned ${fileRes.status} ${fileRes.statusText}`,
        fileRes.status,
      );
    }
    return {
      bytes: new Uint8Array(await fileRes.arrayBuffer()),
      mimeType: fileRes.headers.get("content-type") ?? "application/pdf",
    };
  }

  // 3. The document, inlined. Without type_of_label=PDF they answer with a
  //    "data:image/png;base64,..." URI, so the declared type is used rather
  //    than assumed: storing a PNG under application/pdf gives the customer a
  //    download their reader refuses to open.
  const dataUri = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(candidate);
  const base64 = dataUri ? dataUri[2] : candidate;
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  if (bytes.length === 0) {
    throw new ShipmozoApiError(
      `Shipmozo get-order-label returned an empty label for AWB ${awb}.`,
    );
  }
  return { bytes, mimeType: dataUri ? dataUri[1] : "application/pdf" };
}

/**
 * Pull the label out of whichever shape Shipmozo used.
 *
 * What it actually sends is an ARRAY, one entry per available format:
 *
 *     "data": [{ "type": "PDF", "label": "https://...s3.../Label_x.pdf?..." }]
 *
 * with a base64 PNG data URI in place of the URL when the PDF was not asked
 * for. The array is the part that matters: an earlier version of this function
 * handled a bare string and an object but not a list, so a perfectly good
 * label came back as "returned no label".
 */
function extractLabelString(data: unknown): string | null {
  if (Array.isArray(data)) {
    const entries = data.filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object",
    );
    // Prefer the PDF when they offer a choice: it is the printable one.
    const preferred =
      entries.find((entry) => String(entry.type).toUpperCase() === "PDF") ??
      entries[0];
    return preferred ? extractLabelString(preferred) : null;
  }

  if (typeof data === "string") return data.trim() || null;
  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  for (const key of ["label", "label_url", "awb_label", "url", "pdf", "file"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

// --- Tracking ----------------------------------------------------------------

/**
 * GET /track-order?awb_number=… — the pull counterpart of the tracking webhook,
 * and the same body shape.
 *
 * Shipmozo answers an AWB it does not recognise with `result: 1` and an empty
 * body, so a resolved promise here is NOT proof the shipment exists. The
 * tracking adapter is what decides that; this only unwraps.
 */
export async function trackOrder(awb: string): Promise<ShipmozoTrackData> {
  const data = await get<ShipmozoTrackData | ShipmozoTrackData[]>(
    `/track-order?awb_number=${encodeURIComponent(awb)}`,
    "track-order",
  );
  // Like get-order-label, they sometimes wrap a single record in a list.
  return Array.isArray(data) ? (data[0] ?? ({} as ShipmozoTrackData)) : data;
}

// --- Warehouses (pickup points) ---------------------------------------------

/** Register a pickup point. Returns the new warehouse id. */
export function createWarehouse(
  payload: ShipmozoCreateWarehousePayload,
): Promise<ShipmozoCreateWarehouseData> {
  return post<ShipmozoCreateWarehouseData>(
    "/create-warehouse",
    payload,
    "create-warehouse",
  );
}

/**
 * Every pickup point on the account, newest first.
 *
 * Paged at 25. Only the first page is read, and deliberately: this exists to
 * answer "have we already registered a warehouse for THIS booking?", the
 * booking is minutes old, and walking hundreds of pages of historic addresses to
 * find out would cost more than the duplicate it prevents.
 *
 * Swallows its own failures. A warehouse we could not look up is one we create
 * instead, which is the behaviour this replaces — never a booking that fails.
 */
export async function getWarehouses(): Promise<ShipmozoWarehouseEntry[]> {
  try {
    const data = await get<ShipmozoWarehouseEntry[]>(
      "/get-warehouses",
      "get-warehouses",
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// --- International -----------------------------------------------------------

/**
 * Register the exporter of record. Returns the new shipper id.
 *
 * International push-order takes a `shipper_id` that domestic has no equivalent
 * of. A warehouse is where the parcel is COLLECTED; a shipper is who is SENDING
 * it, and on a BA org's booking those are routinely different parties.
 */
export function createShipper(
  payload: ShipmozoCreateShipperPayload,
): Promise<ShipmozoCreateShipperData> {
  return post<ShipmozoCreateShipperData>(
    "/create-shipper",
    payload,
    "create-shipper",
  );
}

/**
 * Push an export order. Returns Shipmozo's handle for it.
 *
 * NOT routed through withPushOrderDefaults: that helper fills in the DOMESTIC
 * payload's optional keys, and this endpoint takes a different set. The mapper
 * populates every documented international key itself, for the same reason —
 * Shipmozo reads fields without checking they exist, so an omitted optional is
 * not "no value", it is a refused order.
 */
export function internationalPushOrder(
  payload: ShipmozoIntlPushOrderPayload,
): Promise<ShipmozoIntlPushOrderData> {
  return post<ShipmozoIntlPushOrderData>(
    "/international-push-order",
    payload,
    "international-push-order",
  );
}

/**
 * The services Shipmozo will actually carry this consignment on.
 *
 * Step 4 of their documented international flow, which sits BETWEEN the push and
 * the assign. Called from the booking path to answer one question: is the
 * courier the customer bought still offered for the consignment as it was
 * pushed? It is never used to re-price — the customer's price was fixed at
 * selection, and a booking that quietly re-quotes is a booking that can cost
 * more than what was shown.
 */
export function internationalRateCalculator(
  payload: ShipmozoIntlRateRequest,
): Promise<ShipmozoIntlRateProduct[]> {
  return post<ShipmozoIntlRateProduct[]>(
    "/international-rate-calculator",
    payload,
    "international-rate-calculator",
  ).then((data) => (Array.isArray(data) ? data : []));
}

/**
 * Shipmozo's country list, for the numeric `consignee_country_id` that
 * international push-order takes instead of an ISO code.
 *
 * Cached for the process lifetime: it is a static reference list, and fetching
 * it inside a booking step would put an avoidable network call between a paid
 * customer and their waybill. The rate adapter keeps its own cache of the same
 * endpoint; they are deliberately not shared, because a booking must not fail
 * because a rate lookup poisoned a cache.
 */
let countriesCache: ShipmozoCountryEntry[] | null = null;

export async function getCountries(): Promise<ShipmozoCountryEntry[]> {
  if (countriesCache) return countriesCache;
  const data = await get<ShipmozoCountryEntry[]>("/countries", "countries");
  countriesCache = Array.isArray(data) ? data : [];
  return countriesCache;
}

/**
 * ISO alpha-2 (or a full country name) → Shipmozo's numeric country id.
 *
 * Returns null rather than throwing when nothing matches, so the caller decides
 * what an unknown destination means. For a booking it is fatal and permanent —
 * the country will not appear in their list on a retry.
 */
export async function resolveCountryId(
  countryCode: string,
  countryName?: string,
): Promise<string | null> {
  const countries = await getCountries();
  const code = countryCode.trim().toUpperCase();
  const name = countryName?.trim().toUpperCase();

  const match = countries.find((c) => {
    const iso2 = c.iso2?.trim().toUpperCase();
    const iso3 = c.iso3?.trim().toUpperCase();
    const short = c.code?.trim().toUpperCase();
    const full = c.name?.trim().toUpperCase();
    return (
      (code && (iso2 === code || iso3 === code || short === code)) ||
      (name != null && full === name)
    );
  });

  const id = match?.id;
  return id == null ? null : String(id).trim() || null;
}
