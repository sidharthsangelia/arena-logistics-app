import { Suspense } from "react";

import { TenantInvoicesTable } from "@/components/invoices/TenantInvoicesTable";
import { InvoicesTableSkeleton } from "@/components/invoices/InvoicesTableSkeleton";
import { InvoiceSummaryCards } from "@/components/invoices/InvoiceSummaryCards";
import { getDbOrgId } from "@/utils/tenant";
import { getOrgInvoicesPage } from "@/lib/invoices/queries";
import { DEFAULT_INVOICE_PAGE_SIZE } from "@/lib/invoices/config";

export const metadata = {
  title: "Invoices",
};

/**
 * The heading is static and renders on the first flush. The table streams in
 * with its first page already fetched on the server.
 *
 * That handover is the point of this route's shape. The table is a client
 * component driven by react-query, and it used to mount with nothing and fire a
 * server action for its rows — so the browser had to download the chunk, hydrate
 * and only then wait out a full round trip before a single invoice appeared, on
 * a page that had otherwise finished loading. Now the rows arrive with the HTML.
 */
export default function InvoicesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Invoices
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bills from Arena for your shipments. View or download any invoice.
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
  // useInvoicesQuery.
  const initialData = await getOrgInvoicesPage(orgId, {
    page: 1,
    pageSize: DEFAULT_INVOICE_PAGE_SIZE,
    sortField: "issueDate",
    sortDir: "desc",
    statusFilter: "ALL",
  });

  return <TenantInvoicesTable initialData={initialData} />;
}

/** Mirrors the table's own layout: summary cards, then rows. */
function InvoicesPanelSkeleton() {
  return (
    <div className="space-y-5">
      <InvoiceSummaryCards summary={undefined} isLoading />
      <InvoicesTableSkeleton columns={7} />
    </div>
  );
}
