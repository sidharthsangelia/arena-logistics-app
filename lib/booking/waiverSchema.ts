// lib/booking/waiverSchema.ts
//
// Validation and types for granting and revoking a KYC waiver.
//
// Kept out of the "use server" action file for the same reason as
// lib/accounts/schema.ts: Turbopack treats every export of a server-action
// module as a runtime action, so a type exported next to one fails the build.
// The dialog validates against these exact rules before it submits.

import { z } from "zod";

export type WaiverActionResult =
  | { success: true }
  | { success: false; error: string };

/** How long a waiver runs for by default when ops does not pick a date. */
export const DEFAULT_WAIVER_DAYS = 90;

/**
 * The ceiling on a waiver. Long enough for any genuine "their GST is stuck with
 * their accountant" situation, short enough that nobody can quietly write a
 * permanent exemption. Re-granting is one dialog, so a real long-term case
 * costs a second conversation rather than being impossible.
 */
export const MAX_WAIVER_DAYS = 365;

/**
 * The reason is the record. A one-word "ok" is worse than useless a year later
 * when somebody asks why this shipment moved without a PAN, so there is a floor
 * on it.
 */
export const waiverReasonSchema = z
  .string()
  .trim()
  .min(10, "Write at least a sentence about why KYC is being waived.")
  .max(500, "Keep the reason under 500 characters.");

/** ISO date (yyyy-mm-dd) from the dialog's date input, bounded on both ends. */
export const waiverExpirySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an expiry date.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T23:59:59.999Z`)), {
    message: "Pick a valid expiry date.",
  });

/**
 * The party a waiver attaches to. Mirrors types/booking.ts Party — repeated as a
 * zod union here so the server validates the shape it is handed rather than
 * trusting the caller's TypeScript.
 */
export const waiverPartySchema = z.discriminatedUnion("partyType", [
  z.object({ partyType: z.literal("ORG"), orgId: z.string().min(1) }),
  z.object({ partyType: z.literal("CLIENT"), clientId: z.string().min(1) }),
]);

export const grantKycWaiverSchema = z.object({
  party: waiverPartySchema,
  reason: waiverReasonSchema,
  expiresOn: waiverExpirySchema,
});

export const revokeKycWaiverSchema = z.object({
  waiverId: z.string().min(1),
});

export type GrantKycWaiverInput = z.infer<typeof grantKycWaiverSchema>;
export type RevokeKycWaiverInput = z.infer<typeof revokeKycWaiverSchema>;

/** yyyy-mm-dd, `days` from today — the date input's default value. */
export function defaultWaiverExpiry(days = DEFAULT_WAIVER_DAYS): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
