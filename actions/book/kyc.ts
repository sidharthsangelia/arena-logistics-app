"use server";

/**
 * actions/book/kyc.ts — Booking wizard KYC vault fetch + save.
 *
 * Party-aware: reads from / writes to the KycDocument table for either the
 * ORG (shipping for itself) or a CLIENT (a BA booking on their behalf), via
 * the polymorphic orgId / clientId FKs. This mirrors the address-book routing
 * — a BA's client keeps their own reusable KYC vault, so the next booking for
 * that client auto-fetches their docs.
 *
 * The document type set is driven by the shared matrix in lib/booking/kyc.ts,
 * so what the vault stores/returns stays in lockstep with what the KYC step
 * asks for.
 */

import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { getCurrentOrg, assertOrgOwnsClient } from "@/actions/book/getOrgs";
import { KycDocType, PartyType } from "@/generated/prisma";
import type { Party } from "@/types/booking";
import {
  KYC_DOC_KEYS,
  KYC_KEY_TO_DOC_TYPE,
  KYC_DOC_TYPE_TO_KEY,
  type KycDocKey,
} from "@/lib/booking/kyc";

// ---------------------------------------------------------------------------
// Party → { orgId, clientId } resolver (asserts ownership)
// ---------------------------------------------------------------------------

async function resolveParty(party: Party, currentOrgId: string) {
  if (party.partyType === "ORG") {
    if (party.orgId !== currentOrgId) throw new Error("Org mismatch.");
    return { orgId: currentOrgId as string | null, clientId: null as string | null };
  }
  await assertOrgOwnsClient(currentOrgId, party.clientId);
  return { orgId: null as string | null, clientId: party.clientId as string | null };
}

// ---------------------------------------------------------------------------
// Types — serialisable (no Dates, no class instances)
// ---------------------------------------------------------------------------

export interface PartyKycDoc {
  key: KycDocKey;
  fileUrl: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  verifiedAt: string | null; // ISO string
  uploadedAt: string; // ISO string
}

export type GetKycDocsResult =
  | { success: true; docs: PartyKycDoc[] }
  | { success: false; error: string; docs: [] };

// ---------------------------------------------------------------------------
// getKycDocs — called by KycStep on mount, for the relevant party
// ---------------------------------------------------------------------------

export async function getKycDocs(party: Party): Promise<GetKycDocsResult> {
  try {
    const org = await getCurrentOrg();
    const { orgId, clientId } = await resolveParty(party, org.id);

    const wantedTypes = KYC_DOC_KEYS.map((k) => KYC_KEY_TO_DOC_TYPE[k]);

    const rows = await prisma.kycDocument.findMany({
      where: {
        orgId,
        clientId,
        partyType: party.partyType === "ORG" ? PartyType.ORG : PartyType.CLIENT,
        docType: { in: wantedTypes },
      },
      orderBy: { uploadedAt: "desc" }, // newest first → take the latest per type
      select: {
        docType: true,
        fileUrl: true,
        fileKey: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        verifiedAt: true,
        uploadedAt: true,
      },
    });

    // One doc per key — take the first (newest) for each.
    const seen = new Set<KycDocKey>();
    const docs: PartyKycDoc[] = [];

    for (const row of rows) {
      const key = KYC_DOC_TYPE_TO_KEY[row.docType];
      if (!key || seen.has(key)) continue;
      seen.add(key);

      docs.push({
        key,
        fileUrl: row.fileUrl,
        fileKey: row.fileKey,
        fileName: row.fileName,
        fileSize: row.fileSize,
        mimeType: row.mimeType,
        verifiedAt: row.verifiedAt?.toISOString() ?? null,
        uploadedAt: row.uploadedAt.toISOString(),
      });
    }

    return { success: true, docs };
  } catch (err) {
    console.error("[getKycDocs]", err);
    Sentry.captureException(err, { tags: { action: "getKycDocs" } });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch KYC documents.",
      docs: [],
    };
  }
}

// ---------------------------------------------------------------------------
// saveKycDoc — persist a freshly uploaded doc into the party's vault
// ---------------------------------------------------------------------------

export interface SaveKycDocInput {
  key: KycDocKey;
  label: string;
  fileUrl: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export type SaveKycDocResult =
  | { success: true; docId: string }
  | { success: false; message: string };

export async function saveKycDocAction(
  party: Party,
  input: SaveKycDocInput,
): Promise<SaveKycDocResult> {
  try {
    const org = await getCurrentOrg();
    const { orgId, clientId } = await resolveParty(party, org.id);

    const docType: KycDocType = KYC_KEY_TO_DOC_TYPE[input.key];
    if (!docType) return { success: false, message: "Unknown document type." };

    const doc = await prisma.kycDocument.create({
      data: {
        partyType: party.partyType === "ORG" ? PartyType.ORG : PartyType.CLIENT,
        orgId,
        clientId,
        docType,
        label: input.label,
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
      },
      select: { id: true },
    });

    return { success: true, docId: doc.id };
  } catch (err) {
    console.error("[saveKycDocAction]", err);
    Sentry.captureException(err, { tags: { action: "saveKycDoc" } });
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to save document.",
    };
  }
}
