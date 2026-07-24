// Validation for the notice authoring form. Lives outside the "use server"
// action file so the admin form can import the inferred input type as well.

import { z } from "zod";

/** Trims, enforces a length cap, and collapses "" to null. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .transform((value) => (value && value.length > 0 ? value : null));

/** ISO timestamp from the form's datetime input, or null. */
const optionalTimestamp = z.iso
  .datetime({ offset: true, error: "Enter a valid date and time" })
  .nullable();

export const systemNoticeInputSchema = z
  .object({
    /** Present when editing, absent when creating. */
    id: z.string().min(1).optional(),

    title: optionalText(80, "Keep the headline under 80 characters"),

    message: z
      .string()
      .trim()
      .min(1, "Write the message tenants will read")
      .max(400, "Keep the message under 400 characters"),

    severity: z.enum(["INFO", "SUCCESS", "WARNING", "CRITICAL"]),
    audience: z.enum(["ALL", "BUSINESS_ASSOCIATES", "STANDARD"]),
    displayMode: z.enum(["ALWAYS", "SCHEDULED"]),

    isActive: z.boolean(),
    dismissible: z.boolean(),

    priority: z
      .number({ error: "Priority must be a number" })
      .int("Priority must be a whole number")
      .min(0, "Priority cannot be negative")
      .max(100, "Priority cannot exceed 100"),

    startsAt: optionalTimestamp,
    endsAt: optionalTimestamp,

    linkLabel: optionalText(40, "Keep the link text under 40 characters"),
    linkHref: optionalText(500, "That link is too long"),
  })
  // A CTA needs both halves or neither, otherwise the banner renders a labelled
  // link that goes nowhere, or an unlabelled one nobody can read.
  .refine((v) => !v.linkHref || !!v.linkLabel, {
    message: "Add link text so tenants know where the link goes",
    path: ["linkLabel"],
  })
  .refine((v) => !v.linkLabel || !!v.linkHref, {
    message: "Add the destination for this link",
    path: ["linkHref"],
  })
  // In-app path or absolute http(s) URL only. Blocks javascript: and other
  // schemes, since this string is written straight into an anchor href that
  // every tenant sees.
  .refine((v) => !v.linkHref || /^(\/|https?:\/\/)/.test(v.linkHref), {
    message: "Use an in-app path like /rates, or a full https:// URL",
    path: ["linkHref"],
  })
  .refine((v) => v.displayMode !== "SCHEDULED" || !!v.startsAt || !!v.endsAt, {
    message: "A scheduled notice needs a start or an end",
    path: ["startsAt"],
  })
  .refine(
    (v) =>
      !v.startsAt ||
      !v.endsAt ||
      new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime(),
    { message: "The end must come after the start", path: ["endsAt"] },
  );

export type SystemNoticeInput = z.input<typeof systemNoticeInputSchema>;

export type SaveSystemNoticeResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type SystemNoticeMutationResult =
  | { ok: true }
  | { ok: false; error: string };
