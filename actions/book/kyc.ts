"use server";

/**
 * kyc.actions.ts — Booking wizard: fetch org's own KYC docs from the vault.
 *
 * Uses the same auth pattern as your existing clientDocument actions.
 * Reads from KycDocument (partyType=ORG), NOT ClientDocument (client-scoped).
 *
 * If you haven't built the org-level KYC upload flow yet, this will return
 * an empty array and the KYC step will show upload zones for everything.
 * That's safe — the step degrades gracefully.
 */

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";         // same import as your existing action
import { KycDocType, PartyType } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Helpers — same pattern as your getDbOrgId()
// ---------------------------------------------------------------------------

async function getDbOrgId(): Promise<string> {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) throw new Error("No active organisation in session.");

  const org = await prisma.org.findUnique({
    where: { clerkOrgId },
    select: { id: true },
  });
  if (!org) throw new Error(`Org not found for clerkOrgId: ${clerkOrgId}`);
  return org.id;
}

// Maps our form keys to the KycDocType enum values in your Prisma schema
const DOC_TYPE_MAP = {
  pan:     KycDocType.PAN_CARD,
  aadhaar: KycDocType.ADHAR_CARD,
  gst:     KycDocType.GST_CERTIFICATE,
  iec:     KycDocType.IEC_CODE,
} as const;

// ---------------------------------------------------------------------------
// Types — serialisable (no Dates, no class instances)
// ---------------------------------------------------------------------------

export type OrgKycDocKey = keyof typeof DOC_TYPE_MAP;

export interface OrgKycDoc {
  key: OrgKycDocKey;
  fileUrl: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  verifiedAt: string | null; // ISO string
  uploadedAt: string;        // ISO string
}

export type GetOrgKycDocsResult =
  | { success: true;  docs: OrgKycDoc[] }
  | { success: false; error: string; docs: [] };

// ---------------------------------------------------------------------------
// getOrgKycDocs — called by KycStep on mount
// ---------------------------------------------------------------------------

export async function getOrgKycDocs(): Promise<GetOrgKycDocsResult> {
  try {
    const orgId = await getDbOrgId();

    const rows = await prisma.kycDocument.findMany({
      where: {
        orgId,
        partyType: "ORG",
        docType: { in: Object.values(DOC_TYPE_MAP) },
      },
      orderBy: { uploadedAt: "desc" },  // newest first so we take the latest per type
      select: {
        docType:    true,
        fileUrl:    true,
        fileKey:    true,
        fileName:   true,
        fileSize:   true,
        mimeType:   true,
        verifiedAt: true,
        uploadedAt: true,
      },
    });

    // One doc per type — take the first (newest) for each key
    const seen = new Set<OrgKycDocKey>();
    const docs: OrgKycDoc[] = [];

    for (const row of rows) {
      const key = (
        Object.entries(DOC_TYPE_MAP) as [OrgKycDocKey, KycDocType][]
      ).find(([, v]) => v === row.docType)?.[0];

      if (!key || seen.has(key)) continue;
      seen.add(key);

      docs.push({
        key,
        fileUrl:    row.fileUrl,
        fileKey:    row.fileKey,
        fileName:   row.fileName,
        fileSize:   row.fileSize,
        mimeType:   row.mimeType,
        verifiedAt: row.verifiedAt?.toISOString() ?? null,
        uploadedAt: row.uploadedAt.toISOString(),
      });
    }

    return { success: true, docs };
  } catch (err) {
    console.error("[getOrgKycDocs]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch KYC documents.",
      docs: [],
    };
  }
}


export interface SaveOrgKycDocInput {
  docType:  KycDocType;
  label:    string;
  fileUrl:  string;
  fileKey:  string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}
 
// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------
 
export type SaveOrgKycDocResult =
  | { success: true;  docId: string }
  | { success: false; message: string };
 
// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------
 
export async function saveOrgKycDocAction(
  input: SaveOrgKycDocInput,
): Promise<SaveOrgKycDocResult> {
  try {
    const { orgId: clerkOrgId } = await auth();
    if (!clerkOrgId) {
      return { success: false, message: "Not authenticated." };
    }
 
    const org = await prisma.org.findUnique({
      where:  { clerkOrgId },
      select: { id: true },
    });
    if (!org) {
      return { success: false, message: "Organisation not found." };
    }
 
    const doc = await prisma.kycDocument.create({
      data: {
        partyType: PartyType.ORG,
        orgId:     org.id,
        docType:   input.docType,
        label:     input.label,
        fileUrl:   input.fileUrl,
        fileKey:   input.fileKey,
        fileName:  input.fileName,
        fileSize:  input.fileSize,
        mimeType:  input.mimeType,
      },
      select: { id: true },
    });
 
    return { success: true, docId: doc.id };
  } catch (err) {
    console.error("[saveOrgKycDocAction]", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to save document.",
    };
  }
}
 