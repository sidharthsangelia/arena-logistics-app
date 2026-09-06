/**
 * BOOKING ADAPTERS: CANONICAL TYPES
 * -----------------------------------------------------------------------------
 * The shapes every domestic courier vendor is translated into and out of.
 * Nothing vendor-specific appears here, and nothing here mentions Shipmozo:
 * that is the whole point. Adding a second domestic vendor means writing one
 * adapter against this file, not touching the booking job, the ops screens or
 * the database.
 *
 * Sibling of lib/rate-adapters (what a shipment costs) and lib/tracking-adapters
 * (where it is now). This one covers the step between them: turning a paid
 * booking into a waybill.
 *
 * A note on units. Canonical is always metric and always human: kilograms,
 * centimetres, rupees. Vendors that want grams or paise convert inside their
 * own adapter. Every caller of this layer already thinks in kg and cm, and a
 * unit that changes meaning halfway down a call stack is how parcels get
 * declared a thousand times too light.
 */

/** One end of the move. Domestic only, so no country beyond India. */
export interface BookingParty {
  contactName: string;
  companyName?: string | null;
  phone: string;
  email?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
}

/** A physical box. `quantity` is how many identical boxes, matching PackageItem. */
export interface BookingParcel {
  quantity: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/** A line inside the boxes. Drives the vendor's manifest and the label. */
export interface BookingLineItem {
  name: string;
  quantity: number;
  unitValue: number;
  hsCode?: string | null;
}

export interface CanonicalBookingRequest {
  /**
   * Our own handle for this booking (the Shipment id). Sent to the vendor as
   * their order reference so their tracking webhooks come back carrying
   * something we can match without a lookup table.
   */
  reference: string;
  /** The customer-facing number, e.g. "ARN260130748291". For labels and manifests. */
  displayReference: string;
  /** yyyy-mm-dd. Passed in rather than derived so a retry sends the same date. */
  orderDate: string;

  pickup: BookingParty;
  delivery: BookingParty;

  parcels: BookingParcel[];
  /** Sum of the parcels' actual weight. Carried explicitly because it is what
   *  the customer was quoted on, and re-deriving it invites drift. */
  totalActualWeightKg: number;
  items: BookingLineItem[];
  declaredValue: number;

  /**
   * COD is the courier collecting the GOODS value from the receiver. It is not
   * how the customer pays Arena — that already happened, out of the wallet.
   */
  payment: { type: "PREPAID" | "COD"; codAmount?: number };

  /** What the customer paid Arena for freight, for the vendor's own records. */
  freightCharge?: number | null;

  /**
   * The e-way bill number, digits only, when the consignment needs one.
   *
   * India-specific and unavoidable at this layer: it is a FIELD on the courier's
   * order, not a document, and a carrier that requires it refuses the
   * consignment without it. Null below the GST threshold, which is the ordinary
   * case, so an adapter that does not use it can ignore it entirely.
   */
  eWayBillNumber?: string | null;

  /**
   * The exact service the customer chose and paid for. `courierId` is the
   * vendor's own id for it; when it is absent the caller has to decide whether
   * an auto-assign is acceptable, because a different courier at the same price
   * is still not what was bought.
   */
  service: {
    vendorId: string;
    courierId?: string | null;
    productName?: string | null;
  };
}

/** Where the vendor collects from, once registered with them. */
export interface PickupPointResult {
  /** Null for vendors that take the pickup address inline and register nothing. */
  pickupPointId: string | null;
}

export interface CreateOrderResult {
  vendorOrderId: string;
}

export interface AssignedCarrier {
  awbNumber: string;
  /** The courier that will actually carry it, e.g. "Delhivery". */
  courierName: string | null;
  /** Public tracking page, when the vendor gives one. */
  trackingUrl?: string | null;
}

/** A label as bytes. Vendors that answer with a URL fetch it themselves. */
export interface LabelFile {
  bytes: Uint8Array;
  mimeType: string;
  /** Suggested file name, without a path. */
  fileName: string;
}

/**
 * Everything a vendor might need to ask for the physical collection.
 *
 * Wider than the order id alone because vendors disagree about what a pickup is
 * attached to. Shipmozo schedules against the ORDER and needs nothing else.
 * SpeedoPost schedules against the WAREHOUSE and the CARRIER, and never sees
 * the order at all: it wants a provider code, a warehouse name, a box count and
 * a weight. One field per vendor's idea of a pickup would make this layer keep
 * a shape per vendor, which is exactly what it exists to avoid, so it carries
 * the whole booking and each adapter takes the parts it uses.
 */
export interface SchedulePickupInput {
  /** The vendor's handle for the order, as returned by createOrder. */
  vendorOrderId: string;
  /** The waybill, once assigned. */
  awbNumber: string;
  /** Whatever ensurePickupPoint returned; null for vendors that register none. */
  pickupPointId: string | null;
  /** The service the customer paid for, when it is known. */
  courierId: string | null;
  /** The booking itself, for the addresses, boxes and weight. */
  request: CanonicalBookingRequest;
}

/**
 * What an adapter can tell us about an order it may or may not already hold.
 * Used to recover from the one failure that a plain retry makes worse: a
 * create call that succeeded at the vendor and whose response we never saw.
 */
export interface ExistingOrder {
  vendorOrderId: string;
  awbNumber?: string | null;
  courierName?: string | null;
}
