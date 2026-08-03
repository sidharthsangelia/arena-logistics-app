"use server";

/**
 * THE EXPORT PROFILE: WHO IS EXPORTING, AND UNDER WHAT PAPERS
 * -----------------------------------------------------------------------------
 * Saves the IEC, AD code, LUT and IOSS that an international booking is filed
 * under. One action for both parties, because the fields are identical and the
 * only real difference is which row it writes:
 *
 *   scope "ORG"    — the organisation's own papers
 *   scope "CLIENT" — a client's, which WIN over the org's when set. For a
 *                    business associate booking on behalf of a client, the
 *                    client is the party legally exporting, so filing under the
 *                    associate's IEC would name the wrong entity to customs.
 *
 * Resolution and precedence live in lib/booking/exportProfile.ts. This module
 * only writes; it never decides which value applies to a booking.
 *
 * ── WHY THE VALIDATION IS SHAPED THE WAY IT IS ──────────────────────────────
 * Everything is optional and a half-filled profile saves cleanly, exactly like
 * the org contact form: most orgs ship CSB-IV, which needs none of this, and a
 * form that refuses to save until all of it is filled in is a form nobody
 * finishes. Only two things are actually refused:
 *
 *   1. A value that IS given but is malformed. A transposed digit in an IEC
 *      passes any "is it non-empty" check and then fails at a customs desk.
 *   2. Declaring the export type as LUT while giving no LUT number. That exact
 *      combination is what blocked every international booking before this form
 *      existed — the schema defaulted every org to LUT, so each one was treated
 *      as claiming zero-rated relief under a document it did not hold. Refusing
 *      it here means the form cannot recreate the problem it was built to fix.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { assertOrgOwnsClient, getCurrentOrgContext } from "@/actions/book/getOrgs";
import type { ExportProfileFormShape } from "@/lib/booking/exportProfile";
import { ok, fail, type ActionResult } from "@/types/booking";

// ---------------------------------------------------------------------------

/** Empty string, or a value matching the rule. Mirrors the org profile form. */
function optional(schema: z.ZodType<string>) {
  return z.union([schema, z.literal("")]);
}

const upper = (v: string) => v.trim().toUpperCase();

/**
 * An IEC is the holder's PAN: five letters, four digits, one letter. Checking
 * the shape catches a typo; it cannot confirm the code is registered, and it
 * does not try to.
 */
const iecSchema = z
  .string()
  .transform(upper)
  .refine(
    (v) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v),
    "An IEC is ten characters, in the same format as a PAN (AAAAA1234A).",
  );

/**
 * An Authorised Dealer code identifies the exporter's bank branch to customs.
 * Seven digits is the common form; some banks quote it with a suffix, so the
 * rule is deliberately loose about length and strict about content.
 */
const adCodeSchema = z
  .string()
  .transform((v) => v.trim())
  .refine(
    (v) => /^[0-9]{6,14}$/.test(v),
    "An AD code is 6 to 14 digits, with no spaces or dashes.",
  );

const lutNumberSchema = z
  .string()
  .transform(upper)
  .refine(
    (v) => /^[A-Z0-9/-]{6,30}$/.test(v),
    "That does not look like an LUT reference number.",
  );

/** EU import scheme registration: IM followed by ten digits. */
const iossSchema = z
  .string()
  .transform(upper)
  .refine(
    (v) => /^IM[0-9]{10}$/.test(v),
    "An IOSS number is IM followed by ten digits.",
  );

const dateSchema = z
  .string()
  .refine(
    (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
    "Use a real date.",
  );

const exportProfileSchema = z
  .object({
    scope: z.enum(["ORG", "CLIENT"]),
    /** Required when scope is CLIENT, ignored otherwise. */
    clientId: z.string().optional(),

    iecNumber: optional(iecSchema),
    adCode: optional(adCodeSchema),
    lutNumber: optional(lutNumberSchema),
    lutIssueDate: optional(dateSchema),
    lutTillDate: optional(dateSchema),
    iossNumber: optional(iossSchema),
    incoterms: z.enum(["DDP", "DDU"]),
    exportType: z.enum(["LUT", "BOND", "NA"]),
  })
  .refine((v) => v.scope !== "CLIENT" || Boolean(v.clientId), {
    message: "No client was identified.",
    path: ["clientId"],
  })
  // The trap this form exists to close. See the note at the top.
  .refine((v) => v.exportType !== "LUT" || Boolean(v.lutNumber), {
    message:
      "Exporting under an LUT means holding one. Add the LUT number, or set the export type to Bond or None.",
    path: ["lutNumber"],
  })
  .refine(
    (v) => !v.lutIssueDate || !v.lutTillDate || v.lutIssueDate <= v.lutTillDate,
    {
      message: "The LUT valid-until date cannot be before the date it was issued.",
      path: ["lutTillDate"],
    },
  );

/**
 * Stated explicitly rather than inferred with z.input.
 *
 * The schema's fields are unions of a transforming refinement and a literal "",
 * and z.input widens those to unknown — which then leaks into every component
 * that renders the form. The shape is fixed and shared, so naming it is both
 * more honest and more useful than inferring it.
 */
export type ExportProfileInput = ExportProfileFormShape & {
  scope: "ORG" | "CLIENT";
  clientId?: string;
};

// ---------------------------------------------------------------------------

export async function saveExportProfileAction(
  input: ExportProfileInput,
): Promise<ActionResult<{ saved: true }>> {
  const parsed = exportProfileSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "Please check the highlighted fields.",
    );
  }

  const v = parsed.data;

  try {
    const { org } = await getCurrentOrgContext();

    // Dates go in as Date or null; the resolver formats them on the way out.
    const data = {
      iecNumber: v.iecNumber || null,
      adCode: v.adCode || null,
      lutNumber: v.lutNumber || null,
      lutIssueDate: v.lutIssueDate ? new Date(v.lutIssueDate) : null,
      lutTillDate: v.lutTillDate ? new Date(v.lutTillDate) : null,
      iossNumber: v.iossNumber || null,
      defaultIncoterms: v.incoterms,
      defaultExportType: v.exportType,
    };

    if (v.scope === "CLIENT") {
      // Ownership, not just existence: a client id from another org must not be
      // writable by guessing it.
      await assertOrgOwnsClient(org.id, v.clientId as string);
      await prisma.client.update({
        where: { id: v.clientId as string },
        data,
      });
      revalidatePath(`/clients/${v.clientId}`);
    } else {
      await prisma.org.update({ where: { id: org.id }, data });
      revalidatePath("/settings");
    }

    return ok({ saved: true as const });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "saveExportProfile" },
      extra: { scope: input.scope, clientId: input.clientId ?? null },
    });
    return fail("Could not save the export profile. Please try again.");
  }
}
