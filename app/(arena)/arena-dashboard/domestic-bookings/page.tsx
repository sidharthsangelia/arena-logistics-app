import { AlertCircle, Banknote, Clock, Package } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ShipmentMode, ShipmentStatus } from "@/generated/prisma";
import { prisma } from "@/utils/db";
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

// ---------------------------------------------------------------------------
// Domestic bookings — the ops queue for India → India courier shipments.
//
// A deliberate twin of /arena-dashboard/bookings rather than a tab on it. The
// two lists share a table and a query, but the work behind each row is
// different enough that mixing them costs ops time: an export row leads to
// customs paperwork, an AWB and a door-to-hub leg, a domestic row leads to a
// courier push, an e-way bill and possibly a cash collection. The rows live in
// ONE table (Shipment.mode) — it is only the view that is split.
// ---------------------------------------------------------------------------

type RawSearchParams = Record<string, string | string[] | undefined>;

function parseSearchParams(sp: RawSearchParams) {
  const pageRaw = Number(sp.page);
  const page =
    Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const pageSizeRaw = Number(sp.pageSize);
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSizeRaw)
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
          .filter((s) => validStatuses.has(s as ShipmentStatus)) as ShipmentStatus[])
      : undefined;

  const query = typeof sp.q === "string" ? sp.q : undefined;

  return { page, pageSize, sortField, sortDir, statuses, query };
}

/**
 * How many domestic bookings still owe a courier push, and how many are
 * carrying a cash collection. Both are the questions ops opens this page to
 * answer, and neither exists on the international list.
 */
async function getDomesticOpsCounts() {
  const [awaitingPush, codOpen] = await Promise.all([
    prisma.shipment.count({
      where: {
        mode: ShipmentMode.DOMESTIC,
        domesticCourierOrderId: null,
        status: {
          in: [ShipmentStatus.BOOKED, ShipmentStatus.PROCESSING],
        },
      },
    }),
    prisma.shipment.count({
      where: {
        mode: ShipmentMode.DOMESTIC,
        codEnabled: true,
        status: { notIn: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED] },
      },
    }),
  ]);

  return { awaitingPush, codOpen };
}

export default async function ArenaDomesticBookingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const params = parseSearchParams(sp);

  const [{ rows, totalRows, pageCount }, statusCounts, opsCounts] =
    await Promise.all([
      getShipmentsPage({ ...params, mode: ShipmentMode.DOMESTIC }),
      getShipmentStatusCounts(false, ShipmentMode.DOMESTIC),
      getDomesticOpsCounts(),
    ]);

  const totalAll = Object.values(statusCounts).reduce(
    (sum, n) => sum + (n ?? 0),
    0,
  );
  const totalInTransit = statusCounts.IN_TRANSIT ?? 0;
  const needsAttention =
    (statusCounts.DOCUMENTS_PENDING ?? 0) + (statusCounts.ON_HOLD ?? 0);

  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Domestic bookings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            India to India courier shipments. No customs, no AWB. What these
            need is a courier push and, where the value crosses ₹50,000, an
            e-way bill on file.
          </p>
        </div>
        <Badge variant="outline" className="mt-1 font-mono">
          {totalAll} total
        </Badge>
      </div>

      {/* ── Summary stats (unfiltered — always the full picture) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Awaiting courier"
          value={opsCounts.awaitingPush}
          icon={Clock}
          sub="Not pushed yet"
        />
        <StatCard label="In transit" value={totalInTransit} icon={Package} />
        <StatCard
          label="Cash on delivery"
          value={opsCounts.codOpen}
          icon={Banknote}
          sub="Collection pending"
        />
        <StatCard
          label="Needs attention"
          value={needsAttention}
          icon={AlertCircle}
          sub="Hold / docs"
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
