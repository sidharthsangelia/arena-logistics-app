# 09. Multi-tenancy where one facet is a security boundary and one is not

**Kind:** architecture · **Tier:** 2 · **Est. length:** 1400 words · standalone

## Hook

Two fields on the same database row. One is cached for sixty seconds, one for far
longer, and they are deliberately in different cache entries with different tags.
The reason is that one of them decides what a user is allowed to see.

## Thesis

Caching decisions are usually framed as freshness versus cost. Add a third axis:
blast radius when the cache is wrong. Once you do, "cache the org row" becomes
obviously incorrect, and the split falls out on its own.

## Outline

1. The shape. Clerk owns identity and organisations, Postgres owns everything
   else, and every tenant page needs two facts on every navigation: the internal
   org id, and whether this org is a business associate (which decides its
   routes).
2. Facet one, `org:<id>`: id plus the BA flag. Small, cacheable, 60s TTL.
3. Facet two, `org-pricing:<id>`: the markup percent. Money, but not access, so
   it can carry a much longer TTL without dragging the security-critical entry
   along with it.
4. Facet three, the wallet balance, is not cached at all. Some things have no
   correct staleness.
5. Why the TTL is a ceiling, not the refresh mechanism. Invalidation on write is
   the real mechanism; the TTL only governs the case where invalidation never ran
   at all, such as a direct SQL edit or a bug in the write path. This reframing is
   the most portable idea in the post.
6. Why 60s and not 600s specifically: this entry backs an authorisation decision,
   so the TTL is the window in which a demoted org keeps reaching routes it
   should not.
7. Throw, do not return null, on a database error, so the cache does not store the
   failure and the next request retries fresh.
8. Optimistic gating versus real authorisation. Middleware redirects non-admins
   away from money routes as a courtesy, so nobody lands on a page that would only
   tell them off. The page re-checks on render and every mutating action checks
   for itself, because a direct POST to a server action never passes through the
   route matcher. The framework docs say middleware is for optimistic checks;
   this is what taking that seriously looks like.
9. Mirroring flags into the identity provider's metadata, and the policy that
   makes it safe: only non-sensitive routing and UI-gating booleans go into
   publicly readable metadata. Never profile or KYC data. Postgres stays the
   source of truth, so the sync is allowed to fail non-fatally, because it is a
   UI cache and not an authority.
10. The rule that follows: never derive a security decision from a session claim
    you also treat as a cache.
11. One resolver for "whose data am I looking at", returning the org id from the
    session rather than from anything the caller passed. A server action is a
    public endpoint, so an `orgId` parameter is an org-id-shaped hole.
12. Two roles inside the staff org (member and admin), the definition of "money"
    that separates them, and why every check goes through one file: the day admin
    needs to split from "can invite members", the change lands in one place.

## Trim to fit

Twelve outline points is two posts. Keep 1 to 8, which is the cache-and-auth
argument and self-contained. Points 9 to 12 (metadata mirroring, the session-claim
rule, the audience resolver, the two staff roles) become a second post on
authorisation boundaries in server actions.

## Code

- `utils/tenant.ts` (the cache-tag comments are the spine)
- `utils/arena-auth.ts`, `proxy.ts`
- `utils/clerk/syncProfileMetadata.ts`, `lib/org-type.server.ts`
- `lib/notifications/audience.ts`
