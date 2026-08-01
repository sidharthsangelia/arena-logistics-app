import "server-only";

import type {
  ShipmozoAssignData,
  ShipmozoCreateWarehouseData,
  ShipmozoCreateWarehousePayload,
  ShipmozoEnvelope,
  ShipmozoOrderDetailData,
  ShipmozoPushOrderData,
  ShipmozoPushOrderPayload,
  ShipmozoTrackData,
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
 * Look an order up by Shipmozo's handle — which, for orders we pushed, is also
 * our own reference, because push-order carries `order_id: shipment.id`.
 *
 * Used to answer "did the push actually land?" after a lost response, so this
 * resolves to null on any failure rather than throwing: a diagnostic that can
 * fail the thing it is diagnosing is worse than no diagnostic.
 */
export async function getOrderDetail(
  orderId: string,
): Promise<ShipmozoOrderDetailData | null> {
  try {
    return await get<ShipmozoOrderDetailData>(
      `/get-order-detail/${encodeURIComponent(orderId)}`,
      "get-order-detail",
    );
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
