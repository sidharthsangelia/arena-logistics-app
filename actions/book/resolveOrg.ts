import { auth } from "@clerk/nextjs/server";
import type { Org } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { NoActiveOrgError, UnauthenticatedError } from "@/actions/book/orgErrors";

export interface OrgContext {
  org: Org;
  userId: string;
}

export async function resolveOrgContext(): Promise<OrgContext> {
  const { userId, orgId } = await auth();

  if (!userId) throw new UnauthenticatedError();
  if (!orgId)  throw new NoActiveOrgError();

  const org = await prisma.org.findUnique({ where: { clerkOrgId: orgId } });
  if (!org)          throw new NoActiveOrgError();
  if (org.deletedAt) throw new NoActiveOrgError();

  return { org, userId };
}