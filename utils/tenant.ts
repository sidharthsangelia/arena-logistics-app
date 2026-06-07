import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/utils/db";
import { unstable_cache } from "next/cache";

// ---------------------------------------------------------------------------
// resolveOrgByClerkId
//
// Pure DB lookup — cacheable because:
//   - no auth() call
//   - no redirect()
//   - only serialisable input/output
//
// Throws on DB error (Neon timeout, connection failure) so unstable_cache
// does NOT store the failure — next request retries fresh against the DB.
// Sentry captures the error with context before rethrowing.
// ---------------------------------------------------------------------------

const resolveOrgByClerkId = (clerkOrgId: string) =>
  unstable_cache(
    async () => {
      const org = await prisma.org.findUnique({
        where: { clerkOrgId },
        select: { id: true },
      }).catch((error) => {
        Sentry.captureException(error, {
          tags:  { location: "resolveOrgByClerkId" },
          extra: { clerkOrgId },
        });
        // Rethrow so unstable_cache skips storing this result.
        // The next request will retry the DB lookup fresh.
        throw error;
      });

      return org?.id ?? null;
    },
    [`org:${clerkOrgId}`],
    {
      tags:       [`org:${clerkOrgId}`],
      revalidate: 300, // 5 min — org.id never changes once created
    }
  )();

// ---------------------------------------------------------------------------
// getDbOrgId
//
// The public helper imported by every server action and page.
// Resolves: Clerk session → clerkOrgId → internal DB Org.id
//
// redirect() and auth() live here — outside the cache boundary.
// Sentry is intentionally NOT called here because:
//   - missing clerkOrgId  → expected, user hasn't onboarded yet
//   - missing DB org row  → expected during onboarding, or caught above
//   - both are handled gracefully via redirect, not error boundaries
// ---------------------------------------------------------------------------

export async function getDbOrgId(): Promise<string> {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) redirect("/onboarding");

  const orgId = await resolveOrgByClerkId(clerkOrgId);
  if (!orgId) redirect("/onboarding");

  return orgId;
}

// ---------------------------------------------------------------------------
// invalidateOrgCache
//
// Call this if an org's clerkOrgId ever changes (extremely rare),
// or during testing to force a fresh DB lookup.
// ---------------------------------------------------------------------------

export function invalidateOrgCache(clerkOrgId: string) {
  const { revalidateTag } = require("next/cache");
  revalidateTag(`org:${clerkOrgId}`);
}