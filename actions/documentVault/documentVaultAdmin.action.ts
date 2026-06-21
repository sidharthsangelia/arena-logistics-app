"use server";

import { prisma } from "@/utils/db";
import type { KycDocType, Prisma } from "@/generated/prisma";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const PAGE_SIZE = 25;

// Same shape as the tenant-scoped VaultDocumentRow, plus the org the
// document belongs to — needed once results span multiple tenants so ops
// can tell which business associate each row is for.
export type AdminVaultDocumentRow = {
  id: string;
  label: string;
  description: string | null;
  docType: KycDocType;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
  org: {
    id: string;
    name: string;
    slug: string;
  };
  client: {
    id: string;
    companyName: string;
    contactName: string | null;
  };
};

type GetAllVaultDocumentsParams = {
  q?: string;
  docType?: KycDocType | "";
  page?: number;
};

export async function getAllVaultDocumentsAction({
  q = "",
  docType = "",
  page = 1,
}: GetAllVaultDocumentsParams): Promise<{
  documents: AdminVaultDocumentRow[];
  total: number;
}> {
  // Arena Dashboard is the company-internal view across every tenant org.
  // Unlike getVaultDocumentsAction (tenant-scoped), there is intentionally
  // no orgId filter below — this is meant to let ops search every business
  // associate's documents from one place.
   

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const query = q.trim();
  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * PAGE_SIZE;

  const where: Prisma.ClientDocumentWhereInput = {
    ...(docType ? { docType } : {}),
    ...(query
      ? {
          OR: [
            { label: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { fileName: { contains: query, mode: "insensitive" } },
            { client: { companyName: { contains: query, mode: "insensitive" } } },
            { client: { contactName: { contains: query, mode: "insensitive" } } },
            { org: { name: { contains: query, mode: "insensitive" } } },
            { org: { slug: { contains: query, mode: "insensitive" } } },
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
      include: {
        org: { select: { id: true, name: true, slug: true } },
        client: { select: { id: true, companyName: true, contactName: true } },
      },
    }),
    prisma.clientDocument.count({ where }),
  ]);

  return { documents, total };
}