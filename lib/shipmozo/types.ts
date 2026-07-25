/**
 * lib/shipmozo/types.ts
 *
 * Vendor-specific request/response shapes for Shipmozo's domestic order +
 * tracking APIs. These never leak past the Shipmozo lib and its adapters —
 * callers work in the app's own shapes.
 *
 * Field names mirror Shipmozo exactly, including their misspelling of
 * `refrence_id`, so nothing is lost in translation when reading their payloads.
 */

// --- Common envelope ---------------------------------------------------------

export interface ShipmozoEnvelope<T> {
  result?: number | string; // "1" = success
  message?: string;
  data?: T;
}

// --- Tracking (shared by the webhook and GET /track-order) -------------------

export interface ShipmozoScanEntry {
  date?: string; // "2025-07-14 09:12:16" (IST, no zone)
  status?: string;
  location?: string;
}

export interface ShipmozoTrackData {
  order_id?: string;
  refrence_id?: string; // our order_id echoed back (Shipmozo's spelling)
  awb_number?: string;
  carrier?: string;
  current_status?: string;
  status_time?: string;
  expected_delivery_date?: string;
  shipment_type?: string; // "Forward" | "Reverse"
  status_feed?: { scan?: ShipmozoScanEntry[] };
}

// --- push-order --------------------------------------------------------------

export interface ShipmozoProductDetail {
  name: string;
  quantity: number;
  unit_price: number;
  hsn?: string;
  sku_number?: string;
}

export interface ShipmozoPushOrderPayload {
  order_id: string;
  order_date: string; // yyyy-mm-dd
  consignee_name: string;
  consignee_phone: string;
  consignee_email?: string;
  consignee_address_line_one: string;
  consignee_address_line_two?: string;
  consignee_pin_code: string;
  consignee_city: string;
  consignee_state: string;
  product_detail: ShipmozoProductDetail[];
  payment_type: "PREPAID" | "COD";
  cod_amount?: string;
  shipping_charges?: string;
  weight: string; // grams
  length: string;
  width: string;
  height: string;
  warehouse_id: string;
  shipment_type?: "FORWARD" | "REVERSE";
}

export interface ShipmozoPushOrderData {
  Info?: string;
  order_id?: string;
  refrence_id?: string;
}

// --- assign / auto-assign ----------------------------------------------------

export interface ShipmozoAssignData {
  order_id?: string;
  refrence_id?: string;
  awb_number?: string;
  courier?: string;
  courier_company?: string;
  courier_company_service?: string;
}

// --- warehouses (pickup points) ---------------------------------------------

// In Shipmozo a warehouse IS the pickup location, so we register one per
// booking from the customer's pickup address. Shipmozo derives city/state from
// the pincode, so the payload carries no city/state.
export interface ShipmozoCreateWarehousePayload {
  address_title: string;
  name: string;
  phone: string;
  alternate_phone?: string;
  email?: string;
  address_line_one: string;
  address_line_two?: string;
  pin_code: string;
}

export interface ShipmozoCreateWarehouseData {
  warehouse_id?: number | string;
}
