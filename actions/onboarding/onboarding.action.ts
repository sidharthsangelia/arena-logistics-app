"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

const onboardingSchema = z.object({
  name: z.string().min(2, "Please enter a name (at least 2 characters)."),
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

  try {
    const client = await clerkClient();

    // ── Resume path (idempotent retry) ──────────────────────────────────────
    // If a workspace with this slug already exists, it's only a hard "taken"
    // error when it belongs to *someone else*. If THIS user already created it
    // (e.g. a previous attempt created the org but setActive never stuck and
    // they landed back on onboarding), we resume it instead of locking them out
    // of their own workspace.
    const existing = await prisma.org.findUnique({
      where: { slug },
      select: { id: true, clerkOrgId: true },
    });

    if (existing) {
      const memberships = await client.users.getOrganizationMembershipList({
        userId,
      });
      const ownsIt = memberships.data.some(
        (m) => m.organization.id === existing.clerkOrgId,
      );

      if (!ownsIt) {
        return { success: false, message: "This workspace URL is already taken." };
      }

      // It's theirs — make sure the flag is set and hand the id back so the
      // client can setActive and move on.
      await markOnboardingComplete(client, userId);
      return {
        success: true,
        redirectUrl: "/",
        organizationId: existing.clerkOrgId,
      };
    }

    // ── Create path ─────────────────────────────────────────────────────────
    const clerkOrg = await client.organizations.createOrganization({
      name,
      slug,
      createdBy: userId,
    });

    // Upsert (not create): the organization.created webhook may have raced us
    // and already inserted the row keyed on clerkOrgId. Either way we converge
    // on one row and never throw a unique-constraint error.
    await prisma.org.upsert({
      where: { clerkOrgId: clerkOrg.id },
      update: { name, slug, deletedAt: null },
      create: { clerkOrgId: clerkOrg.id, slug, name },
    });

    await markOnboardingComplete(client, userId);

    return {
      success: true,
      redirectUrl: "/",
      organizationId: clerkOrg.id,
    };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "createOrg" },
      extra: { slug, userId },
    });
    console.error("[createOrgAction]", err);
    return {
      success: false,
      message:
        "Something went wrong while creating your workspace. Please try again.",
    };
  }
}

// Routing flag only (safe to keep public per the metadata policy). Best-effort:
// routing actually keys off the active org in the session, so a failure here
// must never block onboarding — log it and move on.
async function markOnboardingComplete(
  client: Awaited<ReturnType<typeof clerkClient>>,
  userId: string,
): Promise<void> {
  try {
    await client.users.updateUser(userId, {
      publicMetadata: { onboardingComplete: true },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { action: "markOnboardingComplete" } });
    console.error("[markOnboardingComplete]", err);
  }
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