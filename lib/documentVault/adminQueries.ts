/**
 * lib/documentVault/adminQueries.ts
 *
 * The read side of the Arena-side document vault. Separated from the action so
 * the "use server" file exports functions only.
 *
 * Scope note: there is intentionally no orgId filter here. This is the
 * company-internal view across every tenant, which is why the action that calls
 * it gates on Arena membership.
 */

import "server-only";

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import {
  DEFAULT_VAULT_PAGE_SIZE,
  VAULT_PAGE_SIZE_OPTIONS,
  coerceAdminVaultSortField,
  coerceVaultDocTypeFilter,
  matchingDocTypeLabels,
  type AdminVaultDocumentRow,
  type AdminVaultListParams,
  type AdminVaultPage,
  type AdminVaultSortField,
  type VaultDocTypeFilter,
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
  docType: VaultDocTypeFilter;
  search: string;
}): Prisma.ClientDocumentWhereInput {
  // Soft-deleted clients are excluded, matching the tenant-side vault. A
  // document whose client has been removed should not surface here either.
  const where: Prisma.ClientDocumentWhereInput = {
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
      { org: { name: { contains: opts.search, mode: "insensitive" } } },
      { org: { slug: { contains: opts.search, mode: "insensitive" } } },
      // Typing "GST" or "cheque" should find documents by their type, not only
      // by filename. Shared with the tenant vault so both search alike.
      ...(docTypes.length ? [{ docType: { in: docTypes } }] : []),
    ];
  }

  return where;
}

function buildOrderBy(
  field: AdminVaultSortField,
  dir: "asc" | "desc",
): Prisma.ClientDocumentOrderByWithRelationInput[] {
  const primary: Prisma.ClientDocumentOrderByWithRelationInput =
    field === "orgName"
      ? { org: { name: dir } }
      : field === "clientName"
        ? { client: { companyName: dir } }
        : { [field]: dir };

  // uploadedAt is the tiebreaker so rows with equal values keep a stable order
  // across pages.
  return field === "uploadedAt" ? [primary] : [primary, { uploadedAt: "desc" }];
}

export async function getAdminVaultPage(
  params: AdminVaultListParams,
): Promise<AdminVaultPage> {
  const requestedPage = coercePage(params.page);
  const pageSize = coercePageSize(params.pageSize);
  const sortField = coerceAdminVaultSortField(params.sortField);
  const sortDir: "asc" | "desc" = params.sortDir === "asc" ? "asc" : "desc";
  const docType = coerceVaultDocTypeFilter(params.docType);
  const search = params.search?.trim() ?? "";

  const where = buildWhere({ docType, search });
  const orderBy = buildOrderBy(sortField, sortDir);

  const findPage = (targetPage: number) =>
    prisma.clientDocument.findMany({
      where,
      orderBy,
      skip: (targetPage - 1) * pageSize,
      take: pageSize,
      // Explicit select rather than include: fileKey is an UploadThing storage
      // key the table never renders and the browser has no business holding.
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
        org: { select: { id: true, name: true, slug: true } },
        client: { select: { id: true, companyName: true, contactName: true } },
      },
    });

  const [firstAttempt, total] = await Promise.all([
    findPage(requestedPage),
    prisma.clientDocument.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // A bookmark or a stale link can ask for a page that no longer exists. Falling
  // back to the last real page keeps that from reading as "no documents exist".
  const page = Math.min(requestedPage, pageCount);
  const rows = page === requestedPage ? firstAttempt : await findPage(page);

  const mapped: AdminVaultDocumentRow[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    description: r.description,
    docType: r.docType,
    fileUrl: r.fileUrl,
    fileName: r.fileName,
    fileSize: r.fileSize,
    mimeType: r.mimeType,
    uploadedAt: r.uploadedAt.toISOString(),
    org: r.org,
    client: r.client,
  }));

  return { rows: mapped, total, pageCount, page, pageSize };
}
