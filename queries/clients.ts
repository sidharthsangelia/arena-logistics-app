import "server-only";

import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";

import { prisma } from "@/utils/db";
import { getOrgShell } from "@/utils/tenant";
import type { Client, Org, Prisma } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const CLIENT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_CLIENT_PAGE_SIZE = 25;

export type ClientSortField =
  | "companyName"
  | "contactName"
  | "createdAt"
  | "orgName";

export const CLIENT_SORTABLE_FIELDS: ClientSortField[] = [
  "companyName",
  "contactName",
  "createdAt",
  "orgName",
];

export type ClientRow = Client & {
  org: Pick<Org, "id" | "name" | "slug">;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Resolves through the shared cached org shell rather than issuing its own
// findUnique. The /clients route calls this twice per load (once for the page of
// rows, once for the filter options) and it used to be an uncached round trip
// each time. The redirect stays here, outside the cache boundary.
async function getCurrentOrgId(): Promise<string> {
  const org = await getOrgShell();

  if (!org) {
    redirect("/sign-in");
  }

  return org.id;
}

function buildOrderBy(
  field: ClientSortField,
  dir: "asc" | "desc",
): Prisma.ClientOrderByWithRelationInput {
  if (field === "orgName") {
    return {
      org: {
        name: dir,
      },
    };
  }

  return {
    [field]: dir,
  } as Prisma.ClientOrderByWithRelationInput;
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

  /**
   * Client dashboard.
   * Restricts all results to the currently authenticated organisation.
   */
  client?: boolean;
}

// NOTE ON CACHING
// This one is deliberately uncached. It returns whole Prisma Client rows, and
// the table's "Created" column calls Intl.DateTimeFormat on row.createdAt —
// unstable_cache round-trips its value as JSON, so a cache hit would hand that
// column a string and throw. Caching it means introducing a DTO layer first.
// It is also the read most likely to be wrong when stale: someone who just added
// a client expects to see it. The route streams instead (see the page), so the
// shell is instant even though this query is live.
export async function getClientsPage({
  page,
  pageSize,
  sortField,
  sortDir,
  query,
  orgIds,
  client = false,
}: GetClientsPageParams) {
  const where: Prisma.ClientWhereInput = {
    deletedAt: null,
  };

  // -------------------------------------------------------------------------
  // Client dashboard -> current organisation only
  // -------------------------------------------------------------------------

  if (client) {
    where.orgId = await getCurrentOrgId();
  } else if (orgIds?.length) {
    where.orgId = {
      in: orgIds,
    };
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  const q = query?.trim();

  if (q) {
    where.OR = [
      {
        companyName: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        contactName: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        phone: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        city: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        org: {
          name: {
            contains: q,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  const skip = (page - 1) * pageSize;

  const [rows, totalRows] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        org: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: buildOrderBy(sortField, sortDir),
      skip,
      take: pageSize,
    }),

    prisma.client.count({
      where,
    }),
  ]);

  return {
    rows,
    totalRows,
    pageCount: Math.max(Math.ceil(totalRows / pageSize), 1),
  };
}

/**
 * Business Associate filter options.
 *
 * Company dashboard:
 *   Returns all organisations that have at least one client.
 *
 * Client dashboard:
 *   Returns only the current organisation.
 */
export async function getClientOrgOptions(client = false) {
  const orgId = client ? await getCurrentOrgId() : null;
  return fetchClientOrgOptions(orgId);
}

// Cached for 60s. These are organisation names for a filter dropdown: renaming
// an org is rare, and on the tenant side the list is a single row — the caller's
// own org — which cannot change at all within a session. Safe to cache as-is
// because the shape is plain strings, with no Date or Decimal to survive the
// JSON round trip.
const fetchClientOrgOptions = unstable_cache(
  async (orgId: string | null) => {
    if (orgId) {
      return prisma.org.findMany({
        where: { id: orgId },
        select: { id: true, name: true },
      });
    }

    return prisma.org.findMany({
      where: {
        clients: {
          some: {
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
      take: 500,
    });
  },
  ["client-org-options"],
  { revalidate: 60 },
);