/**
 * Validation for the business associate client-email settings form.
 *
 * Kept outside the `"use server"` action file, which may only export async
 * functions, so the form can import the inferred input type as well.
 */

import { z } from "zod";

import { CLIENT_EMAIL_MILESTONES } from "./clientEmails";

export const clientEmailSettingsSchema = z
  .object({
    enabled: z.boolean(),

    milestones: z
      .array(z.enum(CLIENT_EMAIL_MILESTONES))
      // Dedupe rather than reject. Duplicates can only come from a malformed
      // request, and the meaning is unambiguous, so there is nothing to tell the
      // user about.
      .transform((values) => [...new Set(values)]),

    /**
     * Where a client's reply goes. Empty collapses to null, which the send path
     * reads as "fall back to the org's main address".
     */
    replyTo: z
      .string()
      .trim()
      .max(200, "That address is too long")
      .nullable()
      .transform((value) => (value && value.length > 0 ? value : null))
      .refine((value) => value === null || z.string().email().safeParse(value).success, {
        message: "Enter a valid email address",
      }),
  })
  // Switched on with nothing ticked would silently send nothing, and the person
  // who set it would believe their clients were being kept informed. Refusing the
  // save is the only version of this that cannot mislead.
  .refine((v) => !v.enabled || v.milestones.length > 0, {
    message: "Choose at least one update to send, or switch client emails off",
    path: ["milestones"],
  });

export type ClientEmailSettingsInput = z.input<typeof clientEmailSettingsSchema>;

export type ClientEmailSettingsResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

// ---------------------------------------------------------------------------
// Per-client override
// ---------------------------------------------------------------------------

export const clientEmailPreferenceSchema = z.object({
  clientId: z.string().min(1),
  preference: z.enum(["INHERIT", "ALWAYS", "NEVER"]),
});

export type ClientEmailPreferenceInput = z.input<typeof clientEmailPreferenceSchema>;
