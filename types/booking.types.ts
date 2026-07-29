import { Client } from "@/generated/prisma";

export interface AddressForm {
  contactName: string;
  contactPhone: string;
  companyName?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export type ClientSummary = Pick<
  Client,
  | "id"
  | "companyName"
  | "contactName"
  | "email"
  | "phone"
  | "companyKind"
  | "addressLine1"
  | "city"
  | "country"
  | "postalCode"
  | "state"
>;

export interface ConsignorForm {
  contactName: string;
  companyName?: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * One line item packed inside a box (Description / HSN / Qty / unit value).
 * A box can hold many. Values are all in BookingFormData.currency — currency
 * is never per-item, so totals can't silently mix currencies.
 */
export interface BoxContentItem {
  id: string;
  description: string;
  hsCode: string;
  quantity: number;
  unitValue: number;
}

/**
 * A physical box. `quantity` = how many identical boxes (same dimensions,
 * weight AND contents). The UI tells the user to add a separate box only when
 * one of those differs; otherwise they just bump this quantity. Carrier rating
 * uses the dimensions + weight; the invoice/customs/KYC threshold uses the
 * contents' declared value.
 */
export interface CargoBox {
  id: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  quantity: number;
  contents: BoxContentItem[];
}

export type ShipmentTypeValue = "CSB4" | "CSB5" | "COMMERCIAL";

/**
 * Which of the two booking flows the customer is in. Chosen on the wizard's
 * first step and never changed afterwards without resetting the booking — it
 * decides the step list, which address fields exist, which documents are asked
 * for and which rate network is queried.
 */
export type ShipmentModeValue = "INTERNATIONAL" | "DOMESTIC";

/**
 * The GST paperwork a domestic shipment travels on. Unlike KYC, none of this is
 * reusable across shipments — every document describes this consignment's goods
 * — so it is collected fresh each time and stored against the shipment, not the
 * party. Always empty on an international booking.
 */
export interface DomesticDocs {
  /** GST tax invoice. Required when the sender is a company. */
  taxInvoice: FileMeta | null;
  /** For goods moving without a sale (stock transfer, branch, repair). Always optional. */
  deliveryChallan: FileMeta | null;
  /** Required once the declared value exceeds ₹50,000. */
  eWayBill: FileMeta | null;
}

export interface ServiceOption {
  vendorId: string;
  vendorName: string;
  productCode: string;
  productName: string;
  transitDays: number;
  price: number;
  currency: string;
  /**
   * Vendor's own courier id for this option, when exposed. For a first-mile
   * Shipmozo option this is the domestic courier id, snapshotted so ops can
   * later book the exact courier the customer selected. Optional/null for
   * international services and legacy rows.
   */
  courierId?: string | null;
}

export interface FileMeta {
  fileUrl: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface BookingFormData {
  /**
   * International or domestic. Answered on step 0, before anything else, since
   * every step after it is shaped by the answer.
   */
  mode: ShipmentModeValue;

  shipmentOwnerMode: "SELF" | "EXISTING_CLIENT" | "OTHER_PERSON";
  selectedClient: ClientSummary | null;

  sameAsConsignor: boolean;

  kycDocs: {
    companyPan: FileMeta | null;
    pan: FileMeta | null;
    aadhaar: FileMeta | null;
    gst: FileMeta | null;
    iec: FileMeta | null;
    lut: FileMeta | null;
  };

  /** Sender — who the shipment is from (the consignor). */
  consignor: ConsignorForm;

  /**
   * Pickup — where the parcel is physically collected (India, for first-mile
   * door → hub). Defaults to the sender's address; `pickupSameAsSender` lets
   * the user reuse the sender address instead of entering a separate one
   * (e.g. sender is a client but the goods ship from a different warehouse).
   */
  pickupSameAsSender: boolean;
  pickup: ConsignorForm;

  /** Receiver / delivery address (international destination). */
  consignee: ConsignorForm;

  /**
   * Billing — who to invoice + where. Defaults to the delivery address;
   * `billingSameAsDelivery` lets the user invoice a different party (e.g. a
   * corporate office in another country) than the one receiving the goods.
   */
  billingSameAsDelivery: boolean;
  billing: ConsignorForm;

  /**
   * CSB4 / CSB5 / COMMERCIAL — auto-suggested from total value, then
   * user-adjustable. INTERNATIONAL only; a domestic shipment crosses no customs
   * border, so this is never persisted for one.
   */
  shipmentType: ShipmentTypeValue;

  /**
   * Door pickup opt-in — drives the first-mile (door → hub) step later.
   * INTERNATIONAL only. A domestic booking is a single door → door courier
   * move, so there is nothing to opt into and no separate first-mile leg.
   */
  pickupIncluded: boolean;

  invoiceMode: InvoiceMode;
  uploadedInvoice: FileMeta | null;
  invoiceNumber?: string;

  /** GST paperwork for a domestic shipment. See DomesticDocs. */
  domesticDocs: DomesticDocs;

  /**
   * Cash on delivery, offered on domestic rates only. This is Shipmozo's
   * facility, not how the customer pays Arena: the freight is still debited
   * from the org wallet at booking exactly as on a prepaid shipment. The amount
   * collected from the receiver is the declared goods value, so there is no
   * separate field for it.
   */
  codEnabled: boolean;

  /** Single currency for the whole shipment — every item's unitValue is in this currency. */
  currency: string;
  boxes: CargoBox[];

  selectedService: ServiceOption | null;

  /**
   * First-mile (door → carrier hub) courier, chosen on its own step AFTER the
   * international service — but only when `pickupIncluded` is true. Same shape
   * as the intl service (a domestic Shipmozo quote, org markup already applied).
   * Null when door pickup wasn't opted into, or not yet selected.
   */
  firstMile: ServiceOption | null;
  /** Which hub the first-mile leg routes to (label snapshot, e.g. "Dwarka, New Delhi"). */
  firstMileHubLabel?: string | null;
}

export interface BookingStep {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Org context passed into the wizard from the server (book page). Decides
 * which BA-only features show, whether payment is collected up-front or
 * deferred, and seeds the "Use my saved profile" sender option.
 *
 * `markupPercent` is serialised to a plain number (Prisma Decimal → number)
 * before it crosses the server→client boundary.
 */
export interface BookingOrgContext {
  orgId: string;
  isBusinessAssociate: boolean;
  skipPayment: boolean;
  markupPercent: number;
  /** The org's own registered profile — used for the SELF sender option. */
  self: {
    companyName: string | null;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postalCode: string | null;
  };

  profileAddressComplete: boolean;
}

export type ShipmentOwnerMode = "SELF" | "EXISTING_CLIENT" | "OTHER_PERSON";

export type InvoiceMode = "UPLOAD" | "GENERATE";