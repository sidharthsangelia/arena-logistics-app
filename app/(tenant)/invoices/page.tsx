import { Suspense } from "react";

import { TenantInvoicesTable } from "@/components/invoices/TenantInvoicesTable";
import { getDbOrgId } from "@/utils/tenant";
import { getOrgInvoiceFeed } from "@/lib/invoices/feed";
import { DEFAULT_INVOICE_PAGE_SIZE } from "@/lib/invoices/config";

import { InvoicesPageHeading } from "./heading";

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
 *
 * The fallback is the table itself with its query switched off, not a separate
 * arrangement of grey boxes. Everything that does not come from the database —
 * tile labels, the filters, the column headings, the paging controls — is
 * therefore already on screen and in its final position during the fetch, and
 * only the cells and figures are standing in.
 */
export default function InvoicesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <InvoicesPageHeading />

      <Suspense fallback={<TenantInvoicesTable skeleton />}>
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
