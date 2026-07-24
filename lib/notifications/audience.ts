import "server-only";

import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/utils/db";
import { getArenaAuth } from "@/utils/arena-auth";
import type { InboxAudience } from "./queries";

/**
 * WHOSE INBOX AM I LOOKING AT
 * -----------------------------------------------------------------------------
 * One resolver for both sides, so the bell component does not have to know which
 * dashboard it is mounted in and no caller can accidentally read the wrong inbox.
 *
 * This is an authorisation boundary, not a convenience. Every inbox read and every
 * mark-as-read goes through it, and the orgId it returns comes from the session
 * rather than from anything the caller passed in. A server action is a public
 * endpoint, so an orgId parameter would be an org-id-shaped hole.
 *
 * Returns null rather than throwing when there is no inbox to show (signed out,
 * mid-onboarding). The bell renders nothing in that case, which is correct.
 */
export async function resolveInboxAudience(): Promise<InboxAudience | null> {
  try {
    const { userId, orgId: clerkOrgId } = await auth();
    if (!userId || !clerkOrgId) return null;

    // Arena staff first: their Clerk org is the arena org, so a tenant lookup for
    // it would find nothing and quietly return null.
    const arena = await getArenaAuth();
    if (arena.isArenaMember) {
      return { scope: "ARENA", userId, isArenaAdmin: arena.isArenaAdmin };
    }

    const org = await prisma.org.findUnique({
      where: { clerkOrgId },
      select: { id: true },
    });
    if (!org) return null;

    return { scope: "ORG", orgId: org.id, userId };
  } catch (error) {
    Sentry.captureException(error, { tags: { location: "resolveInboxAudience" } });
    return null;
  }
}
