import { Suspense } from "react";
import { AlertCircle, Clock, Package, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ShipmentMode, ShipmentStatus } from "@/generated/prisma";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  SORTABLE_FIELDS,
  getShipmentStatusCounts,
  getShipmentsPage,
  type ShipmentSortField,
} from "@/queries/shipments";

import StatCard from "@/components/StatCard";
import { ShipmentsTable } from "@/components/shipments/ShipmentsTable";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";
import {
  INTERNATIONAL_STAT_TILES,
  ShipmentStatsSkeleton,
  TotalBadgeSkeleton,
} from "@/components/shipments/ShipmentListSkeletons";

// ---------------------------------------------------------------------------
// Search params → typed, validated query params. Anything malformed silently
// falls back to a sane default rather than throwing.
// ---------------------------------------------------------------------------

type RawSearchParams = Record<string, string | string[] | undefined>;

function parseSearchParams(sp: RawSearchParams) {
  const pageRaw = Number(sp.page);
  const page =
    Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const pageSizeRaw = Number(sp.pageSize);
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(
    pageSizeRaw,
  )
    ? pageSizeRaw
    : DEFAULT_PAGE_SIZE;

  const sortField: ShipmentSortField = SORTABLE_FIELDS.includes(
    sp.sort as ShipmentSortField,
  )
    ? (sp.sort as ShipmentSortField)
    : "createdAt";

  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const validStatuses = new Set(Object.values(ShipmentStatus));
  const statuses =
    typeof sp.status === "string" && sp.status.length > 0
      ? (sp.status
          .split(",")
          .filter((s) =>
            validStatuses.has(s as ShipmentStatus),
          ) as ShipmentStatus[])
      : undefined;

  const query = typeof sp.q === "string" ? sp.q : undefined;

  return { page, pageSize, sortField, sortDir, statuses, query };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// The counter row and the table need different queries, so they wait separately.
// The heading and the four counter labels need neither and are printed before
// either query starts: they are the same words on every visit.

export default async function ArenaBookingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const params = parseSearchParams(sp);

  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            International bookings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Export shipments submitted by clients, across every business
            associate. Domestic bookings live on their own page.
          </p>
        </div>
        <Suspense fallback={<TotalBadgeSkeleton />}>
          <TotalBadge />
        </Suspense>
      </div>

      {/* ── Summary stats (unfiltered — always the full picture) ── */}
      <Suspense fallback={<ShipmentStatsSkeleton tiles={INTERNATIONAL_STAT_TILES} />}>
        <StatsSection />
      </Suspense>

      {/* ── Table ──
          Its own boundary, and the slower of the two: the counts are four
          grouped counts, the table is a page of rows with their orgs, clients
          and addresses. Separating them means the counters are readable while
          the rows are still coming. */}
      <Suspense fallback={<DataTableSkeleton columns={9} rows={10} withToolbar />}>
        <TableSection params={params} />
      </Suspense>
    </div>
  );
}

/** The four counters. Unfiltered, so they do not change as the table is filtered. */
async function StatsSection() {
  const statusCounts = await getShipmentStatusCounts(
    false,
    ShipmentMode.INTERNATIONAL,
  );

  const needsAttention =
    (statusCounts.DOCUMENTS_PENDING ?? 0) +
    (statusCounts.CUSTOMS_HOLD ?? 0) +
    (statusCounts.ON_HOLD ?? 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Awaiting ops"
        value={statusCounts.BOOKED ?? 0}
        icon={Clock}
        sub="Newly booked"
      />
      <StatCard
        label="Processing"
        value={statusCounts.PROCESSING ?? 0}
        icon={TrendingUp}
      />
      <StatCard
        label="In transit"
        value={statusCounts.IN_TRANSIT ?? 0}
        icon={Package}
      />
      <StatCard
        label="Needs attention"
        value={needsAttention}
        icon={AlertCircle}
        sub="Hold / docs / customs"
      />
    </div>
  );
}

async function TotalBadge() {
  const statusCounts = await getShipmentStatusCounts(
    false,
    ShipmentMode.INTERNATIONAL,
  );
  const totalAll = Object.values(statusCounts).reduce(
    (sum, n) => sum + (n ?? 0),
    0,
  );

  return (
    <Badge variant="outline" className="mt-1 font-mono">
      {totalAll} total
    </Badge>
  );
}

// Scoped to exports. Domestic bookings have their own route
// (/arena-dashboard/domestic-bookings) with its own list and detail page,
// because almost every panel ops works from here — customs category, AWB,
// the door-to-hub first-mile leg — has no meaning on a domestic parcel.
async function TableSection({
  params,
}: {
  params: ReturnType<typeof parseSearchParams>;
}) {
  // The table needs the status counts too, for the numbers on its status filter.
  // getShipmentStatusCounts is memoised per request, so the counters above, the
  // badge and this share one round trip despite asking separately.
  const [{ rows, totalRows, pageCount }, statusCounts] = await Promise.all([
    getShipmentsPage({ ...params, mode: ShipmentMode.INTERNATIONAL }),
    getShipmentStatusCounts(false, ShipmentMode.INTERNATIONAL),
  ]);

  return (
    <ShipmentsTable
      data={rows}
      page={params.page}
      pageSize={params.pageSize}
      totalRows={totalRows}
      pageCount={pageCount}
      sortField={params.sortField}
      sortDir={params.sortDir}
      statuses={params.statuses ?? []}
      query={params.query ?? ""}
      statusCounts={statusCounts}
    />
  );
}
