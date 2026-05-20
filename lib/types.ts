export interface RateRequest {
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

export interface Charge {
  charge_name: string;
  charge_id: number | string;
  charge_amount: string;
  igst_amount: string;
  inr_amount: string;
  charge_amount_show: string;
}

export interface RateResult {
  product_name: string;
  parent_vendor: string;
  tat_days: number;
  charges: Charge[];
  grand_total_with_gst: number;
  grand_total_without_gst: string;
}

export interface RateApiResponse {
  message: string;
  statusCode: number;
  data: RateResult[];
}