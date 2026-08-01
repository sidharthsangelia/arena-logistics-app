import { InvoicesTableSkeleton } from "@/components/invoices/InvoicesTableSkeleton";
import { InvoiceSummaryCards } from "@/components/invoices/InvoiceSummaryCards";

/**
 * The heading is static content the page renders with no data behind it, so it
 * is reproduced verbatim here rather than skeletoned — it is already correct,
 * and showing it immediately is the point. Only the summary tiles and the rows,
 * which do come from a query, stand in as skeletons.
 *
 * Matches the page's own Suspense fallback, so there is no second layout shift
 * when the route takes over from this file.
 */
export default function InvoicesLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Invoices
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything Arena has billed you: a tax invoice for every shipment,
          plus any bills raised to your account. Open or download any of them.
        </p>
      </div>

      <div className="space-y-5">
        <InvoiceSummaryCards summary={undefined} isLoading />
        <InvoicesTableSkeleton columns={8} />
      </div>
    </div>
  );
}
