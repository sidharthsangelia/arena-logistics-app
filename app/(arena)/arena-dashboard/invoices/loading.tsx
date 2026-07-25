import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceSummaryCardsSkeleton } from "@/components/invoices/InvoiceSummaryCards";
import { InvoicesTableSkeleton } from "@/components/invoices/InvoicesTableSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <div className="space-y-5">
        <InvoiceSummaryCardsSkeleton />
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-full max-w-xs" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-[150px]" />
            <Skeleton className="h-9 w-[200px]" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <InvoicesTableSkeleton columns={8} />
      </div>
    </div>
  );
}
