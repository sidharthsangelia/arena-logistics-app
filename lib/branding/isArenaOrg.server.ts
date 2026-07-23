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
  const { orgId } = await auth();
  return !!orgId && orgId === process.env.ARENA_ORG_ID;
}
