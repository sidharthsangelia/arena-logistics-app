"use server";

// actions/kyc/waiver.action.ts
//
// Grant and revoke the KYC waiver described on the KycWaiver model: the
// "they spoke to ops, let them book on Aadhaar alone" exception.
//
// EVERY ACTION HERE IS ADMIN ONLY.
// Waiving KYC is setting aside a compliance requirement on Arena's own licence
// to move goods, which puts it in the same bucket as margin and wallets in
// utils/arena-auth.ts: an ops member may see that a waiver exists, but only an
// admin may create or lift one. Hiding the card is presentation; these checks
// are the gate. A server action can be POSTed directly without ever passing a
// route gate, so each one re-checks for itself.
//
// Nothing here is callable from the tenant side. The tenant's only contact with
// a waiver is the boolean getKycDocs returns — no reason text, no admin name,
// no expiry date ever crosses to a customer's browser.

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { PartyType } from "@/generated/prisma";
import {
  ArenaForbiddenError,
  getActorName,
  requireArenaAdmin,
} from "@/utils/arena-auth";
import { waiverPartyWhere } from "@/lib/booking/waiver";
import {
  MAX_WAIVER_DAYS,
  grantKycWaiverSchema,
  revokeKycWaiverSchema,
  type GrantKycWaiverInput,
  type RevokeKycWaiverInput,
  type WaiverActionResult,
} from "@/lib/booking/waiverSchema";
import type { Party } from "@/types/booking";

/**
 * A waiver shows on the party's own page and, for a client, on the account page
 * of the BA that owns them. Both are revalidated so neither goes stale.
 */
function revalidateParty(party: Party, ownerOrgId?: string | null) {
  if (party.partyType === "ORG") {
    revalidatePath(`/arena-dashboard/accounts/${party.orgId}`);
    return;
  }

  revalidatePath(`/arena-dashboard/clients/${party.clientId}`);
  if (ownerOrgId) {
    revalidatePath(`/arena-dashboard/accounts/${ownerOrgId}`);
  }
}

function toFailure(
  error: unknown,
  location: string,
  extra: Record<string, unknown>,
  fallback: string,
): WaiverActionResult {
  if (error instanceof ArenaForbiddenError) {
    return { success: false, error: error.message };
  }

  Sentry.captureException(error, { tags: { location }, extra });

  return { success: false, error: fallback };
}

/**
 * Resolve the expiry date the dialog sent into an instant.
 *
 * The waiver runs to the END of the chosen day, in IST — ops picks "the 30th"
 * meaning the whole of the 30th, and a customer in India booking that evening
 * should not find it already closed. Bounded here as well as in the schema
 * because this is the value that actually reaches the database.
 */
function resolveExpiry(expiresOn: string): Date | null {
  const expiresAt = new Date(`${expiresOn}T23:59:59.999+05:30`);

  if (Number.isNaN(expiresAt.getTime())) return null;
  if (expiresAt.getTime() <= Date.now()) return null;

  // MAX_WAIVER_DAYS days out, counted to the end of that day — otherwise the
  // last date the picker offers (which resolves to 23:59 on day 365) lands just
  // past a plain now + 365 × 24h and gets rejected as too far away.
  const maxAt = Date.now() + (MAX_WAIVER_DAYS + 1) * 24 * 60 * 60 * 1000;
  if (expiresAt.getTime() > maxAt) return null;

  return expiresAt;
}

/** Confirm the party exists and is not soft-deleted before waiving anything. */
async function assertPartyExists(
  party: Party,
): Promise<{ ok: true; ownerOrgId: string | null } | { ok: false; error: string }> {
  if (party.partyType === "ORG") {
    const org = await prisma.org.findFirst({
      where: { id: party.orgId, deletedAt: null },
      select: { id: true },
    });
    return org
      ? { ok: true, ownerOrgId: org.id }
      : { ok: false, error: "Account not found." };
  }

  const client = await prisma.client.findFirst({
    where: { id: party.clientId, deletedAt: null },
    select: { orgId: true },
  });
  return client
    ? { ok: true, ownerOrgId: client.orgId }
    : { ok: false, error: "Client not found." };
}

/**
 * Record a waiver for a party.
 *
 * Any waiver already live for that party is revoked in the same transaction, so
 * "one active waiver per party" holds without a partial unique index. Extending
 * an exception is therefore a new row with its own reason, and the old one keeps
 * its own dates — the history stays readable instead of being overwritten.
 */
export async function grantKycWaiver(
  input: GrantKycWaiverInput,
): Promise<WaiverActionResult> {
  const parsed = grantKycWaiverSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { party, reason, expiresOn } = parsed.data;

  try {
    const { userId } = await requireArenaAdmin();

    const expiresAt = resolveExpiry(expiresOn);
    if (!expiresAt) {
      return {
        success: false,
        error: `Pick an expiry date in the future, no more than ${MAX_WAIVER_DAYS} days out.`,
      };
    }

    const exists = await assertPartyExists(party);
    if (!exists.ok) {
      return { success: false, error: exists.error };
    }

    const grantedByName = await getActorName(userId);
    const partyWhere = waiverPartyWhere(party);
    const now = new Date();

    await prisma.$transaction([
      prisma.kycWaiver.updateMany({
        where: { ...partyWhere, revokedAt: null },
        data: {
          revokedAt: now,
          revokedBy: userId,
          revokedByName: grantedByName,
        },
      }),
      prisma.kycWaiver.create({
        data: {
          partyType:
            party.partyType === "ORG" ? PartyType.ORG : PartyType.CLIENT,
          orgId: party.partyType === "ORG" ? party.orgId : null,
          clientId: party.partyType === "CLIENT" ? party.clientId : null,
          reason,
          expiresAt,
          grantedBy: userId,
          grantedByName,
        },
      }),
    ]);

    revalidateParty(party, exists.ownerOrgId);

    return { success: true };
  } catch (error) {
    return toFailure(
      error,
      "grantKycWaiver",
      { partyType: party.partyType },
      "Could not record the waiver. Please try again.",
    );
  }
}

/**
 * Lift a waiver before its expiry. The row stays — revoking is stamped onto it,
 * never deleted, so the fact that an exception once existed cannot be erased.
 */
export async function revokeKycWaiver(
  input: RevokeKycWaiverInput,
): Promise<WaiverActionResult> {
  const parsed = revokeKycWaiverSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { waiverId } = parsed.data;

  try {
    const { userId } = await requireArenaAdmin();

    const waiver = await prisma.kycWaiver.findUnique({
      where: { id: waiverId },
      select: { id: true, orgId: true, clientId: true, revokedAt: true },
    });

    if (!waiver) {
      return { success: false, error: "Waiver not found." };
    }

    // Already lifted, or lifted by another admin between render and click.
    // Nothing to do, and nothing worth interrupting anyone over.
    if (!waiver.revokedAt) {
      await prisma.kycWaiver.update({
        where: { id: waiverId },
        data: {
          revokedAt: new Date(),
          revokedBy: userId,
          revokedByName: await getActorName(userId),
        },
      });
    }

    if (waiver.orgId) {
      revalidateParty({ partyType: "ORG", orgId: waiver.orgId });
    } else if (waiver.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: waiver.clientId },
        select: { orgId: true },
      });
      revalidateParty(
        { partyType: "CLIENT", clientId: waiver.clientId },
        client?.orgId,
      );
    }

    return { success: true };
  } catch (error) {
    return toFailure(
      error,
      "revokeKycWaiver",
      { waiverId },
      "Could not lift the waiver. Please try again.",
    );
  }
}
