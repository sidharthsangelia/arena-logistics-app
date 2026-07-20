// utils/clerk/syncProfileMetadata.ts
import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { computeOrgProfileStatus } from "@/lib/booking/profile";

export async function syncOrgProfileMetadata(dbOrgId: string): Promise<void> {
  try {
    const org = await prisma.org.findUnique({ where: { id: dbOrgId } });
    if (!org) return;

    const status = await computeOrgProfileStatus(org);

    if (status.complete && !org.profileCompletedAt) {
      await prisma.org.update({ where: { id: org.id }, data: { profileCompletedAt: new Date() } });
    }

    // METADATA POLICY: only non-sensitive *routing / UI-gating booleans* go to
    // publicMetadata (it's readable on the client — see ProfileCompletionBanner).
    // Never put profile/KYC DATA (addresses, doc numbers, phone/email, file URLs)
    // here — anything sensitive belongs in privateMetadata (server-only) or stays
    // in Postgres, which remains the source of truth. These three flags are just
    // completion state, safe to expose.
    const client = await clerkClient();
    await client.organizations.updateOrganizationMetadata(org.clerkOrgId, {
      publicMetadata: {
        profileAddressComplete: status.addressComplete,
        profileKycComplete: status.kycComplete,
        profileComplete: status.complete,
      },
    });
  } catch (err) {
    // Non-fatal by design: this is a UI cache, not the source of truth.
    // The caller's DB write already succeeded — never let this bubble up.
    console.error("[syncOrgProfileMetadata]", err);
  }
}