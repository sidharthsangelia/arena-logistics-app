import { Skeleton } from "@/components/ui/skeleton";
import { InvoicesTableSkeleton } from "@/components/invoices/InvoicesTableSkeleton";
import { BillingPartySummaryCardsSkeleton } from "./BillingPartySummaryCards";

/**
 * Fallback for the customer list: the tiles, the toolbar and the table, in the
 * same `space-y-5` stack the real component uses.
 *
 * Shared by the route's loading.tsx and the page's own Suspense boundary. Those
 * two fire one after the other on a cold navigation, and if they showed
 * different placeholders the screen would flicker between two shapes before
 * showing any data at all. One component, so it cannot.
 */
export function BillingPartyTableSkeleton({ rows = 20 }: { rows?: number }) {
  return (
    <div className="space-y-5">
      <BillingPartySummaryCardsSkeleton />

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full sm:max-w-xs" />
        <Skeleton className="h-9 w-[150px]" />
        <Skeleton className="h-9 w-[140px]" />
        <Skeleton className="ml-auto h-9 w-32" />
      </div>

      <InvoicesTableSkeleton columns={7} rows={rows} />
    </div>
  );
}
