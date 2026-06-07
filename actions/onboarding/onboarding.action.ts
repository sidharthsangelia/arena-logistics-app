"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
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
  | {
      success: true;
      redirectUrl: string;
      organizationId: string;
    }
  | {
      success: false;
      message: string;
    };

export async function createOrgAction(
  input: z.infer<typeof onboardingSchema>
): Promise<OnboardingResult> {
  const { userId } = await auth();

  if (!userId) {
    return {
      success: false,
      message: "Not authenticated.",
    };
  }

  const parsed = onboardingSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { name, slug } = parsed.data;

  // Check if slug already exists in our DB
  const existing = await prisma.org.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (existing) {
    return {
      success: false,
      message: "This slug is already taken.",
    };
  }

  const client = await clerkClient();

  // Create Clerk organization
  const clerkOrg = await client.organizations.createOrganization({
    name,
    slug,
    createdBy: userId,
  });

  // Create matching DB record
  await prisma.org.create({
    data: {
      clerkOrgId: clerkOrg.id,
      slug,
      name,
    },
  });

  // Mark onboarding complete
  await client.users.updateUser(userId, {
    publicMetadata: {
      onboardingComplete: true,
    },
  });

  return {
    success: true,
    redirectUrl: "/",
    organizationId: clerkOrg.id,
  };
}

export async function checkSlugAvailability(
  slug: string
): Promise<{ available: boolean }> {
  if (!slug || slug.length < 2) {
    return { available: false };
  }

  const existing = await prisma.org.findUnique({
    where: { slug },
    select: { id: true },
  });

  return {
    available: !existing,
  };
}