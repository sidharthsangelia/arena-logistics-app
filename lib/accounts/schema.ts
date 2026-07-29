// lib/accounts/schema.ts
//
// Validation and types for the account settings mutations.
//
// These live outside actions/accounts/accounts.action.ts on purpose. Turbopack
// treats every export of a "use server" module as a runtime action, so a type
// exported alongside them fails the production build. Keeping the schemas here
// also lets the dialogs validate before they submit, against the exact rules
// the server will apply.

import { z } from "zod";

export type AccountActionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Arena's margin on this account's quotes. Bounded rather than free-form: a
 * fat-fingered 300 would silently reprice everything they book.
 */
export const markupPercentSchema = z
  .number({ error: "Enter a valid number" })
  .min(0, "Markup cannot be negative")
  .max(100, "Markup cannot exceed 100%");

export const updateOrgSettingsSchema = z.object({
  orgId: z.string().min(1),
  markupPercent: markupPercentSchema,
  isBusinessAssociate: z.boolean(),
  skipPayment: z.boolean(),
});

export const setBusinessAssociateStatusSchema = z.object({
  orgId: z.string().min(1),
  isBusinessAssociate: z.boolean(),
  markupPercent: markupPercentSchema,
});

export type UpdateOrgSettingsInput = z.infer<typeof updateOrgSettingsSchema>;
export type SetBusinessAssociateStatusInput = z.infer<
  typeof setBusinessAssociateStatusSchema
>;

/**
 * The markup an account moves to when it is promoted, and the one it returns to
 * when demoted. Both are starting points that the dialog lets you override, not
 * fixed policy.
 */
export const DEFAULT_BA_MARKUP_PERCENT = 15;
export const DEFAULT_STANDARD_MARKUP_PERCENT = 30;
