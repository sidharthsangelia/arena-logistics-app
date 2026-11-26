/**
 * lib/booking/boxSize.ts
 *
 * The rules behind the box-size helpers shown wherever a customer types a box's
 * length, breadth and height: the rate calculators (international + domestic,
 * tenant + Arena) and the booking wizard's items step.
 *
 *   • cm / inches conversion (sizes are always stored and priced in cm)
 *   • one-click common carton sizes
 *   • gentle, never-blocking hints when a number looks mistyped
 *   • the per-box size (volumetric) weight line
 *
 * Plain module on purpose: the help docs read the thresholds from here so the
 * guide can never quote a number the form does not use.
 */

import { VOLUMETRIC_DIVISOR } from "./cargo";

export type SizeUnit = "cm" | "in";

export const CM_PER_INCH = 2.54;

/** A typed size, in the unit the user picked, to cm. */
export function toCm(value: number, unit: SizeUnit): number {
  const n = Number(value) || 0;
  return unit === "in" ? n * CM_PER_INCH : n;
}

/** A stored cm size, shown in the unit the user picked, to 2 decimals. */
export function fromCm(cm: number, unit: SizeUnit): number {
  const n = Number(cm) || 0;
  const v = unit === "in" ? n / CM_PER_INCH : n;
  return Math.round(v * 100) / 100;
}

/** Short unit suffix for labels. */
export function unitLabel(unit: SizeUnit): string {
  return unit === "in" ? "in" : "cm";
}

// ---------------------------------------------------------------------------
// Common carton sizes
// ---------------------------------------------------------------------------

export interface BoxPreset {
  id: string;
  label: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/** Generic courier carton sizes, L × B × H in cm. Edit here to change them everywhere. */
export const BOX_PRESETS: readonly BoxPreset[] = [
  { id: "small", label: "Small", lengthCm: 30, widthCm: 20, heightCm: 15 },
  { id: "medium", label: "Medium", lengthCm: 40, widthCm: 30, heightCm: 30 },
  { id: "large", label: "Large", lengthCm: 50, widthCm: 40, heightCm: 40 },
  { id: "xl", label: "XL", lengthCm: 60, widthCm: 50, heightCm: 50 },
];

export function presetDimensions(p: BoxPreset): string {
  return `${p.lengthCm}×${p.widthCm}×${p.heightCm}`;
}

/** The preset a box already matches exactly (in cm), if any. */
export function matchingPreset(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
): BoxPreset | undefined {
  const close = (a: number, b: number) => Math.abs((Number(a) || 0) - b) < 0.05;
  return BOX_PRESETS.find(
    (p) => close(lengthCm, p.lengthCm) && close(widthCm, p.widthCm) && close(heightCm, p.heightCm),
  );
}

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------

/** Any side longer than this (cm) is more likely mm typed as cm than a real box. */
export const LONG_SIDE_CM = 150;

/** With inches picked, a side over this many inches is more likely a cm figure. */
export const LIKELY_CM_IN_INCHES = 60;

/** Size weight this many times the real weight or more: the carton is probably oversized. */
export const BULKY_RATIO = 3;

export interface BoxSizeInput {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  /** The unit the sizes were typed in. Only changes which hint explains a big number. */
  unit: SizeUnit;
}

export type BoxSizeWarning = "cm-as-inches" | "long-side" | "bulky";

export interface BoxSizeReading {
  /** All three sides entered. */
  hasSize: boolean;
  /** Size (volumetric) weight of one box, kg, 2 decimals. 0 until all sides are in. */
  sizeWeightKg: number;
  /** Real weight of one box, kg. */
  actualKg: number;
  /** Size weight is what this box is billed on. */
  chargedBySize: boolean;
  warnings: { kind: BoxSizeWarning; text: string }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function readBoxSize(input: BoxSizeInput): BoxSizeReading {
  const l = Number(input.lengthCm) || 0;
  const b = Number(input.widthCm) || 0;
  const h = Number(input.heightCm) || 0;
  const actualKg = Number(input.weightKg) || 0;
  const hasSize = l > 0 && b > 0 && h > 0;
  const sizeWeightKg = hasSize ? round2((l * b * h) / VOLUMETRIC_DIVISOR) : 0;
  const chargedBySize = hasSize && sizeWeightKg > actualKg;

  const warnings: BoxSizeReading["warnings"] = [];
  const longestCm = Math.max(l, b, h);

  // One explanation for a big number, picked by the unit it was typed in: the
  // inches hint already covers what the cm one would say.
  if (input.unit === "in" && longestCm > LIKELY_CM_IN_INCHES * CM_PER_INCH) {
    warnings.push({
      kind: "cm-as-inches",
      text: `Over ${LIKELY_CM_IN_INCHES} inches is unusual for a box. Did you mean cm?`,
    });
  } else if (input.unit === "cm" && longestCm > LONG_SIDE_CM) {
    warnings.push({
      kind: "long-side",
      text: `A side over ${LONG_SIDE_CM} cm is unusual. Check it is in cm, not mm.`,
    });
  }

  if (hasSize && actualKg > 0 && sizeWeightKg >= actualKg * BULKY_RATIO) {
    warnings.push({
      kind: "bulky",
      text: "This box is priced on its size. A snugger carton could cost less.",
    });
  }

  return { hasSize, sizeWeightKg, actualKg, chargedBySize, warnings };
}
