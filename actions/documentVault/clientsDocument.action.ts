"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { UTApi } from "uploadthing/server";
import {
  SaveKycDocumentInput,
  saveKycDocumentSchema,
} from "@/lib/validations/clientsDocument.schema";

// ---------------------------------------------------------------------------
// Tenant context
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionResult =
  | { success: true }
  | { success: false; message: string };

type SaveResult =
  | { success: true; documentId: string }
  | { success: false; message: string };

// ---------------------------------------------------------------------------
// saveKycDocumentAction
// ---------------------------------------------------------------------------

export async function saveKycDocumentAction(
  input: SaveKycDocumentInput & { orgId?: string },
): Promise<SaveResult> {
  try {
    // Use the supplied orgId if present (UploadThing callback context),
    // otherwise resolve from the Clerk session (normal server action context).
    const orgId = input.orgId ?? (await getDbOrgId());
    const data  = saveKycDocumentSchema.parse(input);
 
    // Client ownership already verified in UploadThing middleware when orgId
    // is supplied. Only re-verify when called from a session context.
    if (!input.orgId) {
      const client = await prisma.client.findFirst({
        where: { id: data.clientId, orgId, deletedAt: null },
        select: { id: true },
      });
      if (!client) return { success: false, message: "Client not found." };
    }
 
    const doc = await prisma.clientDocument.create({
      data: {
        orgId,
        clientId:    data.clientId,
        docType:     data.docType,
        label:       data.label,
        description: data.description ?? null,
        fileUrl:     data.fileUrl,
        fileKey:     data.fileKey,
        fileName:    data.fileName,
        fileSize:    data.fileSize,
        mimeType:    data.mimeType,
      },
      select: { id: true },
    });
 
    revalidatePath(`/clients/${data.clientId}`);
    return { success: true, documentId: doc.id };
  } catch (error) {
    console.error("saveKycDocumentAction", error);
    return { success: false, message: "Failed to save document." };
  }
}
 
// ---------------------------------------------------------------------------
// updateKycDocumentAction
// ---------------------------------------------------------------------------

export async function updateKycDocumentAction(
  documentId: string,
  input: { label: string; description?: string },
): Promise<ActionResult> {
  try {
    const orgId = await getDbOrgId();

    // orgId in where clause prevents editing another org's document
    const doc = await prisma.clientDocument.findFirst({
      where: { id: documentId, orgId },
      select: { clientId: true },
    });
    if (!doc) return { success: false, message: "Document not found." };

    await prisma.clientDocument.update({
      where: { id: documentId },
      data: {
        label:       input.label.trim(),
        description: input.description?.trim() ?? null,
      },
    });

    revalidatePath(`/clients/${doc.clientId}`);
    return { success: true };
  } catch (error) {
    console.error("updateKycDocumentAction", error);
    return { success: false, message: "Failed to update document." };
  }
}

// ---------------------------------------------------------------------------
// deleteKycDocumentAction
// ---------------------------------------------------------------------------

export async function deleteKycDocumentAction(
  documentId: string,
): Promise<ActionResult> {
  try {
    const orgId = await getDbOrgId();

    // orgId in where clause prevents deleting another org's document
    const doc = await prisma.clientDocument.findFirst({
      where: { id: documentId, orgId },
      select: { clientId: true, fileKey: true },
    });
    if (!doc) return { success: false, message: "Document not found." };

    // Delete from UploadThing first
    try {
      const utapi = new UTApi();
      await utapi.deleteFiles(doc.fileKey);
    } catch (utError) {
      // Log but don't block — orphan keys can be swept via UT dashboard
      console.error("[KYC] UploadThing deletion failed for key:", doc.fileKey, utError);
    }

    await prisma.clientDocument.delete({ where: { id: documentId } });

    revalidatePath(`/clients/${doc.clientId}`);
    return { success: true };
  } catch (error) {
    console.error("deleteKycDocumentAction", error);
    return { success: false, message: "Failed to delete document." };
  }
}