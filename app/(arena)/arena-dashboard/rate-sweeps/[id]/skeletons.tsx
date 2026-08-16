// app/(arena)/arena-dashboard/rate-sweeps/[id]/skeletons.tsx
//
// Fallbacks for the six boundaries on one sweep's detail page.
//
// The page is read top to bottom while debugging a run, so every section keeps
// its heading and its explanation on screen from the first frame and only the
// numbers underneath are placeholders. That also means the page has its full
// height immediately: scrolling to the matrix browser while the tables above are
// still filling in does not drag it back up when they land.

import { Skeleton } from "@/components/ui/skeleton";
import {
  SectionTableSkeleton,
  type SkeletonColumn,
} from "@/components/data-table/SectionTableSkeleton";

/** Title, subtitle and the four run stats, all from one read of the run row. */
export function SweepHeroSkeleton() {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {/* h-8 is the line box of the text-2xl heading it replaces. */}
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>

        {/* The export button is real and already usable; only the finalise
            button, which depends on the run being RUNNING, is unknown. */}
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {["Status", "Lanes reported", "Rates stored", "Took"].map((label) => (
          <div key={label} className="rounded-lg border p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1">
              <Skeleton className="h-7 w-20" />
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

const VENDOR_COLUMNS: SkeletonColumn[] = [
  { label: "Vendor", width: "w-24" },
  { label: "Attempted", align: "right", width: "w-12" },
  { label: "Quoted", align: "right", width: "w-12" },
  { label: "Not served", align: "right", width: "w-12" },
  { label: "Failed", align: "right", width: "w-10" },
  { label: "Failure rate", align: "right", width: "w-12" },
  { label: "Rates stored", align: "right", width: "w-14" },
];

export function VendorHealthTableSkeleton() {
  return <SectionTableSkeleton columns={VENDOR_COLUMNS} rows={4} />;
}

const FAILURE_COLUMNS: SkeletonColumn[] = [
  { label: "Vendor", width: "w-24" },
  { label: "Lane", width: "w-28" },
  { label: "Weight", align: "right", width: "w-12" },
  { label: "Outcome", width: "w-24" },
  { label: "What the vendor said", width: "w-full max-w-md" },
];

export function SweepFailuresTableSkeleton() {
  return <SectionTableSkeleton columns={FAILURE_COLUMNS} rows={5} />;
}

const UNMAPPED_COLUMNS: SkeletonColumn[] = [
  { label: "Vendor", width: "w-24" },
  { label: "Service name", width: "w-56" },
  { label: "Rates", align: "right", width: "w-12" },
  { label: "Countries", align: "right", width: "w-12" },
];

export function UnmappedServicesTableSkeleton() {
  return <SectionTableSkeleton columns={UNMAPPED_COLUMNS} rows={4} />;
}

/**
 * The carrier comparison and the matrix browser both sit under a filter block
 * whose chips are laid out identically to the real ones — same wrapper, same row
 * gap, same chip height — so the tables below them do not slide up or down when
 * the filters become clickable.
 */
export function CarrierComparisonSkeleton() {
  return (
    <div className="space-y-4">
      <FilterBlockSkeleton rows={[26, 30]} />
      {/* One column per vendor the run queried, and which those were is on the
          run row this boundary is still waiting for, so those headings are the
          one place on the page that stays a placeholder. Three is the usual
          number and keeps the table close to its final width. */}
      <SectionTableSkeleton
        columns={[
          { label: "Carrier", width: "w-28" },
          { label: null, align: "right", width: "w-16" },
          { label: null, align: "right", width: "w-16" },
          { label: null, align: "right", width: "w-16" },
          { label: "Spread", align: "right", width: "w-14" },
        ]}
        rows={5}
      />
    </div>
  );
}

export function MatrixBrowserSkeleton() {
  return (
    <div className="space-y-4">
      <FilterBlockSkeleton rows={[26, 6, 8, 30]} />
      <SectionTableSkeleton
        columns={[
          { label: "Lane", width: "w-24" },
          { label: "Weight", align: "right", width: "w-10" },
          { label: "Vendor", width: "w-20" },
          { label: "Carrier", width: "w-20" },
          { label: "Service", width: "w-32" },
          { label: "Before tax", align: "right", width: "w-16" },
          { label: "Tax", align: "right", width: "w-12" },
          { label: "All in", align: "right", width: "w-16" },
          { label: "Transit", align: "right", width: "w-12" },
        ]}
        rows={8}
      />
    </div>
  );
}

/**
 * One placeholder chip row per filter the real component renders. The counts are
 * passed in rather than guessed so each row is about as wide as it will be.
 */
function FilterBlockSkeleton({ rows }: { rows: number[] }) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      {rows.map((chips, index) => (
        <div key={index} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 w-16 shrink-0">
            <Skeleton className="h-3 w-12" />
          </span>
          {Array.from({ length: chips }).map((_, chip) => (
            <Skeleton key={chip} className="h-5 w-9 rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}
