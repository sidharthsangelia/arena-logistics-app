/**
 * lib/domestic/domestic.types.ts
 *
 * Shared types for the domestic air rate calculator.
 * Mirrors the shape used by the international RateQuote so the existing
 * RateResultsList / RateResultCard components can be reused with minimal
 * changes (same `vendorId`, `vendorName`, `totalWithTax`, `totalWithoutTax`,
 * `tatDays`, `charges[]`, `currency`, `productName`).
 */

import { CargoType } from "@/generated/prisma";

export const CARGO_TYPES = [
  "GCR",
  "LEAN",
  "SCR",
  "HEA",
  "XPS",
  "DGR",
  "PRIME",
] as const;

export type DomesticCargoType = (typeof CARGO_TYPES)[number];

export const DOMESTIC_VENDORS = [
  { id: "EDS", label: "EDS" },
  { id: "INDIGO", label: "IndiGo CarGo" },
  { id: "AIR_INDIA", label: "Air India Cargo" },
] as const;

export type DomesticVendorId = (typeof DOMESTIC_VENDORS)[number]["id"];

// ---------------------------------------------------------------------------
// Request shape (validated by domesticRateRequestSchema in the form)
// ---------------------------------------------------------------------------

export interface DomesticRateRequest {
  origin: string; // IATA code, e.g. "DEL"
  destination: string; // IATA code, e.g. "BOM"
  cargoType: DomesticCargoType;
  actualWeightKg: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: "cm" | "in";
    quantity: number;
  };
  vendors: DomesticVendorId[]; // empty array = all vendors
}

// ---------------------------------------------------------------------------
// Result shape — matches RateQuote so existing UI components work as-is
// ---------------------------------------------------------------------------

export interface DomesticCharge {
  name: string;
  amount: number;
  currency: string;
  taxAmount?: number;
}

export interface DomesticRateQuote {
  vendorId: string; // lowercased vendor id, used for badge color map / keys
  vendorName: string;
  productName: string; // e.g. "EDS · GCR · DEL → BOM"
  currency: string; // always "INR"
  totalWithoutTax: number;
  totalWithTax: number;
  tatDays: number;
  charges: DomesticCharge[];

  // Extra domestic-specific fields (not used by shared UI but useful in the
  // quote sheet / debugging)
  meta: {
    rateCardId: string;
    versionId: string;
    cargoType: DomesticCargoType;
    chargeableWeightKg: number;
    actualWeightKg: number;
    appliedSlabLabel: string;
    ratePerKg: number | null;
    minCharge: number | null;
  };
}

export interface DomesticVendorError {
  vendorId: string;
  vendorName: string;
  message: string;
}

export interface DomesticRateResult {
  quotes: DomesticRateQuote[];
  vendorErrors: DomesticVendorError[];
}

export const cargoTypeToEnum = (c: DomesticCargoType): CargoType => c as CargoType;