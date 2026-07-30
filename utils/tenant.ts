import * as Sentry from "@sentry/nextjs";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/utils/db";
import { unstable_cache, revalidateTag } from "next/cache";

// ---------------------------------------------------------------------------
// OrgShell
//
// The two fields the tenant chrome needs on every single page: the internal id
// (to key per-org queries) and the BA flag (which decides the sidebar's routes).
// Deliberately nothing else — see resolveOrgShell below for why this stays tiny.
// ---------------------------------------------------------------------------

export interface OrgShell {
  id: string;
  isBusinessAssociate: boolean;
}

// ---------------------------------------------------------------------------
// resolveOrgShell
//
// Pure DB lookup — cacheable because:
//   - no auth() call
//   - no redirect()
//   - only serialisable input/output
//
// Both fields are effectively immutable in day-to-day use: `id` never changes
// once the row exists, and `isBusinessAssociate` only moves when an Arena admin
// converts the account (applyOrgSettings, which invalidates this tag straight
// after its write). That is what makes it safe to serve the tenant layout from
// cache instead of a DB round trip on every navigation.
//
// The TTL is a safety ceiling, not the refresh mechanism: 60s means a write
// that somehow skipped invalidation self-heals in a minute rather than lingering
// for five. It stays deliberately small — a bigger row would mean caching
// mutable, sensitive fields (balance, markupPercent), which is exactly what
// getCurrentOrg below refuses to do.
//
// Throws on DB error (Neon timeout, connection failure) so unstable_cache
// does NOT store the failure — next request retries fresh against the DB.
// Sentry captures the error with context before rethrowing.
// ---------------------------------------------------------------------------

const resolveOrgShell = (clerkOrgId: string) =>
  unstable_cache(
    async (): Promise<OrgShell | null> => {
      const org = await prisma.org.findUnique({
        where: { clerkOrgId },
        select: { id: true, isBusinessAssociate: true },
      }).catch((error) => {
        Sentry.captureException(error, {
          tags:  { location: "resolveOrgShell" },
          extra: { clerkOrgId },
        });
        // Rethrow so unstable_cache skips storing this result.
        // The next request will retry the DB lookup fresh.
        throw error;
      });

      return org ?? null;
    },
    // Key is "org-shell:", not "org:", on purpose. This entry used to hold a
    // bare id string; widening it to an object means an entry written by the
    // previous version would deserialise as a string and every `.id` read off it
    // would be undefined. A distinct key sidesteps that entirely. The TAG stays
    // "org:" so existing invalidation callers keep working unchanged.
    [`org-shell:${clerkOrgId}`],
    {
      tags:       [`org:${clerkOrgId}`],
      revalidate: 60,
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

  const org = await resolveOrgShell(clerkOrgId);
  if (!org) redirect("/onboarding");

  return org.id;
}

// ---------------------------------------------------------------------------
// getOrgShell
//
// What the tenant layout renders from. The layout used to await getCurrentOrg()
// — an uncached findUnique with the wallet joined in — which put a Neon round
// trip in front of the sidebar, header and page content on EVERY navigation.
// Nothing in the chrome needs the mutable half of that row: the wallet chip
// fetches its own (separately cached) balance inside its own Suspense boundary.
//
// So the layout reads this instead and the shell paints from cache, while the
// page underneath still calls getCurrentOrg() when it genuinely needs the full
// row. Returns null (rather than redirecting) so the caller owns that decision.
// ---------------------------------------------------------------------------

export async function getOrgShell(): Promise<OrgShell | null> {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) return null;

  return resolveOrgShell(clerkOrgId);
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
// several Suspense boundaries on one page share ONE query at a single point in
// time, with zero staleness. (Contrast getOrgShell above, which safely
// cross-request caches only the two effectively-immutable columns.)
//
// Reach for this only when you genuinely need the full row. The tenant chrome
// does not, and reads getOrgShell instead so it is not sitting behind this
// query on every navigation.
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
// Reads the same cached shell the tenant layout already resolved this request,
// so gating a route costs nothing — it used to pull the full org row (with the
// wallet joined in) purely to read one boolean, in a layout, on every navigation
// into those sections.
//
// The DB is still the source of truth here, not the Clerk metadata mirror, so a
// stale mirror can never wrongly allow or block access. The shell's own cache is
// dropped the moment an admin converts an account (see applyOrgSettings), which
// is the only thing that can change this answer.
//
// Returns the shell so callers get the org id without a second lookup. Callers
// needing more than { id, isBusinessAssociate } should call getCurrentOrg.
// ---------------------------------------------------------------------------

export async function requireBusinessAssociateOrg(): Promise<OrgShell> {
  const org = await getOrgShell();
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