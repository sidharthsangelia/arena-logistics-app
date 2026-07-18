/**
 * lib/booking/cargo.ts
 *
 * Shared derivations over the booking's boxes → items structure. One source of
 * truth for totals so the packages step, rate request, KYC threshold,
 * createShipment and the review screen never compute them differently.
 *
 * Everything coerces with Number(...) because these values cross the
 * client → server (JSON) boundary and can arrive as numeric strings.
 */

import type { CargoBox } from "@/types/booking.types";

/** Declared value of the items in ONE box (not multiplied by box quantity). */
export function boxDeclaredValue(box: CargoBox): number {
  return (box.contents ?? []).reduce(
    (sum, it) => sum + Number(it.unitValue) * Number(it.quantity),
    0,
  );
}

/** Total declared value across all boxes, accounting for box quantity. */
export function totalDeclaredValue(boxes: CargoBox[]): number {
  return (boxes ?? []).reduce(
    (sum, box) => sum + Number(box.quantity) * boxDeclaredValue(box),
    0,
  );
}

/** Total actual weight (kg) across all boxes, accounting for box quantity. */
export function totalActualWeight(boxes: CargoBox[]): number {
  return (boxes ?? []).reduce(
    (sum, box) => sum + Number(box.weightKg) * Number(box.quantity),
    0,
  );
}

/** Total number of physical boxes (sum of each box's quantity). */
export function totalBoxCount(boxes: CargoBox[]): number {
  return (boxes ?? []).reduce((sum, box) => sum + Number(box.quantity), 0);
}

/**
 * The rate-request package array: one entry per box, each carrying its own
 * per-box weight, dimensions and quantity. Adapters decide how to consume it
 * (Shipmozo multi-box natively; others collapse to one chargeable weight).
 */
export function boxesToRatePackages(boxes: CargoBox[]) {
  return (boxes ?? []).map((box) => ({
    quantity: Math.max(1, Math.trunc(Number(box.quantity) || 1)),
    weightKg: Number(box.weightKg) || 0,
    lengthCm: Number(box.lengthCm) || 0,
    widthCm: Number(box.widthCm) || 0,
    heightCm: Number(box.heightCm) || 0,
  }));
}

/**
 * CSB4 is only valid while the total declared value stays under this
 * threshold; at/above it the shipment must be CSB5 or COMMERCIAL.
 */
export const CSB4_MAX_VALUE = 25_000;

export function isCsb4Allowed(totalValue: number): boolean {
  return totalValue < CSB4_MAX_VALUE;
}
