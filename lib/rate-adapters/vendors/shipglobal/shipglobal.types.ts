/**
 * SHIPGLOBAL VENDOR TYPES
 * -----------------------------------------------------------------------------
 * Exact shapes of the ShipGlobal rate-calculator request and response.
 * These live ONLY inside this folder — nothing outside should import them.
 *
 * WHY THIS ONE IS ZOD AND THE OTHER THREE ARE PLAIN INTERFACES
 * -----------------------------------------------------------------------------
 * The older adapters cast `res.json()` straight to an interface, which is a
 * promise the compiler cannot keep: a vendor that starts returning `"285.00"`
 * where it used to return `285`, or drops `subtotal_fee` on one lane, produces
 * `NaN` totals that flow through markup and land in front of a customer as a
 * quote. ShipGlobal's response is especially loose — `price` is an open-ended
 * bag of fee keys, not a fixed set — so the response is parsed, not asserted.
 *
 * The schema is deliberately STRICT where the money is and PERMISSIVE
 * everywhere else:
 *   - `title` and `subtotal_fee` are required. A service without them cannot be
 *     priced or displayed, so the whole response is rejected and the failure
 *     surfaces as a normal vendorError instead of a wrong number.
 *   - `price` values are `unknown` on purpose. ShipGlobal is free to add
 *     `fuel_surcharge`, or to send one of them as a string, without us
 *     rejecting an otherwise perfectly good rate — the adapter coerces each
 *     entry and skips what it cannot read.
 *   - Unknown top-level keys are stripped by zod rather than rejected, so a
 *     new field in their response never takes the vendor offline.
 */

import { z } from "zod";

// --- REQUEST ------------------------------------------------------------------

/**
 * The full body ShipGlobal's rate calculator accepts. Note what is NOT here:
 * no dimensions, no piece count, no origin. ShipGlobal prices purely on a
 * single weight plus the destination, and the origin is implied by the
 * authenticated account — which is why the adapter has to send an already
 * normalised CHARGEABLE weight rather than the raw actual weight.
 */
export interface ShipGlobalRateRequest {
  /** Kilograms, as a decimal string. Their own sample sends "0.02" for 20 g. */
  package_weight: string;
  /** ISO 3166-1 alpha-2, uppercase, e.g. "GB". */
  country_iso_code_2: string;
  /** Destination postcode. May be empty for lanes that have none. */
  postcode: string;
}

// --- RESPONSE -----------------------------------------------------------------

/**
 * Accepts a number or a numeric string and yields a finite number.
 *
 * Rate APIs are inconsistent about this within a single response, and JSON has
 * no decimal type, so vendors serialise money both ways. Anything that is not
 * finite after coercion is a hard parse failure — a silent `NaN` in a price is
 * far worse than a vendor error.
 */
const numeric = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(value.trim().replace(/,/g, ""));

  if (!Number.isFinite(parsed)) {
    ctx.addIssue({
      code: "custom",
      message: `Expected a numeric value, received ${JSON.stringify(value)}`,
    });
    return z.NEVER;
  }

  return parsed;
});

/**
 * One quotable service, e.g. "ShipGlobal Direct" or "UPS Promotional".
 *
 * `price` is an open map of fee-name → amount (their sample only ever shows
 * `logistic_fee`, but the key set is theirs to change). It is typed as unknown
 * values so a surprise shape degrades one charge LINE rather than the quote.
 */
export const shipGlobalServiceSchema = z.object({
  title: z.string().trim().min(1),
  notes: z.string().nullish(),
  /** Free text, e.g. "7-10 Days" or "4 - 7 Days". Never a number. */
  transit_time: z.string().nullish(),
  price: z.record(z.string(), z.unknown()).nullish(),
  /** The service total before GST. This is the number the quote is built on. */
  subtotal_fee: numeric,
});

export const shipGlobalRateResponseSchema = z.object({
  success: z.boolean().nullish(),
  billed_weight: numeric.nullish(),
  billed_weight_unit: z.string().nullish(),
  currency: z.string().nullish(),
  services: z.array(shipGlobalServiceSchema).nullish(),
  /** Present on failures. Field name is a guess at their error shape, so both. */
  message: z.string().nullish(),
  error: z.string().nullish(),
});

export type ShipGlobalService = z.infer<typeof shipGlobalServiceSchema>;
export type ShipGlobalRateResponse = z.infer<
  typeof shipGlobalRateResponseSchema
>;
