import {
  AlertCircle,
  Clock,
  Package,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ShipmentStatus } from "@/generated/prisma";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  SORTABLE_FIELDS,
  getShipmentStatusCounts,
  getShipmentsPage,
  type ShipmentSortField,
} from "@/queries/arena-side-dashboard/shipments";
import { ShipmentsTable } from "./ShipmentsTable";
import StatCard from "@/components/StatCard";
 

// ---------------------------------------------------------------------------
// Search params → typed, validated query params. Anything malformed silently
// falls back to a sane default rather than throwing.
// ---------------------------------------------------------------------------

type RawSearchParams = Record<string, string | string[] | undefined>;

function parseSearchParams(sp: RawSearchParams) {
  const pageRaw = Number(sp.page);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const pageSizeRaw = Number(sp.pageSize);
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSizeRaw)
    ? pageSizeRaw
    : DEFAULT_PAGE_SIZE;

  const sortField: ShipmentSortField = SORTABLE_FIELDS.includes(sp.sort as ShipmentSortField)
    ? (sp.sort as ShipmentSortField)
    : "createdAt";

  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const validStatuses = new Set(Object.values(ShipmentStatus));
  const statuses =
    typeof sp.status === "string" && sp.status.length > 0
      ? (sp.status.split(",").filter((s) => validStatuses.has(s as ShipmentStatus)) as ShipmentStatus[])
      : undefined;

  const query = typeof sp.q === "string" ? sp.q : undefined;

  return { page, pageSize, sortField, sortDir, statuses, query };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ArenaBookingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const params = parseSearchParams(sp);

  const [{ rows, totalRows, pageCount }, statusCounts] = await Promise.all([
    getShipmentsPage(params),
    getShipmentStatusCounts(),
  ]);

  const totalAll = Object.values(statusCounts).reduce((sum, n) => sum + (n ?? 0), 0);
  const totalBooked = statusCounts.BOOKED ?? 0;
  const totalProcessing = statusCounts.PROCESSING ?? 0;
  const totalInTransit = statusCounts.IN_TRANSIT ?? 0;
  const needsAttention =
    (statusCounts.DOCUMENTS_PENDING ?? 0) +
    (statusCounts.CUSTOMS_HOLD ?? 0) +
    (statusCounts.ON_HOLD ?? 0);

  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All shipments submitted by clients, across every business associate.
          </p>
        </div>
        <Badge variant="outline" className="mt-1 font-mono">
          {totalAll} total
        </Badge>
      </div>

      {/* ── Summary stats (unfiltered — always the full picture) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Awaiting ops" value={totalBooked} icon={Clock} sub="Newly booked" />
        <StatCard label="Processing" value={totalProcessing} icon={TrendingUp} />
        <StatCard label="In transit" value={totalInTransit} icon={Package} />
        <StatCard
          label="Needs attention"
          value={needsAttention}
          icon={AlertCircle}
          sub="Hold / docs / customs"
        />
      </div>

      {/* ── Table ── */}
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
    </div>
  );
}