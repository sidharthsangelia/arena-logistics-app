// app/api/auth/redirect/route.ts
import { prisma } from "@/utils/db";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
 

const ARENA_ORG_ID = process.env.ARENA_ORG_ID!;

export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

  // Already has active org
  if (orgId === ARENA_ORG_ID) {
    return NextResponse.redirect(new URL("/arena-dashboard", req.url));
  }

  // No active org — check if they're an Arena member
  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId });
  const isArenaMember = memberships.data.some(
    (m) => m.organization.id === ARENA_ORG_ID
  );

  if (isArenaMember) {
    // Redirect to a client-side page that calls setActive() then bounces to arena-dashboard
    return NextResponse.redirect(new URL("/activate-org", req.url));
  }

  // Tenant user with active org
  if (orgId) {
    const org = await prisma.org.findUnique({ where: { clerkOrgId: orgId } });
    if (org) return NextResponse.redirect(new URL("/", req.url));
  }

  // Tenant with no org yet
  return NextResponse.redirect(new URL("/onboarding", req.url));
}