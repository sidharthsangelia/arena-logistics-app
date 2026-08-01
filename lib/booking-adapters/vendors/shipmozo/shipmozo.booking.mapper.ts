/**
 * SHIPMOZO BOOKING MAPPER
 * -----------------------------------------------------------------------------
 * Canonical booking request → Shipmozo payloads. Pure functions, no fetch, no
 * `server-only`: everything that decides what we declare to a courier is here,
 * where it can be unit tested (utils/shipmozoBookingPayload.test.ts) rather than
 * discovered from a parcel that got weighed at the hub.
 *
 * Three conversions carry all the risk, so they are stated once, here:
 *
 *   • Weight goes to Shipmozo in GRAMS. Canonical is kilograms. Everything is
 *     rounded UP, never down: under-declaring is what gets a shipment held and
 *     surcharged at the hub.
 *   • push-order takes ONE length/width/height for the whole order even when the
 *     shipment is several boxes, so we send the largest of each dimension. It
 *     over-declares a mixed-size consignment on purpose, for the same reason.
 *   • Money is rupees on both sides, so it passes through untouched.
 */

import type {
  ShipmozoCreateWarehousePayload,
  ShipmozoProductDetail,
  ShipmozoPushOrderPayload,
} from "@/lib/shipmozo/types";
import type { CanonicalBookingRequest } from "../../core/types";

/** Shipmozo derives city and state from the pincode, so neither is sent. */
export function buildWarehousePayload(
  request: CanonicalBookingRequest,
): ShipmozoCreateWarehousePayload {
  const { pickup } = request;

  return {
    // Shipmozo shows this in their panel; the shipment number makes an order
    // there traceable back to a booking here without opening either.
    address_title: `Pickup ${request.displayReference}`,
    name: pickup.contactName.trim() || pickup.companyName?.trim() || "Consignor",
    phone: pickup.phone.trim(),
    email: pickup.email?.trim() || undefined,
    address_line_one: pickup.line1.trim(),
    address_line_two: pickup.line2?.trim() || undefined,
    pin_code: pickup.postalCode.trim(),
  };
}

export function buildPushOrderPayload(
  request: CanonicalBookingRequest,
  warehouseId: string,
): ShipmozoPushOrderPayload {
  const { delivery } = request;
  const dims = largestDimensions(request);

  return {
    // Our own id, echoed back as `refrence_id` on every tracking webhook.
    order_id: request.reference,
    order_date: request.orderDate,

    consignee_name: delivery.contactName.trim() || "Consignee",
    consignee_phone: delivery.phone.trim(),
    consignee_email: delivery.email?.trim() || undefined,
    consignee_address_line_one: delivery.line1.trim(),
    consignee_address_line_two: delivery.line2?.trim() || undefined,
    consignee_pin_code: delivery.postalCode.trim(),
    consignee_city: delivery.city.trim(),
    consignee_state: delivery.state.trim(),

    product_detail: buildProductDetail(request),

    payment_type: request.payment.type,
    cod_amount:
      request.payment.type === "COD"
        ? String(Math.max(0, Math.round(request.payment.codAmount ?? request.declaredValue)))
        : undefined,
    shipping_charges:
      request.freightCharge != null && request.freightCharge > 0
        ? String(round2(request.freightCharge))
        : undefined,

    weight: String(toGrams(request.totalActualWeightKg)),
    length: String(dims.length),
    width: String(dims.width),
    height: String(dims.height),

    warehouse_id: warehouseId,
    shipment_type: "FORWARD",
  };
}

/**
 * Every line the boxes contain. Shipmozo rejects an order with no products, and
 * a booking whose contents were left blank is still a booking the customer has
 * paid for, so an empty list becomes one generic line rather than an error.
 */
function buildProductDetail(
  request: CanonicalBookingRequest,
): ShipmozoProductDetail[] {
  const details = request.items
    .filter((item) => item.name.trim().length > 0)
    .map((item) => ({
      name: item.name.trim(),
      quantity: Math.max(1, Math.trunc(item.quantity) || 1),
      unit_price: round2(Math.max(0, item.unitValue)),
      hsn: item.hsCode?.trim() || undefined,
    }));

  if (details.length > 0) return details;

  return [
    {
      name: "General Cargo",
      quantity: 1,
      unit_price: round2(Math.max(0, request.declaredValue)),
    },
  ];
}

function largestDimensions(request: CanonicalBookingRequest): {
  length: number;
  width: number;
  height: number;
} {
  return request.parcels.reduce(
    (acc, parcel) => ({
      length: Math.max(acc.length, ceilPositive(parcel.lengthCm)),
      width: Math.max(acc.width, ceilPositive(parcel.widthCm)),
      height: Math.max(acc.height, ceilPositive(parcel.heightCm)),
    }),
    { length: 1, width: 1, height: 1 },
  );
}

/** Kilograms → grams, rounded up, never zero. */
export function toGrams(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 1;
  return Math.max(1, Math.ceil(weightKg * 1000));
}

function ceilPositive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.ceil(value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
