import { z } from "zod";

import { KYC_NUMBER_SPECS, type KycNumberKind } from "@/lib/kyc/idNumbers";

/**
 * An optional KYC number typed into the client form: blank is allowed, anything
 * else must be valid, and it comes out normalised (uppercase, no spaces). Same
 * rules as the KYC upload; see lib/kyc/idNumbers.ts.
 */
function optionalKycNumber(kind: KycNumberKind) {
  const spec = KYC_NUMBER_SPECS[kind];
  return z
    .string()
    .optional()
    .transform((v) => spec.normalise(v ?? ""))
    .refine((v) => !v || spec.validate(v) === null, {
      message: `That does not look like a valid ${spec.label}.`,
    });
}

export const clientSchema = z
  .object({
    /**
     * COMPANY needs a company name; INDIVIDUAL needs the person's name and has
     * no company. See lib/clients/clientKind.ts. Defaults to COMPANY so older
     * callers that only send a company name keep working.
     */
    companyKind: z.enum(["COMPANY", "INDIVIDUAL"]).default("COMPANY"),

    contactName: z.string().trim().max(200).optional(),

    companyName: z.string().trim().max(200).optional(),

    email: z
      .string()
      .trim()
      .email("Invalid email")
      .optional()
      .or(z.literal("")),

    phone: z.string().trim().max(50).optional(),

    addressLine1: z.string().trim().max(500).optional(),

    city: z.string().trim().max(100).optional(),

    state: z.string().trim().max(100).optional(),

    country: z.string().trim().max(100).optional(),

    postalCode: z.string().trim().max(50).optional(),

    notes: z.string().trim().max(5000).optional(),

    // Optional identity numbers. The Aadhaar is never stored as typed: the action
    // keeps it masked for display and encrypted for carriers (lib/kyc/aadhaarVault.ts).
    // On an edit, a blank Aadhaar keeps the one on file, since it cannot be shown.
    gstin: optionalKycNumber("gst"),
    panNumber: optionalKycNumber("pan"),
    aadhaarNumber: optionalKycNumber("aadhaar"),
  })
  .superRefine((v, ctx) => {
    if (v.companyKind === "COMPANY" && !v.companyName) {
      ctx.addIssue({ code: "custom", path: ["companyName"], message: "Company name is required" });
    }
    if (v.companyKind === "INDIVIDUAL" && !v.contactName) {
      ctx.addIssue({ code: "custom", path: ["contactName"], message: "Name is required" });
    }
  });

/** What the form holds (the numbers as typed). */
export type ClientFormValues = z.input<typeof clientSchema>;