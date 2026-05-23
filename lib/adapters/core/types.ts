/**
 * CANONICAL TYPES
 * -----------------------------------------------------------------------------
 * These are the "language" the entire app speaks internally.
 * Every vendor adapter MUST translate FROM these types (input) and
 * translate TO these types (output). Never let vendor-specific shapes
 * leak outside the adapter's own folder.
 */

// --- INPUT -------------------------------------------------------------------

export interface CanonicalAddress {
  line1?: string;
  city: string;
  pincode?: string;
  countryCode: string;   // ISO 2-letter, e.g. "IN", "AE", "AU"
  country?: string;      // Full name when vendors need it, e.g. "AUSTRALIA"
  stateCode?: string;
}

export interface CanonicalDimensions {
  length: number;
  width: number;
  height: number;
  unit: "cm" | "in";
}

export interface CanonicalShipmentDetails {
  weight: number;          // always in KG
  quantity: number;
  dimensions: CanonicalDimensions;
  description?: string;
  goodsOriginCountry?: string;
}

/**
 * The single, unified input shape that the API route accepts.
 * Adapters receive this and convert it to vendor-specific shapes.
 */
export interface CanonicalRateRequest {
  origin: CanonicalAddress;
  destination: CanonicalAddress;
  shipment: CanonicalShipmentDetails;
}

// --- OUTPUT ------------------------------------------------------------------

export interface CanonicalChargeBreakdown {
  name: string;
  amount: number;
  currency: string;  // "INR", "USD", etc.
  igst?: number;
  cgst?: number;
  sgst?: number;
  taxAmount?: number;
}

/**
 * One rate quote from one vendor product.
 * All adapters must produce this shape.
 */
export interface RateQuote {
  vendorId: string;          // e.g. "skart", "aramex"
  vendorName: string;        // e.g. "sKart Express", "Aramex"
  productName: string;       // e.g. "DHL Express", "Aramex Exp DEL"
  currency: string;
  totalWithTax: number;
  totalWithoutTax: number;
  tatDays: number;           // transit days; 0 = unknown
  charges: CanonicalChargeBreakdown[];
}

/**
 * The unified API response shape returned to the client.
 */
export interface CanonicalRateResponse {
  success: boolean;
  quotes: RateQuote[];
  vendorErrors: VendorError[];  // partial failures are surfaced, not swallowed
}

export interface VendorError {
  vendorId: string;
  vendorName: string;
  message: string;
  raw?: unknown;  // original error for debugging; never expose to end users
}