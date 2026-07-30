"use server";

// actions/accounts/accounts.action.ts
//
// Commercial settings on an account: markup percentage, business associate
// standing, and the payment bypass.
//
// EVERY ACTION HERE IS ADMIN ONLY.
// Markup is Arena's margin, and utils/arena-auth.ts reserves margin for admins.
// Business associate standing sets that markup, so it lands in the same bucket:
// an ops member who cannot see the number must not be able to move it either.
//
// proxy.ts gates the route, but the Next.js docs are explicit that proxy is for
// optimistic checks rather than authorisation, and a server action can be POSTed
// directly without ever passing a route gate. So each action re-checks for
// itself. See utils/arena-auth.ts.
//
// Only async functions are exported from this file. Schemas and types live in
// lib/accounts/schema.ts, because Turbopack treats every export of a "use
// server" module as a runtime action and a type export fails the build.

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { syncOrgTypeMetadata } from "@/lib/org-type.server";
import { invalidateOrgCache, invalidateOrgPricingCache } from "@/utils/tenant";
import { ArenaForbiddenError, requireArenaAdmin } from "@/utils/arena-auth";
import {
  setBusinessAssociateStatusSchema,
  updateOrgSettingsSchema,
  type AccountActionResult,
  type SetBusinessAssociateStatusInput,
  type UpdateOrgSettingsInput,
} from "@/lib/accounts/schema";

type OrgSettingsPatch = {
  markupPercent?: number;
  isBusinessAssociate?: boolean;
  skipPayment?: boolean;
};

/**
 * An account's standing shows up in three places, so all three are revalidated:
 * its own page, the list of every account, and the associates list it just
 * joined or left.
 */
function revalidateAccount(orgId: string) {
  revalidatePath(`/arena-dashboard/accounts/${orgId}`);
  revalidatePath("/arena-dashboard/accounts");
  revalidatePath("/arena-dashboard/business-associates");
}

/**
 * Writes the patch, then mirrors the classification into Clerk metadata so
 * tenant-side checks (sidebar, route resolution) stay in sync without a database
 * read.
 *
 * The database write is the source of truth and has committed by the time the
 * mirror runs, so a metadata failure is logged inside syncOrgTypeMetadata and
 * does NOT fail the save. The value self-heals on the next backfill or read.
 */
async function applyOrgSettings(
  orgId: string,
  patch: OrgSettingsPatch,
): Promise<AccountActionResult> {
  const org = await prisma.org.findFirst({
    where: { id: orgId, deletedAt: null },
    select: { id: true, clerkOrgId: true },
  });

  if (!org) {
    return { success: false, error: "Account not found." };
  }

  const updated = await prisma.org.update({
    where: { id: orgId },
    data: patch,
    select: { isBusinessAssociate: true },
  });

  await syncOrgTypeMetadata(org.clerkOrgId, updated.isBusinessAssociate);

  // This is the ONLY path that writes any of these fields, so it is also the only
  // place their caches get dropped. Both entries carry a TTL purely as a backstop
  // for the case where this line never ran; the invalidation below is what
  // actually keeps them correct.
  //
  // The tenant layout renders its sidebar from a cached { id, isBusinessAssociate }
  // shell (utils/tenant.ts), and requireBusinessAssociateOrg gates /clients and
  // /quotes on the same entry. Drop it so a converted account gets its new routes
  // on the very next request.
  invalidateOrgCache(org.clerkOrgId);

  // Markup is cached separately with a much longer TTL, since it moves once or
  // twice a month. Only drop it when this save actually touched it, so a BA
  // promotion from the accounts list does not throw away a still-valid entry.
  if (patch.markupPercent !== undefined) {
    invalidateOrgPricingCache(org.clerkOrgId);
  }

  revalidateAccount(orgId);

  return { success: true };
}

/**
 * Shared tail of both actions. Keeps the forbidden case as a plain message the
 * dialog can show, and everything genuinely unexpected in Sentry.
 */
function toFailure(
  error: unknown,
  location: string,
  extra: Record<string, unknown>,
  fallback: string,
): AccountActionResult {
  if (error instanceof ArenaForbiddenError) {
    return { success: false, error: error.message };
  }

  Sentry.captureException(error, { tags: { location }, extra });

  return { success: false, error: fallback };
}

/** The full settings card on an account's detail page. */
export async function updateOrgSettings(
  input: UpdateOrgSettingsInput,
): Promise<AccountActionResult> {
  const parsed = updateOrgSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { orgId, ...patch } = parsed.data;

  try {
    await requireArenaAdmin();
    return await applyOrgSettings(orgId, patch);
  } catch (error) {
    return toFailure(
      error,
      "updateOrgSettings",
      { orgId },
      "Could not save changes. Please try again.",
    );
  }
}

/**
 * Promote or demote straight from the Accounts list, without opening the
 * account first. Deliberately leaves skipPayment alone: it is a separate
 * decision, and a row action that quietly reset it would be a trap.
 */
export async function setBusinessAssociateStatus(
  input: SetBusinessAssociateStatusInput,
): Promise<AccountActionResult> {
  const parsed = setBusinessAssociateStatusSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { orgId, isBusinessAssociate, markupPercent } = parsed.data;

  try {
    await requireArenaAdmin();
    return await applyOrgSettings(orgId, { isBusinessAssociate, markupPercent });
  } catch (error) {
    return toFailure(
      error,
      "setBusinessAssociateStatus",
      { orgId, isBusinessAssociate },
      "Could not update this account. Please try again.",
    );
  }
}
