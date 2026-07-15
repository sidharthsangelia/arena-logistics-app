import "server-only";

import { prisma } from "@/utils/db";
import { Prisma, ShipmentStatus } from "@/generated/prisma";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

export type ShipmentSortField =
  | "createdAt"
  | "bookedAt"
  | "shipmentNumber"
  | "quotedTotal"
  | "totalActualWeightKg"
  | "status";

export const SORTABLE_FIELDS: ShipmentSortField[] = [
  "createdAt",
  "bookedAt",
  "shipmentNumber",
  "quotedTotal",
  "totalActualWeightKg",
  "status",
];

// ---------------------------------------------------------------------------
// Selection shape
// ---------------------------------------------------------------------------

const SHIPMENT_SELECT = {
  id: true,
  shipmentNumber: true,
  status: true,
  createdAt: true,
  bookedAt: true,
  selectedVendorName: true,
  selectedProductName: true,
  totalActualWeightKg: true,
  quotedTotal: true,
  currency: true,
  org: {
    select: {
      name: true,
      slug: true,
    },
  },
  client: {
    select: {
      companyName: true,
    },
  },
  pickupAddress: {
    select: {
      city: true,
      country: true,
    },
  },
  deliveryAddress: {
    select: {
      city: true,
      country: true,
    },
  },
  _count: {
    select: {
      packages: true,
      documents: true,
    },
  },
} satisfies Prisma.ShipmentSelect;

export type ShipmentRow = Prisma.ShipmentGetPayload<{
  select: typeof SHIPMENT_SELECT;
}>;

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export interface GetShipmentsPageParams {
  page: number;
  pageSize: number;
  sortField: ShipmentSortField;
  sortDir: "asc" | "desc";
  statuses?: ShipmentStatus[];
  query?: string;
  client?: boolean;
}

export async function getShipmentsPage({
  page,
  pageSize,
  sortField,
  sortDir,
  statuses,
  query,
  client = false,
}: GetShipmentsPageParams) {
  const where: Prisma.ShipmentWhereInput = {};

  // -------------------------------------------------------------------------
  // Client dashboard -> restrict to current organisation
  // -------------------------------------------------------------------------

  if (client) {
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

    where.orgId = org.id;
  }

  // -------------------------------------------------------------------------
  // Status filter
  // -------------------------------------------------------------------------

  if (statuses?.length) {
    where.status = {
      in: statuses,
    };
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  const q = query?.trim();

  if (q) {
    where.OR = [
      {
        shipmentNumber: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        mawbNumber: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        hawbNumber: {
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
      {
        client: {
          companyName: {
            contains: q,
            mode: "insensitive",
          },
        },
      },
      {
        pickupAddress: {
          city: {
            contains: q,
            mode: "insensitive",
          },
        },
      },
      {
        deliveryAddress: {
          city: {
            contains: q,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  const skip = (page - 1) * pageSize;

  const [rows, totalRows] = await Promise.all([
    prisma.shipment.findMany({
      where,
      select: SHIPMENT_SELECT,
      orderBy: {
        [sortField]: sortDir,
      },
      skip,
      take: pageSize,
    }),

    prisma.shipment.count({
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
 * Unfiltered counts per status.
 * Used by the summary cards and filter badges.
 */

export async function getShipmentStatusCounts(client = false) {
  const where: Prisma.ShipmentWhereInput = {};

  if (client) {
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

    where.orgId = org.id;
  }

  const counts = await prisma.shipment.groupBy({
    by: ["status"],
    where,
    _count: {
      _all: true,
    },
  });

  return Object.fromEntries(
    counts.map((c) => [c.status, c._count._all]),
  ) as Partial<Record<ShipmentStatus, number>>;
}