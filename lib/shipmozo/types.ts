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
  // GET /track-order labels the same three fields differently from the webhook,
  // and not consistently between couriers. Read through readScanEntry() in the
  // tracking adapter rather than off these keys directly.
  status_date?: string;
  scan_date?: string;
  status_name?: string;
  remark?: string;
  scan_location?: string;
  city?: string;
}

/**
 * The tracking body. Shared by the webhook and GET /track-order — but NOT
 * identical between them, which is the trap:
 *
 *   webhook          status_feed: { scan: [...] }
 *   GET /track-order scan_detail: [...]        plus order_status, rto_awb_number
 *
 * Both are declared here and both are read, because an adapter that knows only
 * the webhook's shape returns an empty timeline for every live lookup while
 * reporting success.
 */
export interface ShipmozoTrackData {
  order_id?: string;
  refrence_id?: string; // our order_id echoed back (Shipmozo's spelling)
  awb_number?: string;
  /** Set once a parcel is being returned; the RTO leg gets its own waybill. */
  rto_awb_number?: string;
  /** Webhook spelling of who is carrying it. */
  carrier?: string;
  /** GET /track-order spelling of the same field. Read via readShipmozoCarrier. */
  courier?: string;
  current_status?: string;
  status_time?: string;
  /** Null, not absent, when the courier has not committed to a date. */
  expected_delivery_date?: string | null;
  shipment_type?: string; // "Forward" | "Reverse"
  /** Order-level state, e.g. "CANCELLED". Distinct from the parcel's movement. */
  order_status?: string;
  /** Webhook shape. */
  status_feed?: { scan?: ShipmozoScanEntry[] };
  /** GET /track-order shape. */
  scan_detail?: ShipmozoScanEntry[];
}

// --- push-order --------------------------------------------------------------

// Callers may omit anything optional here. They are filled in with Shipmozo's
// own empty defaults before the request goes out, because Shipmozo reads these
// keys unguarded and a missing one refuses the order outright. See
// lib/shipmozo/pushOrderDefaults.ts.
export interface ShipmozoProductDetail {
  name: string;
  quantity: number;
  unit_price: number;
  hsn?: string;
  sku_number?: string;
  /** Their schema says number, their example sends "". Either is accepted. */
  discount?: number | string;
  product_category?: string;
}

export interface ShipmozoPushOrderPayload {
  order_id: string;
  order_date: string; // yyyy-mm-dd
  consignee_name: string;
  consignee_phone: string;
  consignee_alternate_phone?: string;
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
  gst_ewaybill_number?: string;
  gstin_number?: string;
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

// --- get-order-detail --------------------------------------------------------

// Shipmozo documents no schema for this endpoint, so only the fields we
// actually read are typed, all optional. It is used as a "does this order
// already exist?" probe, never as a source of truth.
export interface ShipmozoOrderDetailData {
  order_id?: string;
  refrence_id?: string;
  awb_number?: string;
  courier?: string;
  courier_company?: string;
  status?: string;
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
