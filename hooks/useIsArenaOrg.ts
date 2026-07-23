"use client";

import { useAuth } from "@clerk/nextjs";

/**
 * True only for Arena staff (Clerk `orgId` === Arena's org). Every tenant, BA
 * and client returns false.
 *
 * Used to gate the sourcing vendor's identity out of every customer-facing
 * surface: customers see carriers and services, Arena staff see vendors. See
 * carrierBranding.md for the why.
 *
 * Reads `NEXT_PUBLIC_ARENA_ORG_ID` (not the server-only `ARENA_ORG_ID`) because
 * this runs in the browser — `ARENA_ORG_ID` is stripped from the client bundle
 * and would be `undefined`, which silently hides vendors from Arena staff too.
 */
export function useIsArenaOrg(): boolean {
  const { orgId } = useAuth();
  return !!orgId && orgId === process.env.NEXT_PUBLIC_ARENA_ORG_ID;
}
