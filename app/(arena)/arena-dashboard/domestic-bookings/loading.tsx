import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";
import {
  DOMESTIC_STAT_TILES,
  ShipmentStatsSkeleton,
  TotalBadgeSkeleton,
} from "@/components/shipments/ShipmentListSkeletons";

/**
 * Covers the instant between clicking Domestic bookings in the sidebar and the
 * route rendering.
 *
 * The twin of the international queue's loading.tsx, and deliberately built from
 * the same pieces: the heading and the counter labels are real text, only the
 * figures wait. Ops flips between the two lists all day and the two screens
 * should feel like one thing behaving consistently.
 */
export default function DomesticBookingsLoading() {
  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-8 space-y-6">
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
        <TotalBadgeSkeleton />
      </div>

      <ShipmentStatsSkeleton tiles={DOMESTIC_STAT_TILES} />

      <DataTableSkeleton columns={9} rows={10} withToolbar />
    </div>
  );
}
