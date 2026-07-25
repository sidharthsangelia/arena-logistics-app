import { Skeleton } from "@/components/ui/skeleton";

/**
 * The waiting shape for the full notification history, shared by the tenant and
 * arena loading screens so the two inboxes settle into the same layout without a
 * jump when the rows land. Sized to match NotificationHistory: a filter bar on top
 * and a bordered list of rows, each a bubble beside a title and a timestamp.
 */
export function NotificationHistorySkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {/* Filter bar: chips on the left, controls on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>

      {/* The list itself. */}
      <div className="overflow-hidden rounded-xl border bg-background divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-3 px-4 py-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
