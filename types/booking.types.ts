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

export interface PackageForm {
  id: string;

  description: string;

  hsCode?: string;

  quantity: number;

  weightKg: number;

  lengthCm: number;
  widthCm: number;
  heightCm: number;

  declaredValue: number;

  countryOfOrigin?: string;

  isStackable?: boolean;

  remarks?: string;
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

  invoice: FileMeta | null;

  consignor: ConsignorForm;

  consignee: ConsignorForm;

  billingSameAsDelivery: boolean;

  invoiceMode: InvoiceMode;

  uploadedInvoice: FileMeta | null;

  generatedInvoice: GeneratedInvoice;

  packages: PackageForm[];

  selectedService: ServiceOption | null;
}

export interface BookingStep {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

export type ShipmentOwnerMode = "SELF" | "EXISTING_CLIENT" | "OTHER_PERSON";

export type InvoiceMode = "UPLOAD" | "GENERATE";

export interface InvoiceItem {
  description: string;

  hsCode: string;

  countryOfOrigin: string;

  quantity: number;

  unitValue: number;

  currency: string;
}

export interface GeneratedInvoice {
  invoiceNumber?: string;

  items: InvoiceItem[];
}

export interface InvoiceItem {
  description: string;

  hsCode: string;

  countryOfOrigin: string;

  quantity: number;

  unitValue: number;

  currency: string;
}
