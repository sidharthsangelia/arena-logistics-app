/**
 * lib/publicApi/schema.ts
 * -----------------------------------------------------------------------------
 * The validation boundary. Nothing reaches an adapter, a vendor or the database
 * until it has been through here.
 *
 * The old POST /api/rates checked that three keys existed and passed the rest
 * of the body straight to four vendor APIs, with a comment reading "In
 * production, swap this with zod.parse()". That is what this is.
 *
 * ── DESIGN RULES ────────────────────────────────────────────────────────────
 *  - Reject early, name the field. A 422 that says `shipment.packages.0.weightKg
 *    must be greater than 0` is one message to their developer; a vendor
 *    rejecting the same body is a support thread.
 *  - Bound every number. Not for correctness but for cost: a 10,000 kg parcel
 *    or a 400-box array is a request we should refuse locally rather than pay
 *    four vendors to refuse for us.
 *  - `.strict()` on every object. An unknown key is almost always a typo
 *    (`weigth`, `pinCode`), and silently ignoring it produces a quote for a
 *    shipment the caller did not describe. Refusing it is how they find the
 *    typo in ten seconds instead of at the invoice.
 *  - Accept both request shapes. `packages[]` is preferred and is what the
 *    booking flow uses; the flat weight/quantity/dimensions form is kept
 *    because it is simpler for a one-box quote and it is what the internal
 *    types still call the legacy shape.
 */

import { z } from "zod";

import type { CanonicalRateRequest } from "@/lib/rate-adapters/core/types";
import { vendorCountryName } from "./countries";
import { SYNTHETIC_POSTCODE, countryHasNoPostcode } from "./postcodes";
import type { ApiFieldIssue } from "./errors";

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------
// Every ceiling here is a cost control, not a business rule. They are set well
// above anything a real parcel shipment produces, so a legitimate caller never
// meets one.

const MAX_WEIGHT_KG = 1000;
const MAX_DIMENSION_CM = 400;
const MAX_QUANTITY = 200;
const MAX_PACKAGE_LINES = 50;
const MAX_DECLARED_VALUE = 100_000_000;

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

/**
 * ISO 3166-1 alpha-2, upper-cased for the adapters.
 *
 * Length is checked but membership is not: a hard-coded country list in this
 * file would be a second source of truth about what we serve, and it would be
 * the one that goes stale. The vendors are the authority on serviceability, and
 * an unknown code comes back as a clean NO_SERVICE warning.
 */
const countryCode = z
  .string()
  .trim()
  .length(2, "Use a 2-letter ISO country code, e.g. IN, AE, US")
  .transform((v) => v.toUpperCase());

/** Indian PIN code. Six digits, never starting at zero. */
const indianPincode = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, "Must be a 6-digit Indian PIN code");

const addressSchema = z
  .object({
    line1: nonEmpty(200).optional(),
    city: nonEmpty(100),
    pincode: nonEmpty(20).optional(),
    countryCode,
    country: nonEmpty(100).optional(),
    stateCode: nonEmpty(10).optional(),
  })
  .strict();

const dimensionsSchema = z
  .object({
    length: z.number().positive().max(MAX_DIMENSION_CM),
    width: z.number().positive().max(MAX_DIMENSION_CM),
    height: z.number().positive().max(MAX_DIMENSION_CM),
    // Centimetres unless stated. Inches are converted by the adapters, not here.
    unit: z.enum(["cm", "in"]).default("cm"),
  })
  .strict();

const packageSchema = z
  .object({
    quantity: z.number().int().positive().max(MAX_QUANTITY),
    /** Actual weight PER BOX, kilograms. Not the line total. */
    weightKg: z.number().positive().max(MAX_WEIGHT_KG),
    lengthCm: z.number().positive().max(MAX_DIMENSION_CM),
    widthCm: z.number().positive().max(MAX_DIMENSION_CM),
    heightCm: z.number().positive().max(MAX_DIMENSION_CM),
  })
  .strict();

/**
 * Shipment fields shared by both calculators.
 *
 * `weight`, `quantity` and `dimensions` are optional in the schema but one of
 * the two shapes is required by the refinement below — expressing that as a
 * union produced error messages that named neither branch usefully.
 */
const baseShipmentShape = {
  /** TOTAL shipment weight in kg. Required unless `packages` is given. */
  weight: z.number().positive().max(MAX_WEIGHT_KG).optional(),
  /** Number of boxes. Required unless `packages` is given. */
  quantity: z.number().int().positive().max(MAX_QUANTITY).optional(),
  dimensions: dimensionsSchema.optional(),
  /** Preferred. One entry per distinct box line; overrides the flat fields. */
  packages: z.array(packageSchema).min(1).max(MAX_PACKAGE_LINES).optional(),
  description: nonEmpty(500).optional(),
  /** Declared value of the goods. Drives duty on international lanes. */
  declaredValue: z.number().nonnegative().max(MAX_DECLARED_VALUE).optional(),
};

function requireOneShape(
  shipment: { packages?: unknown[]; weight?: number; quantity?: number; dimensions?: unknown },
  ctx: z.RefinementCtx,
): void {
  if (shipment.packages && shipment.packages.length > 0) return;

  const missing: string[] = [];
  if (shipment.weight === undefined) missing.push("weight");
  if (shipment.quantity === undefined) missing.push("quantity");
  if (shipment.dimensions === undefined) missing.push("dimensions");

  if (missing.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: missing,
      message:
        "Provide either shipment.packages[], or all of shipment.weight, " +
        "shipment.quantity and shipment.dimensions.",
    });
  }
}

// ---------------------------------------------------------------------------
// International
// ---------------------------------------------------------------------------

/**
 * The India end of an export.
 *
 * Unlike the generic address above, `pincode` is required and must be a real
 * Indian PIN. Every international source rates the first mile from it, and not
 * one of them degrades gracefully without it: Shipmozo refuses the request
 * outright, sKart answers 422, Aramex answers "OriginAddress - Invalid
 * Zipcode". An optional origin PIN was therefore not a lenient contract, it was
 * a request that returned no quotes at all, which is the harder failure to
 * diagnose from the far side of an HTTP call.
 */
const internationalOriginSchema = z
  .object({
    line1: nonEmpty(200).optional(),
    city: nonEmpty(100),
    pincode: indianPincode,
    countryCode,
    country: nonEmpty(100).optional(),
    stateCode: nonEmpty(10).optional(),
  })
  .strict();

const internationalShipmentSchema = z
  .object({
    ...baseShipmentShape,
    goodsOriginCountry: nonEmpty(100).optional(),
    /** Shipmozo hint. Ignored by every other source. */
    packageType: z.enum(["SPS", "MPS", "B2B"]).optional(),
    /** Shipmozo hint: which export scheme the paperwork follows. */
    shipmentPurpose: z.enum(["DCSB4", "SCSB4", "CSB5"]).optional(),
  })
  .strict()
  .superRefine(requireOneShape);

export const internationalRateRequestSchema = z
  .object({
    origin: internationalOriginSchema,
    destination: addressSchema,
    shipment: internationalShipmentSchema,
    /**
     * Restrict the fan-out to named sources. Almost nobody should send this:
     * the point of the endpoint is that we ask everyone and return the cheapest
     * first. Kept for debugging a single source.
     */
    vendorIds: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.origin.countryCode !== "IN") {
      ctx.addIssue({
        code: "custom",
        path: ["origin", "countryCode"],
        message: "Exports are quoted from India only. origin.countryCode must be IN.",
      });
    }

    if (value.destination.countryCode === "IN") {
      ctx.addIssue({
        code: "custom",
        path: ["destination", "countryCode"],
        message:
          "This endpoint quotes exports. For India-to-India use /api/v1/rates/domestic.",
      });
    }

    // Several carriers rate door delivery by postcode, and a quote produced
    // without one is a country-level estimate wearing a door-level price tag.
    // Required, therefore, everywhere a postal system exists. Where one does
    // not, asking for it would be asking the caller to invent it, so it is
    // filled in for them. See ./postcodes.
    if (!value.destination.pincode && !countryHasNoPostcode(value.destination.countryCode)) {
      ctx.addIssue({
        code: "custom",
        path: ["destination", "pincode"],
        message:
          `destination.pincode is required for ${value.destination.countryCode}. ` +
          "Send the delivery postcode, or \"" + SYNTHETIC_POSTCODE + "\" if the destination has none.",
      });
    }
  });

// ---------------------------------------------------------------------------
// Domestic
// ---------------------------------------------------------------------------

const domesticShipmentSchema = z
  .object({
    ...baseShipmentShape,
    /** COD is priced, never switched on afterwards: the fee varies by courier. */
    paymentType: z.enum(["PREPAID", "COD"]).default("PREPAID"),
    /** What the courier collects from the receiver. Required when COD. */
    codAmount: z.number().positive().max(MAX_DECLARED_VALUE).optional(),
  })
  .strict()
  .superRefine((shipment, ctx) => {
    requireOneShape(shipment, ctx);

    if (shipment.paymentType === "COD" && shipment.codAmount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["codAmount"],
        message: "shipment.codAmount is required when paymentType is COD.",
      });
    }
  });

/**
 * Domestic addresses are a PIN code pair. City is required by the canonical
 * type but the couriers rate on the PIN alone, so a caller who only holds PIN
 * codes is not forced to look cities up — see `toCanonicalDomestic`.
 */
const domesticAddressSchema = z
  .object({
    line1: nonEmpty(200).optional(),
    city: nonEmpty(100).optional(),
    pincode: indianPincode,
    countryCode: countryCode.optional(),
    stateCode: nonEmpty(10).optional(),
  })
  .strict();

export const domesticRateRequestSchema = z
  .object({
    origin: domesticAddressSchema,
    destination: domesticAddressSchema,
    shipment: domesticShipmentSchema,
    vendorIds: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export const trackQuerySchema = z
  .object({
    /**
     * Our shipment number (ARN…) or a carrier waybill. Which one it is gets
     * worked out downstream; a caller holding a number off a label should not
     * have to know what kind of number it is.
     */
    query: z
      .string()
      .trim()
      .min(3, "Enter a shipment number or waybill")
      .max(50)
      // Every waybill format in use is alphanumeric with dashes or slashes.
      // Anything else is a probe, and refusing it here keeps it out of the
      // database query and out of the vendor fan-out.
      .regex(/^[A-Za-z0-9/-]+$/, "A shipment number or waybill contains only letters, digits, - and /"),
  })
  .strict();

// ---------------------------------------------------------------------------
// Canonical conversion
// ---------------------------------------------------------------------------

export type InternationalRateInput = z.infer<typeof internationalRateRequestSchema>;
export type DomesticRateInput = z.infer<typeof domesticRateRequestSchema>;

/**
 * Fill the flat weight/quantity/dimensions fields from `packages` when the
 * caller sent the multi-piece shape.
 *
 * The canonical type requires them, and the adapters that cannot take an array
 * read them. Total weight is the sum of `weightKg x quantity` across lines, and
 * the representative box is the largest by volume — the same choice the booking
 * flow makes, so a quote and a booking of the same parcel agree.
 */
function fillLegacyFields(shipment: {
  packages?: z.infer<typeof packageSchema>[];
  weight?: number;
  quantity?: number;
  dimensions?: z.infer<typeof dimensionsSchema>;
}) {
  if (!shipment.packages || shipment.packages.length === 0) {
    return {
      weight: shipment.weight!,
      quantity: shipment.quantity!,
      dimensions: shipment.dimensions!,
    };
  }

  const totalWeight = shipment.packages.reduce(
    (sum, p) => sum + p.weightKg * p.quantity,
    0,
  );
  const totalQuantity = shipment.packages.reduce((sum, p) => sum + p.quantity, 0);

  const largest = shipment.packages.reduce((biggest, p) =>
    p.lengthCm * p.widthCm * p.heightCm >
    biggest.lengthCm * biggest.widthCm * biggest.heightCm
      ? p
      : biggest,
  );

  return {
    weight: Number(totalWeight.toFixed(3)),
    quantity: totalQuantity,
    dimensions: {
      length: largest.lengthCm,
      width: largest.widthCm,
      height: largest.heightCm,
      unit: "cm" as const,
    },
  };
}

export function toCanonicalInternational(
  input: InternationalRateInput,
): CanonicalRateRequest {
  const legacy = fillLegacyFields(input.shipment);

  // Validation has already established that an absent pincode here means a
  // country with no postal system, so this is a fill rather than a guess. The
  // value matches what the rate sweep sends for the same lanes, which keeps a
  // live quote and a swept row describing the same request.
  //
  // The country NAME is filled from the code on both ends. Some sources are
  // sent the name and never the code, so leaving it undefined is how a
  // code-only request ends up with fewer quotes than the same lane priced in
  // our own calculator. See ./countries.
  const origin = {
    ...input.origin,
    country: vendorCountryName(input.origin.countryCode, input.origin.country),
  };

  const destination = {
    ...input.destination,
    pincode: input.destination.pincode ?? SYNTHETIC_POSTCODE,
    country: vendorCountryName(
      input.destination.countryCode,
      input.destination.country,
    ),
  };

  return {
    origin,
    destination,
    shipment: {
      ...legacy,
      packages: input.shipment.packages,
      description: input.shipment.description,
      declaredValue: input.shipment.declaredValue,
      goodsOriginCountry: input.shipment.goodsOriginCountry,
      packageType: input.shipment.packageType,
      shipmentPurpose: input.shipment.shipmentPurpose,
    },
  };
}

export function toCanonicalDomestic(input: DomesticRateInput): CanonicalRateRequest {
  const legacy = fillLegacyFields(input.shipment);

  // The couriers rate domestic lanes on the PIN code. City is required by the
  // canonical address type and is only ever echoed back in vendor payloads, so
  // an absent one becomes the PIN rather than forcing a lookup on the caller.
  const address = (a: z.infer<typeof domesticAddressSchema>) => ({
    line1: a.line1,
    city: a.city ?? a.pincode,
    pincode: a.pincode,
    countryCode: a.countryCode ?? "IN",
    stateCode: a.stateCode,
  });

  return {
    origin: address(input.origin),
    destination: address(input.destination),
    shipment: {
      ...legacy,
      packages: input.shipment.packages,
      description: input.shipment.description,
      declaredValue: input.shipment.declaredValue,
      paymentType: input.shipment.paymentType,
      codAmount: input.shipment.codAmount,
    },
  };
}

/** Flatten zod issues into the documented `details` array. */
export function toFieldIssues(error: z.ZodError): ApiFieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
