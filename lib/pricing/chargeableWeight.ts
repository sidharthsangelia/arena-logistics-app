/**
 * lib/pricing/chargeableWeight.ts
 * -----------------------------------------------------------------------------
 * Pure, dependency-free math for INTERNATIONAL air-freight chargeable weight.
 *
 * This is the single source of truth for how a multi-piece shipment collapses
 * into one billable weight. It is imported by:
 *   - every vendor adapter (server) that has to normalise a multi-piece
 *     shipment before hitting an API that can't take a per-box array
 *   - the rate-calculator form + booking service step (client) to SHOW the
 *     chargeable weight that actually drives the price
 *
 * Because rating is the most price-sensitive part of the business, the method
 * is fixed and explicit — "compare per package, then sum":
 *
 *   for each package (box line):
 *     volumetricPerBox = (L × W × H in cm) / DIVISOR
 *     chargeablePerBox = max(actualWeightPerBox, volumetricPerBox)
 *     lineChargeable   = chargeablePerBox × quantity
 *   totalChargeable = Σ lineChargeable
 *
 * Worked example (the canonical one this module is validated against):
 *   Package 1: 2 kg, 30×20×10 cm  → vol = 6000/5000  = 1.2  → max(2,1.2)  = 2
 *   Package 2: 5 kg, 50×40×30 cm  → vol = 60000/5000 = 12   → max(5,12)   = 12
 *   Total chargeable = 2 + 12 = 14 kg
 *
 * NOTE: This is the "per-package max, then sum" method — deliberately NOT
 * "sum actual vs. sum volumetric, then max", which would give 13.2 kg here.
 * The per-package method is what freight forwarders bill on, and it never
 * under-charges, so the sell price can never fall below vendor cost.
 *
 * DIVISOR: 5000 is the express/courier standard (DHL, FedEx, UPS, Aramex).
 * The DOMESTIC calculator uses a different divisor and is intentionally NOT
 * touched by this module.
 */

/** Volumetric divisor for international express/courier air freight (cm³ → kg). */
export const INTERNATIONAL_VOLUMETRIC_DIVISOR = 5000;

/**
 * One physical package "line": `quantity` identical boxes, each `weightKg`
 * (actual weight PER box) and each `lengthCm × widthCm × heightCm`.
 * Dimensions are ALWAYS centimetres — convert inches at the input boundary.
 */
export interface CanonicalPackage {
  quantity: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface PackageWeight {
  quantity: number;
  actualPerBoxKg: number;
  volumetricPerBoxKg: number;
  chargeablePerBoxKg: number;
  lineActualKg: number;
  lineVolumetricKg: number;
  lineChargeableKg: number;
}

export interface ShipmentWeightBreakdown {
  totalPieces: number;
  totalActualKg: number;
  totalVolumetricKg: number;
  /** The billable weight — this is the number that drives the price. */
  totalChargeableKg: number;
  /** Longest single side across every box (cm) — some vendors need this. */
  maxLongestSideCm: number;
  perPackage: PackageWeight[];
}

// --- rounding ---------------------------------------------------------------
// Keep 2-decimal precision internally; each vendor applies its own slab/round.

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function safeNum(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Volumetric weight (kg) of a single box for a given divisor. */
export function boxVolumetricKg(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  divisor: number = INTERNATIONAL_VOLUMETRIC_DIVISOR,
): number {
  const d = safeNum(divisor) || INTERNATIONAL_VOLUMETRIC_DIVISOR;
  const vol = (safeNum(lengthCm) * safeNum(widthCm) * safeNum(heightCm)) / d;
  return round2(vol);
}

/**
 * Collapses a multi-piece shipment into a single chargeable weight using the
 * per-package method above. Never throws — bad/missing numbers coerce to 0 so
 * one malformed box can't take down a whole quote.
 */
export function computeShipmentWeights(
  packages: CanonicalPackage[],
  divisor: number = INTERNATIONAL_VOLUMETRIC_DIVISOR,
): ShipmentWeightBreakdown {
  const perPackage: PackageWeight[] = [];

  let totalPieces = 0;
  let totalActualKg = 0;
  let totalVolumetricKg = 0;
  let totalChargeableKg = 0;
  let maxLongestSideCm = 0;

  for (const pkg of packages ?? []) {
    const quantity = Math.max(1, Math.trunc(safeNum(pkg.quantity) || 1));
    const actualPerBoxKg = safeNum(pkg.weightKg);
    const volumetricPerBoxKg = boxVolumetricKg(
      pkg.lengthCm,
      pkg.widthCm,
      pkg.heightCm,
      divisor,
    );
    const chargeablePerBoxKg = round2(
      Math.max(actualPerBoxKg, volumetricPerBoxKg),
    );

    const lineActualKg = round2(actualPerBoxKg * quantity);
    const lineVolumetricKg = round2(volumetricPerBoxKg * quantity);
    const lineChargeableKg = round2(chargeablePerBoxKg * quantity);

    const longestSide = Math.max(
      safeNum(pkg.lengthCm),
      safeNum(pkg.widthCm),
      safeNum(pkg.heightCm),
    );
    if (longestSide > maxLongestSideCm) maxLongestSideCm = longestSide;

    totalPieces += quantity;
    totalActualKg = round2(totalActualKg + lineActualKg);
    totalVolumetricKg = round2(totalVolumetricKg + lineVolumetricKg);
    totalChargeableKg = round2(totalChargeableKg + lineChargeableKg);

    perPackage.push({
      quantity,
      actualPerBoxKg,
      volumetricPerBoxKg,
      chargeablePerBoxKg,
      lineActualKg,
      lineVolumetricKg,
      lineChargeableKg,
    });
  }

  return {
    totalPieces,
    totalActualKg,
    totalVolumetricKg,
    totalChargeableKg,
    maxLongestSideCm,
    perPackage,
  };
}

/**
 * Resolves the package list an adapter should rate against. Prefers an
 * explicit per-box `packages` array (the path both the rate calculator and
 * booking now use). Falls back to the legacy single-shape fields
 * (`weight` = TOTAL shipment weight, `quantity` = pieces, one `dimensions`)
 * so external `/api/rates` callers on the old contract keep working — the
 * total weight is spread evenly across the pieces so the per-package math
 * still yields the mathematically correct chargeable weight for identical
 * boxes.
 *
 * Takes only the primitive fields it needs (not the full CanonicalRateRequest)
 * to stay dependency-free and avoid an import cycle with core/types.ts.
 */
export function normalizePackages(input: {
  packages?: CanonicalPackage[] | null;
  weight?: number;
  quantity?: number;
  dimensions?: { length: number; width: number; height: number };
}): CanonicalPackage[] {
  if (input.packages && input.packages.length > 0) {
    return input.packages;
  }

  const qty = Math.max(1, Math.trunc(safeNum(input.quantity) || 1));
  const totalWeight = safeNum(input.weight);
  const d = input.dimensions ?? { length: 0, width: 0, height: 0 };

  return [
    {
      quantity: qty,
      // legacy `weight` is the TOTAL — convert to per-box for the package model
      weightKg: round2(totalWeight / qty),
      lengthCm: safeNum(d.length),
      widthCm: safeNum(d.width),
      heightCm: safeNum(d.height),
    },
  ];
}
