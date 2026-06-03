"use server";

import { prisma } from "@/utils/db";
import type { Prisma } from "@/generated/prisma";
import { KycDocType } from "@/generated/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type VaultDocumentRow = {
  id:          string;
  docType:     KycDocType;
  label:       string;
  description: string | null;
  fileUrl:     string;
  fileKey:     string;
  fileName:    string;
  fileSize:    number;
  mimeType:    string;
  uploadedAt:  Date;
  client: {
    id:          string;
    companyName: string;
    contactName: string | null;
  };
};

type GetVaultDocumentsInput = {
  q:       string;
  docType: KycDocType | "";
  page:    number;
};

const PAGE_SIZE = 25;

// ─────────────────────────────────────────────────────────────────────────────
// getVaultDocumentsAction
// ─────────────────────────────────────────────────────────────────────────────

export async function getVaultDocumentsAction({
  q,
  docType,
  page,
}: GetVaultDocumentsInput): Promise<{ documents: VaultDocumentRow[]; total: number }> {
  const skip = (page - 1) * PAGE_SIZE;

  const where: Prisma.ClientDocumentWhereInput = {
    // Only docs whose client is not soft-deleted
    client: { deletedAt: null },

    ...(docType ? { docType } : {}),

    ...(q
      ? {
          OR: [
            { label:            { contains: q, mode: "insensitive" } },
            { client: { companyName: { contains: q, mode: "insensitive" } } },
            { client: { contactName: { contains: q, mode: "insensitive" } } },
            { fileName:         { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [documents, total] = await Promise.all([
    prisma.clientDocument.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id:          true,
        docType:     true,
        label:       true,
        description: true,
        fileUrl:     true,
        fileKey:     true,
        fileName:    true,
        fileSize:    true,
        mimeType:    true,
        uploadedAt:  true,
        client: {
          select: {
            id:          true,
            companyName: true,
            contactName: true,
          },
        },
      },
    }),
    prisma.clientDocument.count({ where }),
  ]);

  return { documents, total };
}