// app/arena-dashboard/business-associates/[id]/actions.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/utils/db";

// No auth check needed here — /arena-dashboard, and the server actions
// invoked from pages under it, are already gated to ARENA_ORG_ID staff
// by clerkMiddleware in proxy.ts.

const updateOrgSettingsSchema = z.object({
  orgId: z.string().min(1),
  markupPercent: z
    .number({ error: "Enter a valid number" })
    .min(0, "Markup cannot be negative")
    .max(100, "Markup cannot exceed 100%"),
  isBusinessAssociate: z.boolean(),
  skipPayment: z.boolean(),
});

export type UpdateOrgSettingsInput = z.infer<typeof updateOrgSettingsSchema>;
export type UpdateOrgSettingsResult =
  | { success: true }
  | { success: false; error: string };

export async function updateOrgSettings(
  input: UpdateOrgSettingsInput
): Promise<UpdateOrgSettingsResult> {
  const parsed = updateOrgSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { orgId, markupPercent, isBusinessAssociate, skipPayment } =
    parsed.data;

  try {
    const org = await prisma.org.findFirst({
      where: { id: orgId, deletedAt: null },
      select: { id: true },
    });

    if (!org) {
      return { success: false, error: "Organisation not found." };
    }

    await prisma.org.update({
      where: { id: orgId },
      data: { markupPercent, isBusinessAssociate, skipPayment },
    });
  } catch (err) {
    console.error("[updateOrgSettings] failed:", err);
    return {
      success: false,
      error: "Could not save changes. Please try again.",
    };
  }

  revalidatePath(`/arena-dashboard/business-associates/${orgId}`);
  revalidatePath("/arena-dashboard/business-associates");

  return { success: true };
}