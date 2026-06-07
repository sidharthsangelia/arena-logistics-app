/**
 * ARAMEX TRACKING TYPES
 * -----------------------------------------------------------------------------
 * Raw shapes for the Aramex Shipment Tracking API.
 * Populated from the Aramex API documentation.
 *
 * Source: POST https://ws.aramex.net/ShippingAPI.V2/Tracking/Service_1_0.svc/json/TrackShipments
 *
 * Add/adjust fields as you connect the live Aramex tracking endpoint.
 */

// --- REQUEST -----------------------------------------------------------------

export interface AramexClientInfo {
  UserName: string;
  Password: string;
  Version: string;
  AccountNumber: string;
  AccountPin: string;
  AccountEntity: string;
  AccountCountryCode: string;
  Source: number;
}

export interface AramexTrackRequest {
  ClientInfo: AramexClientInfo;
  Shipments: string[];              // list of AWBs
  GetLastEventOnly: boolean;        // false = full history
}

// --- RESPONSE ----------------------------------------------------------------

export interface AramexNotification {
  Code: string;
  Message: string;
}

export interface AramexTrackingUpdate {
  UpdateCode: string;               // e.g. "SH", "DL"
  UpdateDescription: string;
  UpdateDateTime: string;           // ISO-8601
  UpdateLocation: string;
  Comments: string;
  ProblemCode: string;
  Reason: string;
}

export interface AramexTrackedShipment {
  WaybillNumber: string;
  UpdatedAt: string;
  TrackingUpdates: AramexTrackingUpdate[];
  LastUpdate: AramexTrackingUpdate | null;
  HasErrors: boolean;
  Notifications: AramexNotification[];
}

export interface AramexTrackResponse {
  HasErrors: boolean;
  Notifications: AramexNotification[];
  TrackingResults: Array<{
    Key: string;                    // AWB number
    Value: AramexTrackedShipment[];
  }>;
}