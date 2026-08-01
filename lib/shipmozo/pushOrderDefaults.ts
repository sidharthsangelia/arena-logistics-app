/**
 * SHIPMOZO WANTS EVERY KEY, EVEN THE EMPTY ONES
 * -----------------------------------------------------------------------------
 * Shipmozo's API reads fields out of the posted body without checking they are
 * there. Omitting an optional field does not mean "no value", it means their
 * PHP raises "Undefined array key" and the whole order is refused:
 *
 *     Shipmozo push-order error: Error {"error":"Undefined array key \"discount\""}
 *
 * `discount` was simply the first key their code happened to touch. Fixing them
 * one at a time as each surfaced would cost a failed booking per field, so
 * every documented key is filled here instead, with the empty defaults their
 * own example sends.
 *
 * This runs inside the client, not in a caller, so it covers the domestic
 * booking adapter, the international first-mile push, and anything written
 * later. A caller cannot forget it.
 *
 * No `server-only`: it is pure, and it is tested in
 * utils/domesticCourierBooking.test.ts.
 */

import type {
  ShipmozoProductDetail,
  ShipmozoPushOrderPayload,
} from "./types";

/**
 * Shipmozo's own product example, minus the values. `discount` is a number in
 * their schema and an empty string in their example; the example is what their
 * API is actually tested against, so that is what we match.
 */
const PRODUCT_DEFAULTS = {
  name: "",
  sku_number: "",
  quantity: 1,
  discount: "",
  hsn: "",
  unit_price: 0,
  product_category: "Other",
} as const;

/** Top-level keys that must exist on the body even when we have no value. */
const ORDER_DEFAULTS = {
  consignee_alternate_phone: "",
  consignee_email: "",
  consignee_address_line_two: "",
  cod_amount: "",
  shipping_charges: "",
  gst_ewaybill_number: "",
  gstin_number: "",
} as const;

/** Replace undefined with the documented empty value, never with null. */
function fill<T extends object>(defaults: T, value: Partial<T>): T {
  const out = { ...defaults };
  for (const key of Object.keys(value) as (keyof T)[]) {
    if (value[key] !== undefined) out[key] = value[key] as T[keyof T];
  }
  return out;
}

export function withPushOrderDefaults(
  payload: ShipmozoPushOrderPayload,
): ShipmozoPushOrderPayload {
  const products: ShipmozoProductDetail[] = (payload.product_detail ?? []).map(
    (product) => fill(PRODUCT_DEFAULTS as unknown as ShipmozoProductDetail, product),
  );

  return {
    ...ORDER_DEFAULTS,
    ...stripUndefined(payload),
    product_detail: products,
  };
}

/**
 * Drop keys whose value is undefined so they do not overwrite a default.
 * Spreading `{ a: undefined }` over `{ a: "" }` yields undefined, which is the
 * exact shape this module exists to prevent.
 */
function stripUndefined<T extends object>(value: T): T {
  // Typed as T rather than Partial<T>: only OPTIONAL keys can be dropped, and
  // for those "absent" and "present but undefined" mean the same thing to a
  // caller. Partial<T> would make every required field optional at the call
  // site for no gain.
  const out = {} as T;
  for (const key of Object.keys(value) as (keyof T)[]) {
    if (value[key] !== undefined) out[key] = value[key];
  }
  return out;
}
