/**
 * SKART TRACKING TYPES
 * -----------------------------------------------------------------------------
 * Raw shapes returned by the Skart track-shipment API.
 * These types must never leak outside the skart vendor folder.
 *
 * Source: POST /api/v1/booking/track-shipment
 */

// --- REQUEST -----------------------------------------------------------------

export interface SkartTrackRequest {
  user_name: string;
  password: string;
  awb: string;
}

// --- RESPONSE ----------------------------------------------------------------

export interface SkartExtraData {
  awb: string;
  ship_date: string; // ISO string, e.g. "2024-08-22T09:42:28.000Z"
  service: string; // e.g. "Aramex UPS MUM"
  weight: number;
  no_of_pieces: number;
  destination: string; // e.g. "CANADA"
}

/**
 * One entry in the Skart track_data array.
 * event_type "1" = booking events, "2" = transit events.
 */
export interface SkartTrackEvent {
  date: string; // e.g. "2024-08-22 16:32:00"
  status: string;
  remarks: string;
  comments: string;
  event_type: string; // "1" | "2"
  status_code: string | number;
  weight_unit?: string;
  courier_code: string;
  gross_weight?: string;
  updation_type?: string;
  package_weight?: string;
  shipment_weight?: string;
  update_location: string;
  chargeable_weight?: string;
  update_description: string;
  courier_status_code: string | number;

  city?: string; // ← ADD
  country_name?: string; // ← ADD
  arrival_localtion?: string; // ← ADD (note: Skart typo, sic)
  event_description?: string; // ← ADD

  // Present only on booking events (event_type "1")
  tat_days?: number;
  airwaybill_no?: string;
}

export interface SkartTrackData {
  extra_data: SkartExtraData;
  track_data: SkartTrackEvent[];
}

export interface SkartTrackResponse {
  message: string;
  statusCode: number;
  data: SkartTrackData;
}
