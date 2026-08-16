// components/shipments/ShipmentListSkeletons.tsx
//
// Fallbacks shared by the two ops queues, /bookings and /domestic-bookings.
//
// Both screens are a header, a row of counters and a table. The header never
// waits on anything and is not represented here at all. The counters know their
// own labels and icons before any counting happens, so those are real and only
// the figure under each one is a placeholder — which is also what keeps the tile
// exactly its final height.

import {
  AlertCircle,
  Banknote,
  Clock,
  Package,
  TrendingUp,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type StatTileShape = {
  label: string;
  icon: React.ElementType;
  /**
   * The line under the figure. A string when it is fixed copy ("Newly booked"),
   * omitted when the real card computes it from the data, in which case a
   * placeholder line stands in so the tile does not grow when it arrives.
   */
  sub?: string;
  /** True when the real card renders a sub line whose text depends on the data. */
  hasSub?: boolean;
};

/** One placeholder tile, shaped to StatCard so the two are interchangeable. */
export function StatCardSkeleton({ label, icon: Icon, sub, hasSub }: StatTileShape) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {/* h-8 is the line box of the text-2xl figure it replaces. */}
        <Skeleton className="h-8 w-14" />
        {sub ? (
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        ) : hasSub ? (
          <Skeleton className="mt-1.5 h-3 w-28" />
        ) : null}
      </CardContent>
    </Card>
  );
}

/** The four-up counter row, in the same grid the pages lay it out in. */
export function ShipmentStatsSkeleton({ tiles }: { tiles: StatTileShape[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <StatCardSkeleton key={tile.label} {...tile} />
      ))}
    </div>
  );
}

/**
 * The "N total" badge beside the heading. Sized to the badge rather than to the
 * number, so the header row is its final height from the first frame.
 */
export function TotalBadgeSkeleton() {
  return <Skeleton className="mt-1 h-6 w-20 rounded-md" />;
}

// The tile shapes live here rather than in either page because each is needed in
// two places — the page's own Suspense fallback and the route's loading.tsx —
// and a label that disagreed between the two would be a visible flicker on the
// swap. One definition, so they cannot disagree.

export const INTERNATIONAL_STAT_TILES: StatTileShape[] = [
  { label: "Awaiting ops", icon: Clock, sub: "Newly booked" },
  { label: "Processing", icon: TrendingUp },
  { label: "In transit", icon: Package },
  { label: "Needs attention", icon: AlertCircle, sub: "Hold / docs / customs" },
];

export const DOMESTIC_STAT_TILES: StatTileShape[] = [
  // The sub line here counts couriers that refused, so it is data and waits.
  { label: "Awaiting AWB", icon: Clock, hasSub: true },
  { label: "In transit", icon: Package },
  { label: "Cash on delivery", icon: Banknote, sub: "Collection pending" },
  { label: "Needs attention", icon: AlertCircle, sub: "Hold / docs" },
];
