// actions/onboarding.action.ts
"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/utils/db";
import { z } from "zod";

const onboardingSchema = z.object({
  name: z.string().min(2, "Company name must be at least 2 characters"),
  slug: z
    .string()
    .min(2)
    .max(32)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    ),
});

type OnboardingResult =
  | { success: true; redirectUrl: string }
  | { success: false; message: string };

export async function createOrgAction(
  input: z.infer<typeof onboardingSchema>
): Promise<OnboardingResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, message: "Not authenticated." };

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  const { name, slug } = parsed.data;

  // 1. Check slug is not already taken in our DB
  const existing = await prisma.org.findUnique({ where: { slug } });
  if (existing) {
    return { success: false, message: "This slug is already taken." };
  }

  // 2. Create the org in Clerk
  const client = await clerkClient();
  const clerkOrg = await client.organizations.createOrganization({
    name,
    slug,
    createdBy: userId,
  });

  // 3. Create the matching Org row in our DB
  // The webhook will also fire and hit our /api/webhooks/clerk endpoint,
  // but we upsert there so this row won't be duplicated.
  await prisma.org.create({
    data: {
      clerkOrgId: clerkOrg.id,
      slug,
      name,
    },
  });

  // 4. Set this org as the user's active org in their Clerk session
  // This ensures auth().orgId is populated on the next request
  await client.users.updateUser(userId, {
    publicMetadata: { onboardingComplete: true },
  });

  return { success: true, redirectUrl: "/dashboard" };
}

export async function checkSlugAvailability(
  slug: string
): Promise<{ available: boolean }> {
  if (!slug || slug.length < 2) return { available: false };

  const existing = await prisma.org.findUnique({
    where: { slug },
    select: { id: true },
  });

  return { available: !existing };
}