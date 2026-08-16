// app/(arena)/arena-dashboard/rate-sweeps/skeletons.tsx
//
// Fallbacks for the boundaries on the sweeps list. Co-located with the page
// because nothing else renders them.
//
// Each one is built out of the same primitives as the thing it replaces — a real
// <Alert>, a real <Table> — rather than a bare grey rectangle, so the border, the
// padding and the row height are already correct and the data lands into a box
// that is the right size. Only the values are placeholders.

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SectionTableSkeleton,
  type SkeletonColumn,
} from "@/components/data-table/SectionTableSkeleton";

/**
 * The freshness banner is an Alert in every state it can reach, so the skeleton
 * is one too, with the icon slot filled. Two description lines matches the
 * shortest of the three real messages; the banner grows a line at most when it
 * lands, and it is the last thing above the fold rather than the first, so
 * nothing already read moves under the cursor.
 */
export function FreshnessBannerSkeleton() {
  return (
    <Alert>
      <Skeleton className="size-4 rounded-full" />
      <AlertTitle>
        <Skeleton className="h-4 w-64 max-w-full" />
      </AlertTitle>
      {/* No extra margin: Alert is a grid with its own gap, so anything added
          here would push the description down and then snap back. */}
      <AlertDescription>
        <span className="block space-y-1.5">
          <Skeleton className="h-3.5 w-full max-w-2xl" />
          <Skeleton className="h-3.5 w-full max-w-md" />
        </span>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Stands in for one <Stat> value while the count it needs is still being
 * counted. The label beside it is known without asking the database, so it stays
 * real text and only the number is a placeholder.
 *
 * h-7 is the line box of the `text-xl` it replaces, and it renders inside the
 * same <dd>, so the tile is already its final height before the number lands.
 */
export function StatValueSkeleton() {
  return <Skeleton className="h-7 w-20" />;
}

const RUN_COLUMNS: SkeletonColumn[] = [
  { label: "Started", width: "w-28" },
  { label: "Status", width: "w-20" },
  { label: "Vendors", width: "w-32" },
  { label: "Lanes", align: "right", width: "w-14" },
  { label: "Calls", align: "right", width: "w-16" },
  { label: "Rates stored", align: "right", width: "w-16" },
  { label: "Took", align: "right", width: "w-10" },
];

export function SweepRunsTableSkeleton({ rows = 6 }: { rows?: number }) {
  return <SectionTableSkeleton columns={RUN_COLUMNS} rows={rows} />;
}
