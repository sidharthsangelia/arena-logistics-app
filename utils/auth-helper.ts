import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";

/**
 * Same pattern as resolveOrg() in createShipmentAction.ts. Kept here so
 * every wallet action shares one implementation instead of copy-pasting
 * this in three places.
 */
export async function requireOrg() {
  const { userId, orgId: clerkOrgId } = await auth();
  if (!userId || !clerkOrgId) {
    throw new Error("UNAUTHENTICATED: no active organization in session");
  }

  const org = await prisma.org.findUnique({ where: { clerkOrgId } });
  if (!org) throw new Error("ORG_NOT_FOUND");
  if (org.deletedAt) throw new Error("ORG_DELETED");

  return org;
}