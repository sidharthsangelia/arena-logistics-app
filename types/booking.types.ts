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
 * A single line item in a shipment.
 *
 * Replaces the old PackageForm + InvoiceItem split — those two types
 * duplicated description/hsCode/countryOfOrigin/quantity and were always
 * filled in twice for the same physical item. Now there's one shape that
 * carries both the commercial attributes (unitValue) needed for the
 * invoice/customs/KYC threshold, and the physical attributes (weight,
 * dimensions) needed for carrier rating — both are required regardless of
 * whether the user uploads their own invoice or generates one, since
 * rating and KYC need this data either way.
 *
 * Currency is intentionally NOT per-item — it lives once on
 * BookingFormData.currency, so totals can never silently mix currencies.
 */
export interface ShipmentItem {
  id: string;
  description: string;
  hsCode: string;
  countryOfOrigin: string;
  quantity: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  unitValue: number;
}

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
    pan: FileMeta | null;
    aadhaar: FileMeta | null;
    gst: FileMeta | null;
    iec: FileMeta | null;
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

  consignee: ConsignorForm;

  billingSameAsDelivery: boolean;

  invoiceMode: InvoiceMode;
  uploadedInvoice: FileMeta | null;
  invoiceNumber?: string;

  /** Single currency for the whole shipment — every item's unitValue is in this currency. */
  currency: string;
  items: ShipmentItem[];

  selectedService: ServiceOption | null;
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
}

export type ShipmentOwnerMode = "SELF" | "EXISTING_CLIENT" | "OTHER_PERSON";

export type InvoiceMode = "UPLOAD" | "GENERATE";