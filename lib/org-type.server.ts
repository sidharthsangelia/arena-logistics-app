// lib/org-type.server.ts
//
// Server-only helpers for reading and syncing an org's classification. Clerk
// org metadata acts as a cache in front of the DB `Org.isBusinessAssociate`
// column so that the common "is this a BA org?" check does NOT hit the database
// on every request. The DB remains the source of truth; metadata is a mirror
// that is kept in sync on org creation, on admin changes, and lazily on read.

import "server-only";

import * as Sentry from "@sentry/nextjs";
import { auth, clerkClient } from "@clerk/nextjs/server";

import { prisma } from "@/utils/db";
import {
  ORG_TYPE,
  type OrgType,
  coerceOrgType,
  orgTypeFromIsBusinessAssociate,
  readOrgTypeFromMetadata,
} from "./org-type";

export type OrgTypeSource = "session" | "clerk" | "db";

export type ResolvedOrgType = {
  orgType: OrgType;
  isBusinessAssociate: boolean;
  /** Where the answer came from — cheapest ("session") to costliest ("db"). */
  source: OrgTypeSource;
};

// ---------------------------------------------------------------------------
// resolveOrgType
//
// Resolve the ACTIVE org's classification as cheaply as possible:
//   1. Session claims  — zero network calls. Only populated when the Clerk
//      session token is customised with an `org_type` claim; silently skipped
//      otherwise, so it costs nothing when not configured.
//   2. Clerk metadata  — one Clerk API call, no DB round-trip.
//   3. Prisma          — the source of truth. Reaching here means the metadata
//      was absent, so we lazily backfill Clerk (fire-and-forget) to warm the
//      cache for next time.
//
// Never throws — it must be safe to call from a layout render. Returns null
// when there is no active org (or on unexpected failure) so callers degrade
// gracefully.
// ---------------------------------------------------------------------------

export async function resolveOrgType(): Promise<ResolvedOrgType | null> {
  try {
    const { orgId, sessionClaims } = await auth();
    if (!orgId) return null;

    // 1. Session claims (free) ------------------------------------------------
    const fromClaims = coerceOrgType(
      (sessionClaims as Record<string, unknown> | null)?.org_type,
    );
    if (fromClaims) return resolved(fromClaims, "session");

    // 2. Clerk metadata (no DB) ----------------------------------------------
    const fromClerk = await readOrgTypeFromClerk(orgId);
    if (fromClerk) return resolved(fromClerk, "clerk");

    // 3. DB fallback + lazy backfill -----------------------------------------
    const org = await prisma.org.findUnique({
      where: { clerkOrgId: orgId },
      select: { isBusinessAssociate: true },
    });
    if (!org) return null;

    // Warm the Clerk cache so the next read skips the DB. Fire-and-forget: a
    // failure only costs one extra DB read next time, so it must not block or
    // fail this call.
    void syncOrgTypeMetadata(orgId, org.isBusinessAssociate);

    return resolved(
      orgTypeFromIsBusinessAssociate(org.isBusinessAssociate),
      "db",
    );
  } catch (error) {
    Sentry.captureException(error, { tags: { location: "resolveOrgType" } });
    return null;
  }
}

function resolved(orgType: OrgType, source: OrgTypeSource): ResolvedOrgType {
  return {
    orgType,
    isBusinessAssociate: orgType === ORG_TYPE.businessAssociate,
    source,
  };
}

async function readOrgTypeFromClerk(clerkOrgId: string): Promise<OrgType | null> {
  try {
    const client = await clerkClient();
    const org = await client.organizations.getOrganization({
      organizationId: clerkOrgId,
    });
    return readOrgTypeFromMetadata(org.privateMetadata, org.publicMetadata);
  } catch (error) {
    // A Clerk hiccup must not break the caller — fall through to the DB.
    Sentry.captureException(error, {
      tags: { location: "readOrgTypeFromClerk" },
      extra: { clerkOrgId },
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// syncOrgTypeMetadata
//
// Write the classification into BOTH public and private Clerk metadata:
//   - public  → readable in the browser; drives the tenant sidebar with no
//     server round-trip.
//   - private → server-trusted, never exposed to the client.
//
// Clerk's update endpoint shallow-merges top-level keys, so other metadata
// fields are left untouched. Safe to call redundantly. Returns true on success,
// false (logged to Sentry) on failure so callers that care about sync can react
// without a throw bubbling up.
// ---------------------------------------------------------------------------

export async function syncOrgTypeMetadata(
  clerkOrgId: string,
  isBusinessAssociate: boolean,
): Promise<boolean> {
  const orgType = orgTypeFromIsBusinessAssociate(isBusinessAssociate);
  try {
    const client = await clerkClient();
    await client.organizations.updateOrganizationMetadata(clerkOrgId, {
      publicMetadata: { orgType },
      privateMetadata: { orgType },
    });
    return true;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "syncOrgTypeMetadata" },
      extra: { clerkOrgId, orgType },
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// backfillActiveOrgTypeMetadata
//
// Idempotent backfill for the ACTIVE org: if Clerk metadata already carries a
// valid classification, do nothing; otherwise read the DB and write it. Meant
// to be triggered from the client exactly once, when the sidebar notices the
// public metadata is missing (see components/dashboard/AppSideBar.tsx) — that
// way the write happens only for orgs created before this feature existed, not
// on every render.
//
// Never throws; returns quietly on any failure (reported to Sentry).
// ---------------------------------------------------------------------------

export async function backfillActiveOrgTypeMetadata(): Promise<void> {
  try {
    const { orgId } = await auth();
    if (!orgId) return;

    // Already populated? Nothing to do.
    if (await readOrgTypeFromClerk(orgId)) return;

    const org = await prisma.org.findUnique({
      where: { clerkOrgId: orgId },
      select: { isBusinessAssociate: true },
    });
    if (!org) return;

    await syncOrgTypeMetadata(orgId, org.isBusinessAssociate);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "backfillActiveOrgTypeMetadata" },
    });
  }
}
