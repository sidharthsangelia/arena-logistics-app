import "server-only";

import type {
  ShipmozoAssignData,
  ShipmozoCreateWarehouseData,
  ShipmozoCreateWarehousePayload,
  ShipmozoEnvelope,
  ShipmozoPushOrderData,
  ShipmozoPushOrderPayload,
  ShipmozoTrackData,
} from "./types";

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
    throw new ShipmozoApiError(
      `Shipmozo ${label} error: ${json.message || "Unknown error"}`,
    );
  }

  return (json.data ?? ({} as T)) as T;
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
  return post<ShipmozoPushOrderData>("/push-order", payload, "push-order");
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

// --- Tracking ----------------------------------------------------------------

export function trackOrder(awb: string): Promise<ShipmozoTrackData> {
  return get<ShipmozoTrackData>(
    `/track-order?awb_number=${encodeURIComponent(awb)}`,
    "track-order",
  );
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
