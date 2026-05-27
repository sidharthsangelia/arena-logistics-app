/**
 * SKART VENDOR TYPES
 * -----------------------------------------------------------------------------
 * Exact shapes of the sKart Express API's request and response payloads.
 * These live ONLY inside this folder — nothing outside should import them.
 */

// --- REQUEST -----------------------------------------------------------------

export interface SkartRateRequest {
  user_name: string;
  password: string;
  booking_type: number;
  origin_pincode: string;
  destination_pincode: string;
  destination_country: string;
  shipment_type: number;
  weight: number;
  quantity: number;
  length: number;
}

// --- RESPONSE ----------------------------------------------------------------

export interface SkartCharge {
  charge_name: string;
  charge_id: number | string;
  charge_amount: string;
  hsn_code: string;
  tax_rate: number | string;
  cgst: string;
  cgst_amount: string;
  sgst: string;
  sgst_amount: string;
  igst: string;
  igst_amount: string;
  inr_amount: string;
  ex_rate: string;
  currency_id: number;
  charge_amount_show: string;
}

export interface SkartProduct {
  product_name: string;
  parent_vendor: string;
  tat_days: number;
  charges: SkartCharge[];
  grand_total_with_gst: number;
  grand_total_without_gst: string;
}

export interface SkartRateResponse {
  message: string;
  statusCode: number;
  data: SkartProduct[];
}