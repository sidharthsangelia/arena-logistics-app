/**
 * SHIPMOZO VENDOR TYPES
 * -----------------------------------------------------------------------------
 * Exact shapes for the Shipmozo Shipping API (International Rate Calculator +
 * the Countries lookup it depends on). Scoped entirely to this vendor folder.
 *
 * NOTE ON THE RESPONSE SHAPE:
 * Shipmozo's OpenAPI spec documents `200` as "Successful operation" for
 * /international-rate-calculator and /countries but does NOT include a
 * response body example (unlike /pincode-serviceability, /create-shipper,
 * etc., which do). The shapes below follow the `result / message / data`
 * envelope used consistently by every other documented endpoint, and product
 * fields carry several plausible key-name fallbacks so a real payload is
 * very likely to parse. Log a raw response against a live call and tighten
 * this file once confirmed — see the comment in the adapter's callVendorApi.
 */

// --- COMMON ENVELOPE ---------------------------------------------------------

export interface ShipmozoEnvelope<T> {
  result: string; // "1" success, "0" failure
  message: string;
  data: T;
}

// --- COUNTRIES ---------------------------------------------------------------

export interface ShipmozoCountry {
  id: number | string;
  name: string;
  code?: string;
  iso2?: string;
  iso3?: string;
}

export type ShipmozoCountriesResponse = ShipmozoEnvelope<ShipmozoCountry[]>;

// --- INTERNATIONAL RATE CALCULATOR: REQUEST ----------------------------------

export type ShipmozoPackageType = "SPS" | "MPS" | "B2B";
export type ShipmozoShipmentPurpose = "DCSB4" | "SCSB4" | "CSB5";

export interface ShipmozoDimensionBox {
  no_of_box: number;
  length: number;
  width: number;
  height: number;
}

/** Final payload actually sent over the wire to Shipmozo. */
export interface ShipmozoRateCalculatorPayload {
  pickup_pincode: string;
  delivery_pincode: string;
  delivery_country_id: string;
  order_amount: string;
  type_of_package: ShipmozoPackageType;
  shipment_purpose: ShipmozoShipmentPurpose;
  weight: string; // grams
  dimensions: ShipmozoDimensionBox[];
}

/**
 * Intermediate shape produced by `transformRequest`. Country ID resolution
 * requires an async /countries lookup, which the synchronous
 * `transformRequest` step can't perform — so we carry the ISO code/name
 * here and resolve `delivery_country_id` inside `callVendorApi`.
 */
export interface ShipmozoRateRequest {
  deliveryCountryCode: string;
  deliveryCountryName?: string;
  payload: Omit<ShipmozoRateCalculatorPayload, "delivery_country_id">;
}

// --- INTERNATIONAL RATE CALCULATOR: RESPONSE ---------------------------------
export interface ShipmozoOverheadCharge {
  name: string;
  value: number;
}
/** Confirmed against a live /international-rate-calculator response. */
export interface ShipmozoRateProduct {
  id: number;
  name: string;
  image?: string;
  /** Often an empty string — Shipmozo doesn't always populate this. */
  estimated_delivery?: string;

  overhead_charges: number;
  shipping_charges: number;
  before_tax_total_charges: number;
  gst: number;
  gst_percentage?: number;
  total_charges: number;

  minimum_charges?: number;
  minimum_charges_applied?: boolean;

  overhead_charges_details?: ShipmozoOverheadCharge[];

  pickups_automatically_scheduled?: string;
  minimum_chargeable_weight?: string;
}

export type ShipmozoRateResponse = ShipmozoEnvelope<ShipmozoRateProduct[]>;