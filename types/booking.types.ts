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

  consignor: ConsignorForm;
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

export type ShipmentOwnerMode = "SELF" | "EXISTING_CLIENT" | "OTHER_PERSON";

export type InvoiceMode = "UPLOAD" | "GENERATE";