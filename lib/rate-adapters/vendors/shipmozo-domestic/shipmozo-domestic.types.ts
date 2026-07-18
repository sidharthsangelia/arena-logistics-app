/**
 * SHIPMOZO DOMESTIC — VENDOR-SPECIFIC TYPES
 * -----------------------------------------------------------------------------
 * Request/response shapes for Shipmozo's DOMESTIC rate calculator
 * (POST /rate-calculator). These types NEVER leak outside the adapter folder —
 * the rest of the app speaks only the canonical CanonicalRateRequest/RateQuote.
 *
 * Unlike the international calculator, the domestic one needs no country
 * resolution: both ends are Indian pincodes, so transformRequest can build the
 * full payload synchronously and callVendorApi just POSTs it.
 *
 * The response shape below is modelled against a real live payload — each
 * `data[]` entry is one courier product (e.g. "Delhivery Air", "XpressBees
 * 0.5 Kg"). Numeric fields arrive as JSON numbers but are read tolerantly in
 * case a tenant returns them as strings.
 */

// --- REQUEST ------------------------------------------------------------------

/** One box group in the Shipmozo domestic `dimensions` array. */
export interface ShipmozoDomesticDimensionBox {
  no_of_box: number;
  length: number;
  width: number;
  height: number;
}

export type ShipmozoDomesticPackageType = "SPS" | "MPS" | "B2B";
export type ShipmozoDomesticPaymentType = "PREPAID" | "COD";
export type ShipmozoDomesticShipmentType = "FORWARD" | "RETURN";
export type ShipmozoDomesticRovType = "ROV_OWNER" | "ROV_CARRIER";

/**
 * The exact JSON body POSTed to /rate-calculator. This is also the adapter's
 * TVendorRequest — no intermediate wrapper is needed because there is no async
 * country lookup step (contrast the international adapter).
 */
export interface ShipmozoDomesticRatePayload {
  order_id?: string;
  pickup_pincode: string;
  delivery_pincode: string;
  payment_type: ShipmozoDomesticPaymentType;
  shipment_type: ShipmozoDomesticShipmentType;
  order_amount: string;
  type_of_package: ShipmozoDomesticPackageType;
  rov_type: ShipmozoDomesticRovType;
  cod_amount: string;
  /** Weight in GRAM (canonical weight is always KG → ×1000). */
  weight: string;
  dimensions: ShipmozoDomesticDimensionBox[];
}

// --- RESPONSE -----------------------------------------------------------------

export interface ShipmozoDomesticOverheadCharge {
  name: string;
  value: number | string;
}

/**
 * One courier option returned by the domestic rate calculator. `name` is the
 * courier + weight-slab label ("Delhivery Air", "XpressBees 1KG"). Charges are
 * pre-GST amounts; `total_charges` is GST-inclusive.
 */
export interface ShipmozoDomesticRateProduct {
  id?: number | string;
  name?: string;
  image?: string;
  estimated_delivery?: string; // free text, e.g. "1 Days"

  // charges (rupees)
  overhead_charges?: number | string;
  shipping_charges?: number | string;
  before_tax_total_charges?: number | string;
  gst?: number | string;
  total_charges?: number | string;
  minimum_charges?: number | string;
  minimum_charges_applied?: boolean;
  gst_percentage?: number | string;
  overhead_charges_details?: ShipmozoDomesticOverheadCharge[];

  // metadata
  minimum_chargeable_weight?: string; // e.g. "0.5 KG"
  from_zone?: string;
  to_zone?: string;
}

export interface ShipmozoDomesticRateResponse {
  result?: number | string;
  message?: string;
  data?: ShipmozoDomesticRateProduct[];
}
