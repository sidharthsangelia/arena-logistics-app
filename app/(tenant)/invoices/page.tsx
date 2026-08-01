import { Suspense } from "react";

import { TenantInvoicesTable } from "@/components/invoices/TenantInvoicesTable";
import { InvoicesTableSkeleton } from "@/components/invoices/InvoicesTableSkeleton";
import { InvoiceSummaryCards } from "@/components/invoices/InvoiceSummaryCards";
import { getDbOrgId } from "@/utils/tenant";
import { getOrgInvoiceFeed } from "@/lib/invoices/feed";
import { DEFAULT_INVOICE_PAGE_SIZE } from "@/lib/invoices/config";

export const metadata = {
  title: "Invoices",
};

/**
 * One list, both kinds of document.
 *
 * Booking invoices and account bills used to render as two stacked tables. A
 * customer looking for "that invoice" had to know which of Arena's two billing
 * mechanisms produced it before they knew where to look, and that split is our
 * internal distinction, not theirs. They are now one table with a type tag and
 * a type filter — see components/invoices/TenantInvoicesTable.tsx.
 *
 * The heading is static and renders on the first flush; the table streams in
 * with its first page already fetched on the server. That handover matters:
 * the table is a client component driven by react-query, and without it the
 * browser would have to download the chunk, hydrate, and only then wait out a
 * round trip before a single invoice appeared on a page that had otherwise
 * finished loading.
 */
export default function InvoicesPage() {
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

      <Suspense fallback={<InvoicesPanelSkeleton />}>
        <InvoicesPanel />
      </Suspense>
    </div>
  );
}

async function InvoicesPanel() {
  const orgId = await getDbOrgId();

  // Must match the hook's untouched default view exactly, or the handover is
  // ignored and the client refetches anyway — see isDefaultView in
  // useInvoiceFeedQuery.
  const initialData = await getOrgInvoiceFeed(orgId, {
    page: 1,
    pageSize: DEFAULT_INVOICE_PAGE_SIZE,
    sortField: "issueDate",
    sortDir: "desc",
    statusFilter: "ALL",
    kindFilter: "ALL",
  });

  return <TenantInvoicesTable initialData={initialData} />;
}

/** Mirrors the table's own layout: summary tiles, toolbar, then rows. */
function InvoicesPanelSkeleton() {
  return (
    <div className="space-y-5">
      <InvoiceSummaryCards summary={undefined} isLoading />
      <InvoicesTableSkeleton columns={8} />
    </div>
  );
}
