import * as Sentry from "@sentry/nextjs";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/utils/db";
import { unstable_cache, revalidateTag, updateTag } from "next/cache";

// ---------------------------------------------------------------------------
// Cache tags
//
// Two separate tags, because the two facets have different freshness needs and
// should not invalidate each other:
//
//   org:<clerkOrgId>          { id, isBusinessAssociate }. Access control.
//   org-pricing:<clerkOrgId>  markupPercent. Money, but not access.
//
// Both are written by exactly one code path (applyOrgSettings in
// actions/accounts/accounts.action.ts) which invalidates them on save.
// ---------------------------------------------------------------------------

const orgTag = (clerkOrgId: string) => `org:${clerkOrgId}`;
const orgPricingTag = (clerkOrgId: string) => `org-pricing:${clerkOrgId}`;

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
// The TTL is a safety ceiling, not the refresh mechanism: invalidateOrgCache
// expires this entry the instant an admin saves, so 60s only governs the case
// where that invalidation never ran at all (a direct SQL edit against Neon, or a
// bug in the write path). It stays deliberately small BECAUSE this row backs an
// authorisation decision — see requireBusinessAssociateOrg. Anything longer
// widens the window in which a demoted org keeps reaching BA-only routes.
//
// Do not widen the selection either. `markupPercent` is cached separately (see
// resolveOrgMarkup) precisely so it can carry a much longer TTL without dragging
// this security-critical entry along with it, and `wallet.balance` is not cached
// at all — that is what getCurrentOrg below refuses to do.
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
      tags:       [orgTag(clerkOrgId)],
      revalidate: 60,
    }
  )();

// ---------------------------------------------------------------------------
// resolveOrgMarkup
//
// Arena's margin on this org's rates. Split out of the shell above rather than
// folded into it because the two answer to different clocks:
//
//   - The shell gates routes, so its TTL is kept tight as a backstop.
//   - Markup only decides what price is displayed. An admin moves it once or
//     twice a month, through applyOrgSettings, which expires this entry on save.
//     So the TTL can be an hour, and the rate calculators stop issuing their own
//     `findUnique` on every single quote request.
//
// Returns null when the org row is missing so callers keep owning the default
// (both rate actions fall back to 30%, matching the Prisma column default).
//
// Number() is not cosmetic: markupPercent is a Prisma Decimal, and unstable_cache
// stores JSON. A Decimal does not survive that round trip as a usable number, so
// it MUST be converted before it crosses the cache boundary, not after.
//
// Throws on DB error for the same reason as resolveOrgShell: a failure must not
// be written into the cache.
// ---------------------------------------------------------------------------

const resolveOrgMarkup = (clerkOrgId: string) =>
  unstable_cache(
    async (): Promise<number | null> => {
      const org = await prisma.org.findUnique({
        where: { clerkOrgId },
        select: { markupPercent: true },
      }).catch((error) => {
        Sentry.captureException(error, {
          tags:  { location: "resolveOrgMarkup" },
          extra: { clerkOrgId },
        });
        throw error;
      });

      return org ? Number(org.markupPercent) : null;
    },
    [`org-markup:${clerkOrgId}`],
    {
      tags:       [orgPricingTag(clerkOrgId)],
      revalidate: 3600,
    }
  )();

// ---------------------------------------------------------------------------
// getOrgMarkupPercent
//
// Takes the Clerk org id rather than calling auth() itself, so the cache
// boundary stays free of request-scoped state — same shape as resolveOrgShell.
// Callers already hold the id from their own auth() call.
// ---------------------------------------------------------------------------

export async function getOrgMarkupPercent(
  clerkOrgId: string,
): Promise<number | null> {
  return resolveOrgMarkup(clerkOrgId);
}

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
// invalidateOrgCache / invalidateOrgPricingCache
//
// updateTag, NOT revalidateTag("max").
//
// The two are not interchangeable here. `revalidateTag(tag, "max")` marks the
// entry stale and then keeps SERVING the stale value while it refreshes behind
// the scenes, for up to the "max" profile's five minute stale window. For the
// org shell that is a real hole: an admin demotes a Business Associate, and that
// org can carry on loading /clients and /quotes off the stale entry for the next
// five minutes. `updateTag` expires immediately, so the very next request blocks
// on a fresh read and sees the new standing.
//
// The catch: updateTag throws outside a Server Action. Both callers today are
// server actions (applyOrgSettings). The fallback below is there so that if one
// of these is ever reached from a route handler or a webhook, a cache concern
// cannot fail a write that has ALREADY committed to the database — it degrades
// to stale-while-revalidate and reports itself rather than surfacing as "could
// not save" to an admin whose change actually went through.
// ---------------------------------------------------------------------------

function expireTag(tag: string, location: string) {
  try {
    updateTag(tag);
  } catch (error) {
    Sentry.captureException(error, { tags: { location }, extra: { tag } });
    revalidateTag(tag, "max");
  }
}

/** Access control: { id, isBusinessAssociate }. Call after changing BA standing. */
export function invalidateOrgCache(clerkOrgId: string) {
  expireTag(orgTag(clerkOrgId), "invalidateOrgCache");
}

/** Pricing: markupPercent. Call after an admin changes the markup. */
export function invalidateOrgPricingCache(clerkOrgId: string) {
  expireTag(orgPricingTag(clerkOrgId), "invalidateOrgPricingCache");
}