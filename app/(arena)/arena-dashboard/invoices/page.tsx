import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getArenaAuth } from "@/utils/arena-auth";
import { AdminInvoicesTable } from "@/components/invoices/AdminInvoicesTable";
import { TaxInvoiceHealthPanel } from "@/components/invoices/TaxInvoiceHealthPanel";
import {
  getShipmentsMissingInvoices,
  getStuckTaxInvoices,
} from "@/lib/invoices/tax/queries";

export const metadata = {
  title: "Invoices",
};

/**
 * Every invoice Arena has issued, across all orgs. This is money (it shows what
 * each customer owes), so it is admin-only. The check here is not redundant with
 * proxy.ts: proxy is an optimistic redirect, and every action re-checks besides.
 */
export default async function ArenaInvoicesPage() {
  const { isArenaAdmin } = await getArenaAuth();
  if (!isArenaAdmin) redirect("/arena-dashboard");

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bills issued to customer organisations. Issue new invoices, track what
          is owed, and mark them paid.
        </p>
      </div>

      {/* Automatic booking invoices are healthy or they are not; this is the
          only place that difference is visible. Streamed separately so two
          extra queries never hold up the table people actually came for. */}
      <Suspense fallback={null}>
        <TaxInvoiceHealth />
      </Suspense>

      <AdminInvoicesTable />
    </div>
  );
}

async function TaxInvoiceHealth() {
  const [stuck, missing] = await Promise.all([
    getStuckTaxInvoices(),
    getShipmentsMissingInvoices(),
  ]);

  return <TaxInvoiceHealthPanel stuck={stuck} missing={missing} />;
}
