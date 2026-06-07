import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/utils/db";
import { unstable_cache } from "next/cache";

// Pure DB lookup — cacheable because it has no side effects and
// takes only a plain string. No auth(), no redirect() inside.
const resolveOrgByClerkId = (clerkOrgId: string) =>
  unstable_cache(
    async () => {
      const org = await prisma.org.findUnique({
        where: { clerkOrgId },
        select: { id: true },
      });
      return org?.id ?? null;
    },
    [`org:${clerkOrgId}`],
    {
      tags: [`org:${clerkOrgId}`],
      revalidate: 300,
    }
  )();

// Public helper used by pages and actions.
// auth() and redirect() live here — outside the cache boundary.
export async function getDbOrgId(): Promise<string> {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) redirect("/onboarding");

  const orgId = await resolveOrgByClerkId(clerkOrgId);
  if (!orgId) redirect("/onboarding");

  return orgId;
}