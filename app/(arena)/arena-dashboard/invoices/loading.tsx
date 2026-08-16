import { AdminInvoiceFeedSkeleton } from "@/components/invoices/AdminInvoiceFeedSkeleton";
import { DEFAULT_INVOICE_PAGE_SIZE } from "@/lib/invoices/admin/config";

/**
 * Covers the instant between clicking Invoices in the sidebar and the route
 * rendering.
 *
 * The heading and the sentence under it are the page's own fixed copy, so they
 * are here as text and the page repeats them unchanged. Below that, the same
 * feed skeleton the page's Suspense boundary uses, so the two hand over to each
 * other without the placeholder itself changing shape on the way.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every bill Arena has raised: booking invoices, invoices raised by hand,
          and bills uploaded from outside. Track what is owed and mark it paid.
        </p>
      </div>

      <AdminInvoiceFeedSkeleton rows={DEFAULT_INVOICE_PAGE_SIZE} />
    </div>
  );
}
