import "server-only";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { prisma } from "@/utils/db";
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

async function getCurrentOrgId(): Promise<string> {
  const { orgId: clerkOrgId } = await auth();

  if (!clerkOrgId) {
    redirect("/sign-in");
  }

  const org = await prisma.org.findUnique({
    where: {
      clerkOrgId,
    },
    select: {
      id: true,
    },
  });

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
  if (client) {
    const orgId = await getCurrentOrgId();

    const orgs = await prisma.org.findMany({
      where: {
        id: orgId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    return orgs;
  }

  const orgs = await prisma.org.findMany({
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

  return orgs;
}