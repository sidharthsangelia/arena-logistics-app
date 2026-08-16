import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";
import {
  INTERNATIONAL_STAT_TILES,
  ShipmentStatsSkeleton,
  TotalBadgeSkeleton,
} from "@/components/shipments/ShipmentListSkeletons";

/**
 * Covers the instant between clicking International bookings in the sidebar and
 * the route rendering.
 *
 * The heading, the sentence under it and the four counter labels are printed
 * here as themselves rather than as grey bars, because they are the same on
 * every visit and there is nothing to wait for. What replaces this a moment
 * later is the same markup with the numbers filled in, so nothing on screen
 * moves or redraws — only the placeholders inside the boxes are swapped.
 */
export default function BookingsLoading() {
  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-8 space-y-6">
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
        <TotalBadgeSkeleton />
      </div>

      <ShipmentStatsSkeleton tiles={INTERNATIONAL_STAT_TILES} />

      <DataTableSkeleton columns={9} rows={10} withToolbar />
    </div>
  );
}
