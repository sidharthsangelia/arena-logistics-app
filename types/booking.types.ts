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

export interface ServiceOption {
  vendorId: string;
  vendorName: string;
  productCode: string;
  productName: string;
  transitDays: number;
  price: number;
  currency: string;
}

export interface FileMeta {
  fileUrl: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface BookingFormData {
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

  /** CSB4 / CSB5 / COMMERCIAL — auto-suggested from total value, then user-adjustable. */
  shipmentType: ShipmentTypeValue;

  /** Door pickup opt-in — drives the first-mile (door → hub) step later. */
  pickupIncluded: boolean;

  invoiceMode: InvoiceMode;
  uploadedInvoice: FileMeta | null;
  invoiceNumber?: string;

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