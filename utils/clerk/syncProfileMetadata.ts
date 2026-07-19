// utils/clerk/syncProfileMetadata.ts
import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { computeOrgProfileStatus } from "@/lib/booking/profile";

export async function syncOrgProfileMetadata(dbOrgId: string) {
  const org = await prisma.org.findUnique({ where: { id: dbOrgId } });
  if (!org) return;

  const status = await computeOrgProfileStatus(org);

  if (status.complete && !org.profileCompletedAt) {
    await prisma.org.update({ where: { id: org.id }, data: { profileCompletedAt: new Date() } });
  }

  try {
    const client = await clerkClient();
    await client.organizations.updateOrganizationMetadata(org.clerkOrgId, {
      publicMetadata: {
        profileAddressComplete: status.addressComplete,
        profileKycComplete: status.kycComplete,
        profileComplete: status.complete,
      },
    });
  } catch (err) {
    console.error("[syncOrgProfileMetadata] Clerk sync failed:", err);
  }
}