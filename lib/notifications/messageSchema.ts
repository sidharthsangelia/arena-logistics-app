/**
 * Validation for the targeted inbox message composer.
 *
 * Outside the `"use server"` action file, which may only export async functions, so
 * the composer can import the inferred input type too.
 */

import { z } from "zod";

export const MESSAGE_TARGETS = ["ALL", "BUSINESS_ASSOCIATES", "STANDARD", "PICK"] as const;
export type MessageTarget = (typeof MESSAGE_TARGETS)[number];

export const MESSAGE_TARGET_CONFIG: Record<
  MessageTarget,
  { label: string; hint: string }
> = {
  ALL: { label: "Everyone", hint: "Every organisation on the platform." },
  BUSINESS_ASSOCIATES: {
    label: "Business associates",
    hint: "Partners who book for their own clients.",
  },
  STANDARD: {
    label: "Standard organisations",
    hint: "Customers shipping for themselves.",
  },
  PICK: { label: "Choose organisations", hint: "Pick exactly who hears this." },
};

export const arenaMessageSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Write a subject so people know what this is about")
      .max(120, "Keep the subject under 120 characters"),

    body: z
      .string()
      .trim()
      .min(1, "Write the message")
      .max(1000, "Keep the message under 1000 characters"),

    severity: z.enum(["INFO", "SUCCESS", "WARNING", "CRITICAL"]),

    target: z.enum(MESSAGE_TARGETS),

    /** Only read when target is PICK. */
    orgIds: z.array(z.string().min(1)).default([]),

    linkLabel: z
      .string()
      .trim()
      .max(40, "Keep the link text under 40 characters")
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),

    linkHref: z
      .string()
      .trim()
      .max(500, "That link is too long")
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),

    /**
     * Send an email as well as the inbox entry.
     *
     * Off by default. The inbox costs a row; an email costs the recipient's
     * attention and cannot be taken back, so it should be a decision rather than
     * the thing that happens when you do not think about it.
     */
    alsoEmail: z.boolean(),
  })
  .refine((v) => v.target !== "PICK" || v.orgIds.length > 0, {
    message: "Choose at least one organisation",
    path: ["orgIds"],
  })
  // An in-app path only. This string goes straight into an href in every
  // recipient's inbox, so an absolute URL is refused along with javascript: and
  // friends: an internal message linking off-platform is either a mistake or
  // something we do not want to be the delivery mechanism for.
  .refine((v) => !v.linkHref || (v.linkHref.startsWith("/") && !v.linkHref.startsWith("//")), {
    message: "Use an in-app path like /shipments",
    path: ["linkHref"],
  })
  .refine((v) => !v.linkHref || !!v.linkLabel, {
    message: "Add link text so people know where it goes",
    path: ["linkLabel"],
  })
  .refine((v) => !v.linkLabel || !!v.linkHref, {
    message: "Add the destination for this link",
    path: ["linkHref"],
  });

export type ArenaMessageInput = z.input<typeof arenaMessageSchema>;

export type ArenaMessageResult =
  | {
      ok: true;
      /** Inbox entries written. */
      delivered: number;
      /** Emails Resend accepted, or null when emailing was not requested. */
      emailed: number | null;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
