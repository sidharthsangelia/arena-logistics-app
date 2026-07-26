import { Skeleton } from "@/components/ui/skeleton";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";

/**
 * Covers the instant between clicking Document Vault in the sidebar and the route
 * rendering. Mirrors the page's two sections so the layout does not jump when the
 * real content lands.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="space-y-3 rounded-lg border p-6">
        <Skeleton className="h-5 w-36" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <DataTableSkeleton columns={8} rows={8} withToolbar />
      </div>
    </div>
  );
}
