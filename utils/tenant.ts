import * as Sentry from "@sentry/nextjs";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/utils/db";
import { unstable_cache, revalidateTag } from "next/cache";

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
// getCurrentOrg
//
// Returns the FULL org row (plus wallet) for the signed-in user, or null.
//
// Deliberately uses React's `cache` (per-request memoisation) and NOT
// `unstable_cache` (cross-request store): this row carries MUTABLE, sensitive
// fields — `wallet.balance`, `markupPercent`, `skipPayment` — that must never
// be served stale. React `cache` only dedups within a single render pass, so
// when the layout and the page both need the org they share ONE query at a
// single point in time, with zero staleness. (Contrast getDbOrgId above, which
// safely cross-request caches only the immutable `org.id`.)
//
// Callers handle a null return themselves (redirect to onboarding, etc.) so
// this stays a pure, side-effect-free data accessor.
// ---------------------------------------------------------------------------

export const getCurrentOrg = cache(async () => {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) return null;

  return prisma.org.findUnique({
    where: { clerkOrgId },
    include: { wallet: true },
  });
});

// ---------------------------------------------------------------------------
// requireBusinessAssociateOrg
//
// Route guard for Business-Associate-only areas (/clients, /quotes). Standard
// orgs are redirected to the dashboard; unonboarded users to onboarding.
//
// Authoritative AND free: it reuses getCurrentOrg's per-request cache, which the
// tenant layout has already populated in the same render pass, so gating adds
// no extra DB query. The DB is the source of truth here (not the Clerk metadata
// mirror) so a stale mirror can never wrongly allow or block access.
//
// Returns the org so callers can use it without a second lookup.
// ---------------------------------------------------------------------------

export async function requireBusinessAssociateOrg() {
  const org = await getCurrentOrg();
  if (!org) redirect("/onboarding");
  if (!org.isBusinessAssociate) redirect("/");
  return org;
}

// ---------------------------------------------------------------------------
// invalidateOrgCache
//
// Call this if an org's clerkOrgId ever changes (extremely rare),
// or during testing to force a fresh DB lookup.
// ---------------------------------------------------------------------------

export function invalidateOrgCache(clerkOrgId: string) {
  // Next 16 requires the two-arg form; "max" gives stale-while-revalidate.
  revalidateTag(`org:${clerkOrgId}`, "max");
}