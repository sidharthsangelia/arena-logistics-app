import { AlertCircle, Clock, Package, TrendingUp } from "lucide-react";

import StatCard, { StatCardValueSkeleton } from "@/components/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ShipmentsTableSkeleton } from "@/components/shipments/ShipmentsTableSkeleton";
import type { ShipmentStatus } from "@/generated/prisma";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/queries/shipments";

// Shared by page.tsx and loading.tsx. Only the data-dependent bits are blocked
// out; labels, icons and the table's own chrome render for real, so a skeleton
// block just turns into text in the same place.

type StatusCounts = Partial<Record<ShipmentStatus, number>>;

export function ShipmentsPageHeader({ badge }: { badge: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          All Shipments
        </h1>
      </div>
      {badge}
    </div>
  );
}

/** The "N total" badge: same h-5 pill, same top offset. */
export function TotalBadgeSkeleton() {
  return <Skeleton className="mt-1 h-5 w-20 rounded-4xl" />;
}

/**
 * The four cards. With `counts` it is the loaded section; without, every
 * label, icon and fixed sub line is still real and only the figures wait.
 */
export function ShipmentStatCards({ counts }: { counts?: StatusCounts }) {
  const n = (v: number) => (counts ? v : <StatCardValueSkeleton />);
  const c = counts ?? {};

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Awaiting ops" value={n(c.BOOKED ?? 0)} icon={Clock} sub="Newly booked" />
      <StatCard label="Processing" value={n(c.PROCESSING ?? 0)} icon={TrendingUp} />
      <StatCard label="In transit" value={n(c.IN_TRANSIT ?? 0)} icon={Package} />
      <StatCard
        label="Needs attention"
        value={n((c.DOCUMENTS_PENDING ?? 0) + (c.CUSTOMS_HOLD ?? 0) + (c.ON_HOLD ?? 0))}
        icon={AlertCircle}
        sub="Hold / docs / customs"
      />
    </div>
  );
}

export function ShipmentStatCardsSkeleton() {
  return <ShipmentStatCards />;
}

export function ShipmentsTableFallback() {
  return (
    <ShipmentsTableSkeleton
      client
      defaultPageSize={DEFAULT_PAGE_SIZE}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
    />
  );
}
