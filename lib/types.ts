// -----------------------------------------------------------------------------
// lib/types.ts
//
// Canonical client-side types. These mirror lib/adapters/core/types.ts exactly
// so the form payload and result rendering stay in sync with the adapter layer.
// -----------------------------------------------------------------------------

// -- Request -------------------------------------------------------------------

export interface Address {
  city: string;
  pincode: string;
  countryCode: string; // ISO 3166-1 alpha-2, e.g. "IN", "AU"
  line1?: string;
  country?: string; // Full country name — Aramex requires this
}

export interface Dimensions {
  length: number;
  width: number;
  height: number;
  unit: "cm" | "in";
}

export interface Shipment {
  weight: number;    // kg
  quantity: number;
  dimensions: Dimensions;
  description: string;
}

/** Body sent to POST /api/rates */
export interface RateRequest {
  origin: Address;
  destination: Address;
  shipment: Shipment;
}

// -- Response ------------------------------------------------------------------

export interface Charge {
  name: string;
  amount: number;
  currency: string;
  taxAmount?: number;
}

export interface RateQuote {
  vendorId: string;      // "skart" | "aramex" | …
  vendorName: string;    // "sKart Express" | "Aramex" | …
  productName: string;   // "DHL Express" | "Aramex Priority Parcel Express" | …
  currency: string;      // "INR" | "USD" | …
  totalWithTax: number;
  totalWithoutTax: number;
  tatDays: number;
  charges: Charge[];
}

export interface VendorError {
  vendorId: string;
  vendorName: string;
  message: string;
}

/** Shape returned by POST /api/rates */
export interface RateResponse {
  success: boolean;
  quotes: RateQuote[];
  vendorErrors: VendorError[];
}

// -- Vendor registry (mirrors lib/adapters/vendors/index.ts registrations) -----

export const AVAILABLE_VENDORS = [
  { id: "skart",  label: "sKart Express" },
  { id: "aramex", label: "Aramex"        },
  { id: "shipmozo", label: "Shipmozo"      },
] as const;

export type VendorId = (typeof AVAILABLE_VENDORS)[number]["id"];