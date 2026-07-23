"use client";

import { useOrganization } from "@clerk/nextjs";

import { coerceOrgType, isBusinessAssociateType } from "@/lib/org-type";
import { useIsArenaOrg } from "./useIsArenaOrg";

/**
 * Whether the current org may generate a quote from a rate-result card.
 *
 * Quoting is for orgs that book on behalf of others: Business Associates quote
 * their clients, and Arena staff quote from the internal calculator. Standard
 * (direct-customer) orgs only view rates, so this returns false for them and
 * the "Get quote" affordance is hidden.
 *
 * The BA classification is read from Clerk public metadata (the mirror kept in
 * sync with the DB), so there is no server round-trip. This is purely the UI
 * affordance — `saveQuoteAction` enforces the same rule server-side, which is
 * the authoritative gate.
 */
export function useCanGenerateQuote(): boolean {
  const isArena = useIsArenaOrg();
  const { organization } = useOrganization();
  const isBusinessAssociate = isBusinessAssociateType(
    coerceOrgType(organization?.publicMetadata?.orgType),
  );
  return isArena || isBusinessAssociate;
}
