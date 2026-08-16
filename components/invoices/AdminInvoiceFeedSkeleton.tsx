// components/invoices/AdminInvoiceFeedSkeleton.tsx
//
// Fallback for the admin invoice feed: the summary tiles, the toolbar and the
// table, in the same `space-y-5` stack the real component uses.
//
// Shared by the route's loading.tsx and the page's own Suspense boundary. Those
// two fire one after the other on a cold navigation — loading.tsx while the
// route resolves, then the boundary while the feed query runs — and if they
// showed different placeholders the screen would flicker between two shapes
// before showing any data at all. One component, so it cannot.

import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceSummaryCardsSkeleton } from "@/components/invoices/InvoiceSummaryCards";
import { InvoicesTableSkeleton } from "@/components/invoices/InvoicesTableSkeleton";

export function AdminInvoiceFeedSkeleton({ rows = 15 }: { rows?: number }) {
  return (
    <div className="space-y-5">
      <InvoiceSummaryCardsSkeleton />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-full sm:max-w-xs" />
          <Skeleton className="h-9 w-[150px]" />
          <Skeleton className="h-9 w-[200px]" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <InvoicesTableSkeleton columns={8} rows={rows} />
    </div>
  );
}
