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

/**
 * One physical box line. `weightKg` is per-box; dims are always centimetres
 * (convert inches at the form boundary). Mirrors CanonicalPackage in
 * lib/pricing/chargeableWeight.ts.
 */
export interface ShipmentPackage {
  quantity: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface Shipment {
  // Legacy single-package fields (weight = TOTAL). Kept for backward compat;
  // when `packages` is set it is the source of truth.
  weight: number;    // kg
  quantity: number;
  dimensions: Dimensions;
  description: string;

  /** Preferred multi-piece shape — one entry per distinct box line. */
  packages?: ShipmentPackage[];
  /** Declared goods value (shipment currency) — needed by Shipmozo for duty. */
  declaredValue?: number;
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

// -- Domestic calculator vendors -----------------------------------------------
// The carriers queried by the DOMESTIC rate calculator. These map to the
// separate domestic adapter registry (lib/rate-adapters/vendors/domestic.index).
// Shipmozo returns many courier options as individual quotes, all under this
// one adapter; add another entry here only when a second domestic adapter ships.
export const DOMESTIC_CALCULATOR_VENDORS = [
  { id: "shipmozo", label: "Shipmozo" },
] as const;

export type DomesticCalculatorVendorId =
  (typeof DOMESTIC_CALCULATOR_VENDORS)[number]["id"];

/** Which calculator a request belongs to — threaded through the shared store. */
export type RateScope = "international" | "domestic";