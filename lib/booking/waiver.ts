import "server-only";

/**
 * lib/booking/waiver.ts
 *
 * Reads of the KYC waiver (see the KycWaiver model). Server only, and
 * deliberately so: the waiver row carries the reason ops wrote down and the
 * name of the admin who granted it, neither of which a customer should ever
 * see. This module is the only place that touches the table for a read, and it
 * exposes two shapes:
 *
 *   isKycWaived(party)        → boolean. The tenant-safe answer. Nothing about
 *                               who, why or until when crosses to the browser.
 *   getActiveKycWaiver(party) → the whole row, for the Arena admin UI.
 *
 * ACTIVE means not revoked and not yet expired, evaluated against the database
 * clock at read time. There is no cache: a revoke has to bite on the very next
 * booking attempt, and this is a single indexed read.
 */

import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { PartyType } from "@/generated/prisma";
import type { Party } from "@/types/booking";

/** Narrow a Party to the polymorphic FK pair the KycWaiver table stores. */
export function waiverPartyWhere(party: Party) {
  return party.partyType === "ORG"
    ? { partyType: PartyType.ORG, orgId: party.orgId, clientId: null }
    : { partyType: PartyType.CLIENT, clientId: party.clientId, orgId: null };
}

export interface ActiveKycWaiver {
  id: string;
  reason: string;
  expiresAt: Date;
  grantedByName: string | null;
  grantedAt: Date;
}

/**
 * The live waiver for a party, or null. Arena-side callers only — the reason
 * text and the granting admin's name are in here.
 */
export async function getActiveKycWaiver(
  party: Party,
): Promise<ActiveKycWaiver | null> {
  return prisma.kycWaiver.findFirst({
    where: {
      ...waiverPartyWhere(party),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { grantedAt: "desc" },
    select: {
      id: true,
      reason: true,
      expiresAt: true,
      grantedByName: true,
      grantedAt: true,
    },
  });
}

/**
 * Whether a party may book on Aadhaar alone right now.
 *
 * Fails CLOSED. If the read throws, the caller is told there is no waiver, so
 * the customer is asked for the full document set — inconvenient, never unsafe.
 * The alternative (defaulting to true on an error) would let a database blip
 * wave every shipment through.
 */
export async function isKycWaived(party: Party): Promise<boolean> {
  try {
    const count = await prisma.kycWaiver.count({
      where: {
        ...waiverPartyWhere(party),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return count > 0;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "isKycWaived" },
      extra: { partyType: party.partyType },
    });
    return false;
  }
}
