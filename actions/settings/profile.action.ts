// actions/settings/profile.action.ts
"use server";

import { z } from "zod";
import { prisma } from "@/utils/db";
import { getCurrentOrgContext } from "@/actions/book/getOrgs";
import { syncOrgProfileMetadata } from "@/utils/clerk/syncProfileMetadata";
import { ok, fail, type ActionResult } from "@/types/booking";

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

    const updated = await prisma.org.update({ where: { id: org.id }, data });
    await syncOrgProfileMetadata(org.id);

    const { isOrgAddressComplete } = await import("@/lib/booking/profile");
    return ok({ addressComplete: isOrgAddressComplete(updated) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not save your profile. Please try again.");
  }
}