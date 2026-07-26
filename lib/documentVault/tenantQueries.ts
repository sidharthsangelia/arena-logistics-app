/**
 * lib/documentVault/tenantQueries.ts
 *
 * The read side of a tenant's own client-document vault. Mirrors adminQueries.ts;
 * the difference is the hard orgId filter, which is never optional and never
 * comes from the caller's params.
 */

import "server-only";

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import {
  DEFAULT_VAULT_PAGE_SIZE,
  VAULT_PAGE_SIZE_OPTIONS,
  coerceVaultDocTypeFilter,
  coerceVaultSortField,
  matchingDocTypeLabels,
  type VaultDocTypeFilter,
  type VaultDocumentRow,
  type VaultListParams,
  type VaultPage,
  type VaultSortField,
} from "./config";

function coercePage(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.floor(value as number)
    : 1;
}

function coercePageSize(value: number | undefined): number {
  return (VAULT_PAGE_SIZE_OPTIONS as readonly number[]).includes(value as number)
    ? (value as number)
    : DEFAULT_VAULT_PAGE_SIZE;
}

function buildWhere(opts: {
  orgId: string;
  docType: VaultDocTypeFilter;
  search: string;
}): Prisma.ClientDocumentWhereInput {
  // orgId is set first and is never derived from user input. Soft-deleted
  // clients are excluded so a removed client's paperwork stops surfacing.
  const where: Prisma.ClientDocumentWhereInput = {
    orgId: opts.orgId,
    client: { deletedAt: null },
  };

  if (opts.docType) where.docType = opts.docType;

  if (opts.search) {
    const docTypes = matchingDocTypeLabels(opts.search);
    where.OR = [
      { label: { contains: opts.search, mode: "insensitive" } },
      { description: { contains: opts.search, mode: "insensitive" } },
      { fileName: { contains: opts.search, mode: "insensitive" } },
      { client: { companyName: { contains: opts.search, mode: "insensitive" } } },
      { client: { contactName: { contains: opts.search, mode: "insensitive" } } },
      // Typing "GST" or "cheque" should find documents by their type, not only
      // by filename.
      ...(docTypes.length ? [{ docType: { in: docTypes } }] : []),
    ];
  }

  return where;
}

function buildOrderBy(
  field: VaultSortField,
  dir: "asc" | "desc",
): Prisma.ClientDocumentOrderByWithRelationInput[] {
  const primary: Prisma.ClientDocumentOrderByWithRelationInput =
    field === "clientName" ? { client: { companyName: dir } } : { [field]: dir };

  // uploadedAt is the tiebreaker so rows with equal values keep a stable order
  // across pages.
  return field === "uploadedAt" ? [primary] : [primary, { uploadedAt: "desc" }];
}

export async function getTenantVaultPage(
  orgId: string,
  params: VaultListParams,
): Promise<VaultPage> {
  const requestedPage = coercePage(params.page);
  const pageSize = coercePageSize(params.pageSize);
  const sortField = coerceVaultSortField(params.sortField);
  const sortDir: "asc" | "desc" = params.sortDir === "asc" ? "asc" : "desc";
  const docType = coerceVaultDocTypeFilter(params.docType);
  const search = params.search?.trim() ?? "";

  const where = buildWhere({ orgId, docType, search });
  const orderBy = buildOrderBy(sortField, sortDir);

  const findPage = (targetPage: number) =>
    prisma.clientDocument.findMany({
      where,
      orderBy,
      skip: (targetPage - 1) * pageSize,
      take: pageSize,
      // Explicit select: fileKey is an UploadThing storage key the table never
      // renders and the browser has no business holding.
      select: {
        id: true,
        label: true,
        description: true,
        docType: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        uploadedAt: true,
        client: { select: { id: true, companyName: true, contactName: true } },
      },
    });

  const [firstAttempt, total] = await Promise.all([
    findPage(requestedPage),
    prisma.clientDocument.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // A bookmark can ask for a page that no longer exists, e.g. after deleting the
  // last few documents. Falling back to the last real page keeps that from
  // reading as "you have no documents".
  const page = Math.min(requestedPage, pageCount);
  const rows = page === requestedPage ? firstAttempt : await findPage(page);

  const mapped: VaultDocumentRow[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    description: r.description,
    docType: r.docType,
    fileUrl: r.fileUrl,
    fileName: r.fileName,
    fileSize: r.fileSize,
    mimeType: r.mimeType,
    uploadedAt: r.uploadedAt.toISOString(),
    client: r.client,
  }));

  return { rows: mapped, total, pageCount, page, pageSize };
}
