import "server-only";

import { prisma } from "@/utils/db";
import { Prisma, ShipmentStatus, ShipmentMode } from "@/generated/prisma";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getOrgShell } from "@/utils/tenant";

// ---------------------------------------------------------------------------
// Cache tags — mutation sites call revalidateTag with these so a booking or
// status change shows up immediately instead of waiting out the TTL below.
// ---------------------------------------------------------------------------

export const SHIPMENTS_LIST_TAG = "shipments-list";
export const SHIPMENTS_COUNTS_TAG = "shipments-counts";

// Short TTL: these lists are viewed constantly (dashboard-style) but don't
// need to be real-time — a few seconds of staleness is an easy trade for
// not hitting Postgres on every render. Mutations that change what's shown
// (booking, status update) revalidate the tags above immediately, so this
// is really just a ceiling for cases nothing explicitly invalidated.
const CACHE_TTL_SECONDS = 8;

// ---------------------------------------------------------------------------
// Auth — resolved *before* entering a cached scope. unstable_cache can't
// call auth()/cookies() itself, so every cached fetcher below takes the
// already-resolved orgId as a plain argument (which also makes it part of
// the cache key, scoping the cache correctly per tenant).
// ---------------------------------------------------------------------------

// Reads the shared cached org shell rather than issuing its own findUnique. The
// shipments route resolves this once per section (list + counts), and it used to
// be an uncached round trip every time. The redirect stays outside the cache.
async function resolveClientOrgId(): Promise<string> {
  const org = await getOrgShell();
  if (!org) redirect("/sign-in");

  return org.id;
}

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
  // Shown as a badge next to the shipment number, and used by the arena
  // dashboard to scope its domestic route to domestic rows only.
  mode: true,
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
  /**
   * Scope to one booking flow. The arena dashboard gives domestic its own
   * route, so each of the two ops lists passes its own mode and neither ever
   * shows the other's rows. Omitted on the tenant list, which shows both.
   */
  mode?: ShipmentMode;
}

type ShipmentsPageQuery = Omit<GetShipmentsPageParams, "client">;

const fetchShipmentsPage = unstable_cache(
  async (orgId: string | null, params: ShipmentsPageQuery) => {
    const { page, pageSize, sortField, sortDir, statuses, query, mode } = params;
    const where: Prisma.ShipmentWhereInput = {};

    if (orgId) {
      where.orgId = orgId;
    }

    if (mode) {
      where.mode = mode;
    }

    // -----------------------------------------------------------------------
    // Status filter
    // -----------------------------------------------------------------------

    if (statuses?.length) {
      where.status = {
        in: statuses,
      };
    }

    // -----------------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------------

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
  },
  ["shipments-page"],
  { revalidate: CACHE_TTL_SECONDS, tags: [SHIPMENTS_LIST_TAG] },
);

export async function getShipmentsPage({
  client = false,
  ...params
}: GetShipmentsPageParams) {
  const orgId = client ? await resolveClientOrgId() : null;
  return fetchShipmentsPage(orgId, params);
}

/**
 * Unfiltered counts per status.
 * Used by the summary cards and filter badges.
 */

const fetchShipmentStatusCounts = unstable_cache(
  async (orgId: string | null, mode?: ShipmentMode) => {
    const where: Prisma.ShipmentWhereInput = {};
    if (orgId) where.orgId = orgId;
    // Scoped the same way the list is, so the stat cards above a mode-specific
    // list always add up to the rows underneath it.
    if (mode) where.mode = mode;

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
  },
  ["shipment-status-counts"],
  { revalidate: CACHE_TTL_SECONDS, tags: [SHIPMENTS_COUNTS_TAG] },
);

export async function getShipmentStatusCounts(
  client = false,
  mode?: ShipmentMode,
) {
  const orgId = client ? await resolveClientOrgId() : null;
  return fetchShipmentStatusCounts(orgId, mode);
}