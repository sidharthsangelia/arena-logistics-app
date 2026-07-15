import "server-only";

import { prisma } from "@/utils/db";
import type { Client, Org, Prisma } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const CLIENT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_CLIENT_PAGE_SIZE = 25;

export type ClientSortField = "companyName" | "contactName" | "createdAt" | "orgName";

export const CLIENT_SORTABLE_FIELDS: ClientSortField[] = [
  "companyName",
  "contactName",
  "createdAt",
  "orgName",
];

export type ClientRow = Client & { org: Pick<Org, "id" | "name" | "slug"> };

function buildOrderBy(
  field: ClientSortField,
  dir: "asc" | "desc"
): Prisma.ClientOrderByWithRelationInput {
  // orgName isn't a real Client column — it's the BA's name, sorted via the
  // to-one relation. Everything else is a direct scalar column.
  if (field === "orgName") return { org: { name: dir } };
  return { [field]: dir } as Prisma.ClientOrderByWithRelationInput;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export interface GetClientsPageParams {
  page: number;
  pageSize: number;
  sortField: ClientSortField;
  sortDir: "asc" | "desc";
  query?: string;
  orgIds?: string[];
}

export async function getClientsPage({
  page,
  pageSize,
  sortField,
  sortDir,
  query,
  orgIds,
}: GetClientsPageParams) {
  const where: Prisma.ClientWhereInput = { deletedAt: null };

  if (orgIds && orgIds.length > 0) {
    where.orgId = { in: orgIds };
  }

  const q = query?.trim();
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { org: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const skip = (page - 1) * pageSize;

  const [rows, totalRows] = await Promise.all([
    prisma.client.findMany({
      where,
      include: { org: { select: { id: true, name: true, slug: true } } },
      orderBy: buildOrderBy(sortField, sortDir),
      skip,
      take: pageSize,
    }),
    prisma.client.count({ where }),
  ]);

  return {
    rows,
    totalRows,
    pageCount: Math.max(Math.ceil(totalRows / pageSize), 1),
  };
}

/**
 * Options for the "Business Associate" filter. The list is filtered
 * client-side (cmdk) once loaded, so no per-keystroke request — capped at
 * 500 orgs, which comfortably covers current + medium-term BA counts.
 * If the org list ever gets much bigger than that, swap this for a
 * debounced async combobox instead of raising the cap.
 */
export async function getClientOrgOptions() {
  const orgs = await prisma.org.findMany({
    where: { clients: { some: { deletedAt: null } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 500,
  });
  return orgs;
}