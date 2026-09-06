/**
 * lib/speedopost/types.ts
 * -----------------------------------------------------------------------------
 * SpeedoPost's wire shapes, typed from vendor-api-docs/speedopost.json.
 *
 * Every endpoint in that document is typed here, whether or not we call it.
 * Writing them down is what turns the doc's prose into something the compiler
 * checks. As of 2026-09-05 the rate, tracking, warehouse, order, pickup, label
 * and cancel shapes are all in use; the rest (Reattempt, BookAppointment,
 * CancelPickupRequest) are still typed ahead of any caller.
 *
 * These types never leave lib/speedopost and the two adapter folders. The rest
 * of the app speaks only the canonical RateQuote / CanonicalTrackResult.
 *
 * ── WHAT THE DOC IS SURE ABOUT, AND WHAT IT IS NOT ──────────────────────────
 * Anything marked CONFIRMED below has a real example response behind it.
 * Anything marked UNCONFIRMED was described in prose only, so the type is a
 * best reading and the first live call should be logged before it is trusted.
 * The doc's own `gapsAndOpenQuestions` list is the source for that split.
 * ────────────────────────────────────────────────────────────────────────────
 */

// --- ENVELOPE -----------------------------------------------------------------

/**
 * Every endpoint answers in this wrapper, including failures. HTTP 200 with
 * `status: "FAIL"` is their normal way of refusing a request, so a caller that
 * only checks `res.ok` will treat a refusal as a success.
 */
export interface SpeedoPostEnvelope<T> {
  status?: string; // "SUCCESS" | "FAIL"
  message?: string | null;
  response?: T | null;
}

/** Segment of the network. Required on both rating and order creation. */
export type SpeedoPostOrderType = "B2B" | "B2C";

/** "PP" is prepaid. COD requires an amount alongside it. */
export type SpeedoPostPaymentMode = "COD" | "PP";

// --- AUTHENTICATION -----------------------------------------------------------
// POST /jwt/token — CONFIRMED.

export interface SpeedoPostAuthPayload {
  userId: string;
  password: string;
}

/** `response` is the bare JWT string, not an object. */
export type SpeedoPostAuthResponse = SpeedoPostEnvelope<string>;

// --- ESTIMATED RATE -----------------------------------------------------------
// POST /util-service/api/auth/v1/EstimatedRate — CONFIRMED (both shapes).

/**
 * One box group. Note there is no per-box weight here: the rate call takes a
 * single total `weight` for the whole consignment and the dimensions only
 * describe volume. That is unlike CreateOrder, whose dimension entries DO carry
 * a weight.
 */
export interface SpeedoPostRateDimension {
  length: number;
  width: number;
  height: number;
  count: number;
}

export interface SpeedoPostRatePayload {
  orderType: SpeedoPostOrderType;
  sourcePin: string;
  consigneePin: string;
  /** Total consignment weight in KG. */
  weight: number;
  paymentMode: SpeedoPostPaymentMode;
  /** Mandatory when paymentMode is "COD". Sent as 0 on prepaid. */
  codAmount?: number;
  dimensions: SpeedoPostRateDimension[];
}

/**
 * One priced provider.
 *
 * Two response shapes exist for the same endpoint and both are folded into this
 * one interface, because which one arrives depends on the account rather than
 * on anything we send:
 *
 *   MINIMAL   — { totalCharge, serviceProviderCode, serviceProviderName }.
 *               The base doc example. No tax split at all.
 *   EXTENDED  — the same three plus the full surcharge breakdown below.
 *               Observed in live testing per the doc's own note.
 *
 * Everything past the first three fields is therefore optional. `serviceProvider
 * Code` is documented as a string in some places and arrives as a number in the
 * example response, so it is typed as both and normalised at the boundary.
 */
export interface SpeedoPostRateOption {
  serviceProviderCode?: string | number;
  serviceProviderName?: string;

  /** subTotalCharge + gstAmount. The final payable amount. */
  totalCharge?: number | string;

  // ── Extended breakdown (present on some accounts only) ──
  /** Per-unit rate the freight is derived from. */
  rate?: number | string;
  /** Billable weight in KG. Differs from actual weight after volumetric rounding. */
  chargeWeight?: number | string;
  freightCharge?: number | string;
  /** Fuel surcharge. */
  fscCharge?: number | string;
  /** Risk of value. */
  rovCharge?: number | string;
  codCharge?: number | string;
  /** Out of delivery area. */
  odaCharge?: number | string;
  waybillCharge?: number | string;
  fuelCharge?: number | string;
  insuranceCharge?: number | string;
  firstMileCharge?: number | string;
  greenCharge?: number | string;
  additionalCharge?: number | string;
  appointmentCharge?: number | string;
  handlingCharge?: number | string;
  reAttemptCharge?: number | string;
  nonMetroCharge?: number | string;
  dphCharge?: number | string;
  adhocVehicleCharge?: number | string;
  csdCharges?: number | string;
  sundayDeliveryCharges?: number | string;
  additionalMachineryCharges?: number | string;
  additionalManpowerCharges?: number | string;
  mathadiUnionCharges?: number | string;
  specialDeliveryCharges?: number | string;
  demurrageCharges?: number | string;

  gstPercent?: number | string;
  gstAmount?: number | string;
  /** Sum of every charge above, before GST. */
  subTotalCharge?: number | string;
}

export type SpeedoPostRateResponse = SpeedoPostEnvelope<SpeedoPostRateOption[]>;

// --- TRACKING -----------------------------------------------------------------
// GET /util-service/api/auth/v1/TrackingDetails — CONFIRMED.

/** The only value the doc ever shows. Kept as a type so a second one is a change. */
export type SpeedoPostTrackingType = "AWB";

export interface SpeedoPostTrackQuery {
  awb: string;
  trackingType: SpeedoPostTrackingType;
}

/**
 * One scan. `type` is the direction of the movement — "FWD" in the only example
 * given, but a return leg has to report something, so it is read rather than
 * assumed. `date` is "YYYY-MM-DD HH:mm:ss" with no timezone (IST in practice).
 */
export interface SpeedoPostPacketHistoryEntry {
  type?: string;
  statusCode?: string | number;
  status?: string;
  date?: string;
  remarks?: string | null;
  location?: string | null;
}

export interface SpeedoPostTrackData {
  currentStatus?: string;
  currentStatusCode?: string | number;
  awbNumber?: string;
  orderDate?: string | null;
  clientOrderId?: string | null;
  deliveredDate?: string | null;
  currentLocation?: string | null;
  serviceProviderName?: string;
  serviceProviderCode?: string | number;
  /** The downstream courier's own waybill, distinct from SpeedoPost's. */
  serviceProviderAwbNumber?: string;
  /** Chronological, OLDEST FIRST — the reverse of our canonical order. */
  packetHistory?: SpeedoPostPacketHistoryEntry[];
}

export type SpeedoPostTrackResponse = SpeedoPostEnvelope<SpeedoPostTrackData>;

// --- SERVICEABILITY -----------------------------------------------------------
// POST /util-service/api/auth/v1/Serviceability — CONFIRMED.
// Not called by the rate adapter: EstimatedRate already answers only for
// providers that can price the lane, and the ODA surcharge arrives inside the
// rate breakdown as `odaCharge`.

export interface SpeedoPostServiceabilityPayload {
  pickupPincode: string;
  deliveryPincode: string;
}

export interface SpeedoPostServiceabilityEntry {
  serviceProviderCode?: string | number;
  serviceProviderName?: string;
  serviceActive?: boolean;
  /** Out of delivery area. A true here means a surcharge and a slower lane. */
  oda?: boolean;
}

export type SpeedoPostServiceabilityResponse = SpeedoPostEnvelope<
  SpeedoPostServiceabilityEntry[]
>;

// --- SERVICE PROVIDERS --------------------------------------------------------
// GET /util-service/api/auth/v1/ServiceProvider — CONFIRMED.
// The catalogue that says which serviceProviderCode belongs to which segment.
// A booking adapter needs this: CreateOrder takes BOTH an orderType and a
// serviceProviderCode, and the two have to agree.

export interface SpeedoPostServiceProviderEntry {
  serviceProviderCode?: string | number;
  serviceProviderName?: string;
}

export interface SpeedoPostServiceProviderData {
  b2cServiceProvider?: SpeedoPostServiceProviderEntry[] | null;
  b2bServiceProvider?: SpeedoPostServiceProviderEntry[] | null;
  internationalServiceProvider?: SpeedoPostServiceProviderEntry[] | null;
}

export type SpeedoPostServiceProviderResponse =
  SpeedoPostEnvelope<SpeedoPostServiceProviderData>;

// --- WAREHOUSE ----------------------------------------------------------------
// POST /util-service/api/auth/v1/CreateWarehouse — response UNCONFIRMED.
// Note the response schema puts `warehouseId` at the TOP level of the envelope,
// not inside `response`, which is unlike every other endpoint here.

export interface SpeedoPostCreateWarehousePayload {
  warehouseName: string;
  contactPersonName: string;
  contactNo: string;
  alternateNo?: string;
  email: string;
  address: string;
  pinCode: string;
  city: string;
}

export interface SpeedoPostCreateWarehouseResponse
  extends SpeedoPostEnvelope<unknown> {
  warehouseId?: string;
}

// --- CREATE ORDER -------------------------------------------------------------
// POST /util-service/api/auth/v1/CreateOrder — response UNCONFIRMED.
//
// Two things here are unlike the rate call and will bite whoever writes the
// booking adapter:
//   1. `pickupDate` is DD-MM-YYYY, while CreatePickupRequest wants YYYY-MM-DD.
//   2. dimension entries carry their own `weight`, alongside a separate
//      top-level `weight`. The doc's example sets both to 120, which cannot be
//      right for a 2-box consignment, so the meaning of each is unverified.

export interface SpeedoPostOrderDimension {
  length: number;
  width: number;
  height: number;
  /** Per-box weight. Distinct from the payload's top-level `weight`. */
  weight: number;
  count: number;
}

export interface SpeedoPostCreateOrderPayload {
  /**
   * REQUIRED HERE, THOUGH SPEEDOPOST TREATS IT AS OPTIONAL.
   *
   * Their documentation: "If provided, system assigns this exact service
   * provider; otherwise a random one is assigned." So a bug that drops this
   * field ships the parcel on a courier nobody chose, at a price nobody quoted,
   * and the API reports success. Making it non-optional means that bug is a
   * compile error rather than a consignment.
   */
  serviceProviderCode: string;
  serviceProviderAwbNumber?: string | null;
  clientCode: string;
  /** Must already exist. See CreateWarehouse. */
  warehouseName: string;
  /** DD-MM-YYYY. */
  pickupDate?: string;
  orderType: SpeedoPostOrderType;

  receiverName: string;
  receiverNumber: string;
  receiverEmail?: string;
  receiverCity: string;
  receiverState: string;
  receiverAddress: string;
  receiverPinCode: string;

  /** Our own reference. The idempotency handle, if they honour one. */
  clientOrderId: string;
  invoiceNumber: string;
  invoiceAmount: number;
  skuCode?: string;
  skuName: string;
  /** Mandatory above Rs 50,000 of goods value. */
  ewaybill?: string;

  paymentType: SpeedoPostPaymentMode;
  /** Mandatory when paymentType is "COD". */
  codAmount?: number;

  category?: string;
  brand?: string;
  hsnCode?: string;
  insurance?: boolean;

  /** Total consignment weight. */
  weight: number;
  totalQuantity: number;
  dimensions: SpeedoPostOrderDimension[];

  sgstAmount?: number | null;
  cgstAmount?: number | null;
  igstAmount?: number | null;
  gstinNumber?: string;
  totalTaxValue?: number | null;
}

/**
 * UNCONFIRMED. The doc says only "the response will provide the status and
 * order details". An AWB has to come back somewhere for the flow to work, so
 * the likely fields are named optionally rather than invented as required.
 */
export interface SpeedoPostCreateOrderData {
  awbNumber?: string;
  orderId?: string | number;
  clientOrderId?: string;
  serviceProviderCode?: string | number;
  serviceProviderName?: string;
  serviceProviderAwbNumber?: string;
  [key: string]: unknown;
}

export type SpeedoPostCreateOrderResponse =
  SpeedoPostEnvelope<SpeedoPostCreateOrderData>;

// --- PICKUP -------------------------------------------------------------------
// POST /util-service/api/auth/v1/CreatePickupRequest — success UNCONFIRMED.
// GET  /util-service/api/auth/v1/CancelPickupRequest/{pickupId} — UNCONFIRMED.

export interface SpeedoPostCreatePickupPayload {
  serviceProviderCode: string;
  warehouseName: string;
  expectedPacketCount: number;
  expectedWeight: number;
  /** YYYY-MM-DD. Not the DD-MM-YYYY that CreateOrder wants. */
  pickupDate: string;
  /** HH:MM:SS, 24 hour. */
  pickupTime: string;
}

/**
 * UNCONFIRMED. Only a validation failure was ever captured. A pickup id must
 * come back, because CancelPickupRequest takes one as a path parameter, but the
 * field name is a guess.
 */
export interface SpeedoPostCreatePickupData {
  pickupId?: string | number;
  [key: string]: unknown;
}

export type SpeedoPostCreatePickupResponse =
  SpeedoPostEnvelope<SpeedoPostCreatePickupData>;

// --- LABEL / CANCEL / REATTEMPT / APPOINTMENT ---------------------------------
// All UNCONFIRMED: the doc captured only failures for these.

/** GET PrintLabel?awb=… — could be a URL, base64 or binary. Unknown. */
export type SpeedoPostPrintLabelResponse = SpeedoPostEnvelope<unknown>;

/** GET CancelOrder?awb=… — the only captured example was an auth error. */
export type SpeedoPostCancelOrderResponse = SpeedoPostEnvelope<unknown>;

/**
 * POST ReattemptRequest. The body is a BARE JSON ARRAY of AWBs, not an object
 * — the only endpoint in this API shaped that way. Send strings: AWBs are
 * strings everywhere else, and the doc's two examples disagree with each other.
 */
export type SpeedoPostReattemptPayload = string[];
export type SpeedoPostReattemptResponse = SpeedoPostEnvelope<unknown>;

export interface SpeedoPostBookAppointmentPayload {
  awbNumber: string;
  /** YYYY-MM-DD, must be in the future. */
  date: string;
  /** HH:MM, 24 hour. */
  startTime: string;
  /** HH:MM, 24 hour. */
  endTime: string;
  poNumber?: string;
  appointmentNo?: string;
}

export type SpeedoPostBookAppointmentResponse = SpeedoPostEnvelope<unknown>;
