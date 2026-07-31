// actions/settings/profile.action.ts
"use server";

import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { getCurrentOrgContext } from "@/actions/book/getOrgs";
import { syncOrgProfileMetadata } from "@/utils/clerk/syncProfileMetadata";
import { ok, fail, type ActionResult } from "@/types/booking";
import { isValidGstin, parseGstin, resolveStateCode } from "@/lib/invoices/tax/gst";

// Every field optional — filled in when provided, nothing blocks a save.
// Non-empty values are still validated so a malformed entry never silently
// lands in a row the booking wizard later reads from.
const orgProfileSchema = z.object({
  contactName: z.union([z.string().min(2), z.literal("")]),
  companyName: z.union([z.string().min(2), z.literal("")]),
  email: z.union([z.string().email(), z.literal("")]),
  phone: z.union([z.string().min(8), z.literal("")]),
  addressLine1: z.union([z.string().min(3), z.literal("")]),
  city: z.union([z.string().min(2), z.literal("")]),
  state: z.union([z.string().min(2), z.literal("")]),
  postalCode: z.union([z.string().min(2), z.literal("")]),
  country: z.union([z.string().min(2), z.literal("")]),

  // Optional, like everything else here: plenty of customers are individuals
  // with no registration, and an invoice to them is valid printed
  // "Unregistered". But a value that IS given is checksum-validated rather than
  // merely shaped, because a transposed digit passes a regex and then prints on
  // a tax invoice that the customer's accountant cannot use. Correcting one
  // afterwards means a credit note, so it is worth refusing here.
  gstin: z.union([
    z
      .string()
      .transform((v) => v.trim().toUpperCase())
      .refine(isValidGstin, "That does not look like a valid GSTIN."),
    z.literal(""),
  ]),
});

export type OrgProfileInput = z.infer<typeof orgProfileSchema>;

export async function saveOrgProfileAction(
  input: OrgProfileInput,
): Promise<ActionResult<{ addressComplete: boolean }>> {
  const parsed = orgProfileSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check the highlighted fields.");
  }

  try {
    const { org } = await getCurrentOrgContext();
    const data = Object.fromEntries(
      Object.entries(parsed.data).map(([k, v]) => [k, v || null]),
    );

    // Resolve the GST state code here, once, rather than on every invoice.
    //
    // A GSTIN's first two digits ARE the registered state and win outright:
    // they survived a checksum, whereas `state` is a free-text box someone may
    // have typed a city into. Falling back to resolving that text is a best
    // effort, and resolving to null is a valid answer that the invoice builder
    // handles by treating the supply as intra-state.
    const gstin = parsed.data.gstin || null;
    const parsedGstin = parseGstin(gstin);
    data.gstStateCode =
      parsedGstin?.stateCode ?? resolveStateCode(parsed.data.state) ?? null;

    const updated = await prisma.org.update({ where: { id: org.id }, data });
    await syncOrgProfileMetadata(org.id);

    // Keep the Clerk org name (the workspace name, pre-filled into this field)
    // in step with an edited company name. Non-fatal: the profile save already
    // succeeded, so a Clerk hiccup must never surface as a failed save.
    const nextName = parsed.data.companyName.trim();
    if (nextName && nextName !== org.name) {
      try {
        const client = await clerkClient();
        await client.organizations.updateOrganization(org.clerkOrgId, {
          name: nextName,
        });
        await prisma.org.update({ where: { id: org.id }, data: { name: nextName } });
      } catch (e) {
        Sentry.captureException(e, { tags: { action: "saveOrgProfile.syncClerkName" } });
        console.error("[saveOrgProfileAction] Clerk name sync failed", e);
      }
    }

    const { isOrgAddressComplete } = await import("@/lib/booking/profile");
    return ok({ addressComplete: isOrgAddressComplete(updated) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not save your profile. Please try again.");
  }
}