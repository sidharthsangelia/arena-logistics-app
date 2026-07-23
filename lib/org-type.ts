// lib/org-type.ts
//
// Org classification (Business Associate vs standard) shared across the client
// and server. This module is intentionally PURE — no Clerk / Prisma / server
// imports — so it is safe to pull into client components, server components,
// and ambient `.d.ts` files alike. The Clerk + Prisma logic that actually reads
// and writes this classification lives in ./org-type.server.ts.

export const ORG_TYPE = {
  businessAssociate: "business_associate",
  standard: "standard",
} as const;

export type OrgType = (typeof ORG_TYPE)[keyof typeof ORG_TYPE];

/** Map the DB `isBusinessAssociate` boolean onto the metadata enum. */
export function orgTypeFromIsBusinessAssociate(
  isBusinessAssociate: boolean,
): OrgType {
  return isBusinessAssociate ? ORG_TYPE.businessAssociate : ORG_TYPE.standard;
}

/** True when a resolved type grants Business Associate features. */
export function isBusinessAssociateType(
  orgType: OrgType | null | undefined,
): boolean {
  return orgType === ORG_TYPE.businessAssociate;
}

/**
 * Narrow an arbitrary value to a known OrgType, else null. Metadata and session
 * claims are free-form JSON that could hold anything (stale shapes, typos, a
 * value written by an older build), so every read goes through this guard.
 */
export function coerceOrgType(value: unknown): OrgType | null {
  return value === ORG_TYPE.businessAssociate || value === ORG_TYPE.standard
    ? value
    : null;
}

function readOrgTypeField(meta: unknown): unknown {
  if (meta && typeof meta === "object" && "orgType" in meta) {
    return (meta as Record<string, unknown>).orgType;
  }
  return undefined;
}

/**
 * Resolve an OrgType from a (private, public) metadata pair. Private metadata is
 * preferred because it is server-trusted and never exposed to the browser;
 * public is the fallback (and the value the client sidebar reads directly).
 * Returns null when neither carries a recognised value — the signal to fall
 * back to the database.
 */
export function readOrgTypeFromMetadata(
  privateMetadata: unknown,
  publicMetadata: unknown,
): OrgType | null {
  return (
    coerceOrgType(readOrgTypeField(privateMetadata)) ??
    coerceOrgType(readOrgTypeField(publicMetadata))
  );
}
