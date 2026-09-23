/**
 * ARAMEX TRACKING TYPES
 * -----------------------------------------------------------------------------
 * Raw shapes for the Aramex Shipment Tracking API.
 *
 * Source: POST https://ws.aramex.net/ShippingAPI.V2/Tracking/Service_1_0.svc/json/TrackShipments
 * and vendor-api-docs/Aramex/shipments-tracking-api-manual.pdf.
 *
 * ── THESE SHAPES WERE WRONG AND ARE NOW RIGHT ───────────────────────────────
 * The first version of this file was written against the tracking manual's
 * prose without a live response to check it, and it got three things wrong that
 * would each have produced an empty timeline in production:
 *
 *   1. The request flag is `GetLastTrackingUpdateOnly`, not `GetLastEventOnly`.
 *      An unknown member is ignored by Aramex's serialiser, so the old name did
 *      not error — it silently meant "false", which was the intended value, so
 *      this one was harmless luck rather than a working field.
 *
 *   2. `TrackingResults[].Value` is an array of UPDATE RECORDS. The old shape
 *      expected an array of shipments each holding a `TrackingUpdates[]`, so
 *      every lookup read `undefined` and reported a shipment with no scans.
 *
 *   3. Timestamps are .NET WCF dates (`/Date(1705900653000+0530)/`), not
 *      ISO-8601. Passing one straight into `new Date()` yields Invalid Date.
 *
 * If a fourth surprise turns up, correct it here and leave the note.
 */

import type {
  AramexBaseResponse,
  AramexClientInfo,
  AramexTransaction,
} from "@/lib/aramex/types";

export type { AramexClientInfo };

// --- REQUEST -----------------------------------------------------------------

export interface AramexTrackRequest {
  ClientInfo: AramexClientInfo;
  /** AWBs to look up. We always send one. */
  Shipments: string[];
  /** false = the full history, which is what a timeline needs. */
  GetLastTrackingUpdateOnly: boolean;
  Transaction: AramexTransaction;
}

// --- RESPONSE ----------------------------------------------------------------

/**
 * One scan.
 *
 * `UpdateCode` is an Aramex operational code such as "SH014" or "SH005". The
 * two-letter codes an earlier version of this file mapped do not exist in this
 * API. See the classifier in the adapter for how they are read.
 */
export interface AramexTrackingUpdate {
  WaybillNumber?: string | null;
  UpdateCode?: string | null;
  UpdateDescription?: string | null;
  /** WCF date. See lib/aramex/wcfDate.ts. */
  UpdateDateTime?: string | null;
  UpdateLocation?: string | null;
  Comments?: string | null;
  ProblemCode?: string | null;
  GrossWeight?: string | null;
  ChargeableWeight?: string | null;
  WeightUnit?: string | null;
}

/** Aramex returns a dictionary as an array of key/value pairs. */
export interface AramexTrackingResultEntry {
  /** The AWB. */
  Key: string;
  /** Its scans, oldest-first in practice, though nothing promises that. */
  Value: AramexTrackingUpdate[] | null;
}

export interface AramexTrackResponse extends AramexBaseResponse {
  TrackingResults: AramexTrackingResultEntry[] | null;
  /**
   * AWBs Aramex has never heard of.
   *
   * Worth reading rather than inferring from an empty result: a waybill that is
   * booked but not yet scanned and a waybill that does not exist both produce
   * no events, and only this field tells them apart.
   */
  NonExistingWaybills?: string[] | null;
}
