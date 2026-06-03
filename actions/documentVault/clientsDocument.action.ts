"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/utils/db";
import { UTApi } from "uploadthing/server";
import { SaveKycDocumentInput, saveKycDocumentSchema } from "@/lib/validations/clientsDocument.schema";



// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ActionResult =
  | { success: true }
  | { success: false; message: string };

type SaveResult =
  | { success: true; documentId: string }
  | { success: false; message: string };





// ─────────────────────────────────────────────────────────────────────────────
// saveKycDocumentAction
//
// Called by UploadThing's onUploadComplete callback (server-side).
// Creates the DB record after the file has landed in UT storage.
// ─────────────────────────────────────────────────────────────────────────────

export async function saveKycDocumentAction(
  input: SaveKycDocumentInput,
): Promise<SaveResult> {
  try {
    const data = saveKycDocumentSchema.parse(input);

    // Verify the client exists and isn't soft-deleted
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, deletedAt: null },
      select: { id: true },
    });
    if (!client) {
      return { success: false, message: "Client not found." };
    }

    const doc = await prisma.clientDocument.create({
      data: {
        clientId:    data.clientId,
        docType:     data.docType,
        label:       data.label,
        description: data.description,
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

// ─────────────────────────────────────────────────────────────────────────────
// updateKycDocumentAction
//
// Allows editing the label / description of an existing document
// without re-uploading the file.
// ─────────────────────────────────────────────────────────────────────────────

export async function updateKycDocumentAction(
  documentId: string,
  input: { label: string; description?: string },
): Promise<ActionResult> {
  try {
    const doc = await prisma.clientDocument.findUnique({
      where: { id: documentId },
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

// ─────────────────────────────────────────────────────────────────────────────
// deleteKycDocumentAction
//
// Hard-deletes the DB record AND removes the file from UploadThing storage.
// We always attempt both; if UT deletion fails we still remove the DB record
// and log the orphan key so it can be cleaned up manually.
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteKycDocumentAction(
  documentId: string,
): Promise<ActionResult> {
  try {
    const doc = await prisma.clientDocument.findUnique({
      where: { id: documentId },
      select: { clientId: true, fileKey: true },
    });
    if (!doc) return { success: false, message: "Document not found." };

    // Delete from UploadThing storage first
    try {
      const utapi = new UTApi();
      await utapi.deleteFiles(doc.fileKey);
    } catch (utError) {
      // Log but don't block — orphan keys can be swept via UT dashboard
      console.error(
        "[KYC] UploadThing deletion failed for key:",
        doc.fileKey,
        utError,
      );
    }

    // Remove from DB
    await prisma.clientDocument.delete({ where: { id: documentId } });

    revalidatePath(`/clients/${doc.clientId}`);
    return { success: true };
  } catch (error) {
    console.error("deleteKycDocumentAction", error);
    return { success: false, message: "Failed to delete document." };
  }
}