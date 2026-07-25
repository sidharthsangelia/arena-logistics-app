import { redirect } from "next/navigation";

import { getArenaAuth } from "@/utils/arena-auth";
import { AdminInvoicesTable } from "@/components/invoices/AdminInvoicesTable";

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

      <AdminInvoicesTable />
    </div>
  );
}
