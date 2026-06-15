/**
 * lib/domestic/domesticSchema.ts
 *
 * Zod schema for the domestic air rate calculator form.
 *
 * NOTES
 * -----
 * - `origin` / `destination` are IATA codes (3 uppercase letters) validated
 *   against the Airport table at submit-time on the server (the form itself
 *   only validates shape — the server action does the existence check and
 *   returns a field-level error if the airport doesn't exist or is inactive).
 * - `dimensions` is optional. If provided, volumetric weight is computed
 *   server-side using each rate card's `volDivisor` (defaults to 6000) and
 *   compared against `actualWeightKg` to get the chargeable weight.
 * - `vendors` empty array means "query all vendors".
 */

import { z } from "zod";
import { CARGO_TYPES, DOMESTIC_VENDORS } from "./domestic.types";
 

const VENDOR_IDS = DOMESTIC_VENDORS.map((v) => v.id) as [string, ...string[]];

export const domesticDimensionsSchema = z.object({
  length: z.number({ error: "Required" }).positive("Must be > 0"),
  width: z.number({ error: "Required" }).positive("Must be > 0"),
  height: z.number({ error: "Required" }).positive("Must be > 0"),
  unit: z.enum(["cm", "in"]),
  quantity: z.number({ error: "Required" }).int().min(1, "Min 1"),
});

export const domesticRateFormSchema = z.object({
  origin: z
    .string()
    .length(3, "Must be a 3-letter IATA code")
    .toUpperCase(),
  destination: z
    .string()
    .length(3, "Must be a 3-letter IATA code")
    .toUpperCase(),
  cargoType: z.enum(CARGO_TYPES, { error: "Select a cargo type" }),
  actualWeightKg: z.number({ error: "Required" }).positive("Must be > 0"),
  useDimensions: z.boolean(),
  dimensions: domesticDimensionsSchema.optional(),
  vendors: z.array(z.enum(VENDOR_IDS)),
}).refine(
  (data) => data.origin !== data.destination,
  {
    message: "Origin and destination must be different",
    path: ["destination"],
  },
).refine(
  (data) => !data.useDimensions || !!data.dimensions,
  {
    message: "Enter dimensions or turn this off",
    path: ["dimensions"],
  },
);

export type DomesticRateFormValues = z.infer<typeof domesticRateFormSchema>;