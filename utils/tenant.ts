// lib/tenant.ts
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";

export async function getDbOrgId(): Promise<string> {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) throw new Error("No active organisation in session.");
  const org = await prisma.org.findUnique({
    where: { clerkOrgId },
    select: { id: true },
  });
  if (!org) throw new Error(`Org not found for clerkOrgId: ${clerkOrgId}`);
  return org.id;
}