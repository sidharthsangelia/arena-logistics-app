import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceSummaryCardsSkeleton } from "@/components/invoices/InvoiceSummaryCards";
import { InvoicesTableSkeleton } from "@/components/invoices/InvoicesTableSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="space-y-5">
        <InvoiceSummaryCardsSkeleton />
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-full max-w-xs" />
          <Skeleton className="h-9 w-[150px]" />
        </div>
        <InvoicesTableSkeleton columns={7} />
      </div>
    </div>
  );
}
