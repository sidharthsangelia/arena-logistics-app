import { auth } from "@clerk/nextjs/server";

/**
 * Server-side counterpart to the `useIsArenaOrg` client hook.
 *
 * True only for Arena staff (Clerk `orgId` === Arena's org). Every tenant, BA
 * and client returns false, so callers can decide whether to show the raw
 * sourcing vendor/service name (Arena staff) or the white-labelled one
 * (customers). See carrierBranding.md for the why.
 *
 * Reads the server-only `ARENA_ORG_ID` (never the `NEXT_PUBLIC_` variant) since
 * this runs on the server.
 */
export async function isArenaOrg(): Promise<boolean> {
  return isArenaOrgId((await auth()).orgId);
}

/**
 * The same rule, for a caller that already has the org id in hand.
 *
 * Exists so a server action that has already called `auth()` does not have to
 * call it again just to ask this — and, more importantly, so the rule lives in
 * ONE place. An inline `orgId === process.env.ARENA_ORG_ID` at a second call
 * site is how the two drift, and the direction it drifts matters: this gates
 * sourcing detail (vendor names, which of our Aramex contracts quoted) out of
 * every customer-facing surface.
 *
 * Fails CLOSED. An unset ARENA_ORG_ID makes this false for everyone, which
 * hides sourcing detail from Arena staff too — inconvenient, and the right way
 * round.
 */
export function isArenaOrgId(orgId: string | null | undefined): boolean {
  const arenaOrgId = process.env.ARENA_ORG_ID;
  return !!orgId && !!arenaOrgId && orgId === arenaOrgId;
}
