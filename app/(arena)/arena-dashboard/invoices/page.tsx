import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getArenaAuth } from "@/utils/arena-auth";
import { AdminInvoiceFeedTable } from "@/components/invoices/AdminInvoiceFeedTable";
import { AdminInvoiceFeedSkeleton } from "@/components/invoices/AdminInvoiceFeedSkeleton";
import { TaxInvoiceHealthPanel } from "@/components/invoices/TaxInvoiceHealthPanel";
import { getShipmentsMissingInvoices } from "@/lib/invoices/tax/queries";
import { getAdminInvoiceFeed } from "@/lib/invoices/admin/feed";
import { DEFAULT_INVOICE_PAGE_SIZE } from "@/lib/invoices/admin/config";

export const metadata = {
  title: "Invoices",
};

/**
 * Every invoice Arena has raised, of all three kinds, in one table. This is
 * money (it shows what each customer owes), so it is admin-only. The check here
 * is not redundant with proxy.ts: proxy is an optimistic redirect, and every
 * action re-checks besides.
 *
 * ── WHY ONE TABLE ───────────────────────────────────────────────────────────
 * Three tables in the database hold a document with Arena's name on it: a
 * booking invoice raised automatically per shipment (ShipmentInvoice), an
 * invoice raised here by hand for off-platform work (ManualInvoice), and a PDF
 * uploaded from an outside accounting system (Invoice). They used to be a panel
 * plus two tabs, which meant you had to know which of the three a document was
 * before you could go looking for it.
 *
 * Their lifecycles genuinely differ, which is why they stay three tables. But
 * the question an admin arrives with does not: who owes what, is it paid, where
 * is the PDF, is anything broken. So they share a list, and the difference shows
 * as a tag, a filter and a badge. lib/invoices/admin/feed.ts explains how three
 * tables become one ordered page without a sort that cannot be trusted.
 */
export default async function ArenaInvoicesPage() {
  const { isArenaAdmin } = await getArenaAuth();
  if (!isArenaAdmin) redirect("/arena-dashboard");

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every bill Arena has raised: booking invoices, invoices raised by hand,
          and bills uploaded from outside. Track what is owed and mark it paid.
        </p>
      </div>

      {/* The one thing the table below cannot show, because there is no row to
          show: a booked shipment that never got an invoice record at all.
          Streamed separately so an extra query never holds up the table people
          came for. */}
      <Suspense fallback={null}>
        <MissingInvoices />
      </Suspense>

      {/* The heading above renders immediately; the feed is one query across
          three tables and waits behind a table-shaped fallback rather than
          holding the whole screen. */}
      <Suspense fallback={<AdminInvoiceFeedSkeleton rows={DEFAULT_INVOICE_PAGE_SIZE} />}>
        <InvoiceFeed />
      </Suspense>
    </div>
  );
}

async function MissingInvoices() {
  const missing = await getShipmentsMissingInvoices();
  return <TaxInvoiceHealthPanel missing={missing} />;
}

async function InvoiceFeed() {
  // The first page of the default view, handed to react-query so the table
  // paints with real rows instead of fetching after hydration.
  const firstPage = await getAdminInvoiceFeed({
    page: 1,
    pageSize: DEFAULT_INVOICE_PAGE_SIZE,
    sortField: "issueDate",
    sortDir: "desc",
    statusFilter: "ALL",
    kindFilter: "ALL",
  });

  return <AdminInvoiceFeedTable initialData={firstPage} />;
}
