/**
 * lib/rateSweep/excel/spec.ts
 *
 * What a generated quotation workbook contains, as one validated object.
 *
 * Pure and shared: the builder form constructs one of these, the API route
 * re-validates it, and the workbook builder reads it. Client-side validation is
 * for the person filling the form; the server-side parse is the one that
 * matters, because this object decides whether a file carries raw vendor cost
 * or customer prices and nothing arriving over the wire is trusted to say so.
 */

import { z } from "zod";

import { SWEEP_COUNTRIES, WEIGHT_SLABS_KG } from "../config";

/**
 * Who the file is for. This is the most consequential field in the spec.
 *
 *   CUSTOMER  Marked-up prices. Sourcing vendors masked per carrierBranding.md.
 *             Safe to email.
 *   INTERNAL  Raw vendor cost, every vendor named, margin visible. This is
 *             Arena's buying price and the most commercially sensitive data the
 *             platform holds. Files are stamped so a printed page cannot be
 *             mistaken for a customer one.
 *
 * There is deliberately no default. A missing audience must be a validation
 * error, never a silent fall through to whichever branch happens to be first,
 * because one of those two mistakes emails our cost book to a customer.
 */
export const QuotationAudience = z.enum(["CUSTOMER", "INTERNAL"]);
export type QuotationAudience = z.infer<typeof QuotationAudience>;

/**
 * Shape of the workbook.
 *
 *   BY_SERVICE  One sheet per carrier, plus a summary. The customer picks a
 *               carrier by name, which is what they actually do: some will only
 *               ship DHL, some only FedEx.
 *   CHEAPEST    One sheet, best price per lane and weight, with the carrier
 *               named beside every number. Never an unattributed price: "1,500"
 *               with no carrier is the exact ambiguity this whole exercise
 *               exists to remove.
 */
export const QuotationLayout = z.enum(["BY_SERVICE", "CHEAPEST"]);
export type QuotationLayout = z.infer<typeof QuotationLayout>;

const COUNTRY_CODES = SWEEP_COUNTRIES.map((c) => c.code);

export const quotationSpecSchema = z
  .object({
    /** Which sweep run to price from. Omitted means the latest usable one. */
    runId: z.string().min(1).optional(),

    layout: QuotationLayout,
    audience: QuotationAudience,

    /**
     * Bounded to countries the sweep actually covers. A free-text country would
     * produce a silently empty column, which reads as "we cannot ship there"
     * rather than "we never asked".
     */
    countryCodes: z
      .array(z.enum(COUNTRY_CODES as [string, ...string[]]))
      .min(1, "Pick at least one country")
      .max(SWEEP_COUNTRIES.length),

    /**
     * Bounded to the swept ladder for the same reason. An arbitrary 7kg row
     * cannot be filled from stored data and interpolating one would invent a
     * price.
     */
    weightsKg: z
      .array(z.number().refine((w) => WEIGHT_SLABS_KG.includes(w), "Not a swept weight slab"))
      .min(1, "Pick at least one weight"),

    /**
     * Carrier codes to give a sheet each. Empty means every carrier present in
     * the data. Only read for BY_SERVICE.
     */
    carriers: z.array(z.string().min(1)).default([]),

    /**
     * Percentage added to raw vendor cost for a customer file, via the same
     * lib/pricing/markup.ts path the live calculator uses, so a customer cannot
     * be shown two different prices for the same lane depending on which
     * surface they looked at.
     */
    markupPercent: z.number().min(0).max(500).default(0),

    /** Printed on the cover. Free text, e.g. the client's name. */
    preparedFor: z.string().trim().max(120).default(""),

    /**
     * Set when the card is for somebody already on the books, so it can be
     * surfaced on their page later. Optional on purpose: the common case is a
     * prospect who is not a client yet, and requiring one would block it.
     *
     * Never printed on the file — the cover shows preparedFor, which the picker
     * fills in from the client's name. This is only the link for the history.
     */
    clientId: z.string().min(1).nullish().default(null),

    /** How long the quote is offered for. Printed prominently on every sheet. */
    validityDays: z.number().int().min(1).max(90).default(15),

    /**
     * Include duty-unpaid services. Off by default and deliberately awkward to
     * turn on: a DDU rate sitting in the same column as DDP rates wins on price
     * and hands the customer a customs bill at the door.
     */
    includeDutyUnpaid: z.boolean().default(false),

    /**
     * Include services carrying a restriction ("Gifts only", "B2B only"). Off
     * by default for the same reason: they cannot be sold for a general
     * consignment.
     */
    includeRestricted: z.boolean().default(false),
  })
  .refine(
    (spec) => spec.audience === "INTERNAL" || spec.markupPercent > 0,
    {
      // The one cross-field rule worth blocking on. A customer file at 0%
      // markup is our cost book with a customer's name on the cover, and it is
      // an easy thing to produce by leaving a field alone.
      message: "A customer file needs a markup. At 0% it shows raw vendor cost.",
      path: ["markupPercent"],
    },
  );

export type QuotationSpec = z.infer<typeof quotationSpecSchema>;

/** Sensible starting point for the builder form. */
export function defaultQuotationSpec(): QuotationSpec {
  return {
    layout: "BY_SERVICE",
    audience: "CUSTOMER",
    countryCodes: ["US", "GB", "AE", "AU", "DE"],
    weightsKg: WEIGHT_SLABS_KG.filter((w) => w <= 30),
    carriers: [],
    markupPercent: 25,
    preparedFor: "",
    clientId: null,
    validityDays: 15,
    includeDutyUnpaid: false,
    includeRestricted: false,
  };
}

/**
 * Filename for the download.
 *
 * Carries the audience word for internal files. Somebody will keep one of these
 * in a downloads folder next to a customer one, and at that point the filename
 * is the only thing distinguishing them.
 */
export function quotationFilename(spec: QuotationSpec, date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  const who = spec.preparedFor
    ? `-${spec.preparedFor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}`
    : "";
  const kind = spec.layout === "CHEAPEST" ? "best-rates" : "rate-card";
  const mark = spec.audience === "INTERNAL" ? "-INTERNAL" : "";

  return `arena-${kind}${who}-${stamp}${mark}.xlsx`;
}
