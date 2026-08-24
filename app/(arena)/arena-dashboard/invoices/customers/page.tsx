import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getArenaAuth } from "@/utils/arena-auth";
import { getBillingPartiesPage } from "@/lib/invoices/manual/queries";
import { DEFAULT_BILLING_PARTY_PAGE_SIZE } from "@/lib/invoices/manual/config";
import { BillingPartyTable } from "@/components/invoices/customers/BillingPartyTable";
import { BillingPartyTableSkeleton } from "@/components/invoices/customers/BillingPartyTableSkeleton";

export const metadata = {
  title: "Billing customers",
};

/**
 * Everyone Arena raises an invoice to.
 *
 * ── WHY THIS IS NOT THE CLIENTS TABLE ───────────────────────────────────────
 * A Client belongs to a tenant org and cannot exist without one. Most of the
 * people billed here have no account at all: somebody rang up, a consignment
 * moved, and a GST invoice has to exist for it. Filing them as clients would
 * mean inventing an owner org for each, and they would then appear in that
 * org's client list, its KYC screens, its booking pickers and its exports, and
 * would be deleted along with it. A BillingParty also holds what an invoice
 * needs and a Client has no room for: the two-digit state code that decides
 * IGST against CGST and SGST, PAN, CIN, a legal name distinct from a trading
 * name, and whether the customer is a company or a person.
 *
 * They are still one list from here. The invoice form's picker searches parties,
 * signed-up orgs and business associates' clients together, and picking one of
 * the latter two adopts it: the details are copied once and the link recorded,
 * so the same company is never on the billing list twice.
 *
 * Admin-only. This is who owes money, which is money in the sense
 * utils/arena-auth.ts means it. The check here is not redundant with proxy.ts:
 * proxy is an optimistic redirect, and every action re-checks besides.
 */
export default async function BillingCustomersPage() {
  const { isArenaAdmin } = await getArenaAuth();
  if (!isArenaAdmin) redirect("/arena-dashboard");

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link href="/arena-dashboard/invoices">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Invoices
        </Link>
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Billing customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone you raise invoices to, whether they have an account on the
          platform or not. Correcting someone here changes what their next
          invoice prints, never one already issued.
        </p>
      </div>

      {/* The heading above renders immediately; the list waits behind a
          table-shaped fallback rather than holding the whole screen. */}
      <Suspense
        fallback={
          <BillingPartyTableSkeleton rows={DEFAULT_BILLING_PARTY_PAGE_SIZE} />
        }
      >
        <CustomerList />
      </Suspense>
    </div>
  );
}

async function CustomerList() {
  // The first page of the default view, handed to react-query so the table
  // paints with real rows instead of fetching after hydration.
  const firstPage = await getBillingPartiesPage({
    page: 1,
    pageSize: DEFAULT_BILLING_PARTY_PAGE_SIZE,
    sortField: "legalName",
    sortDir: "asc",
    filter: "ALL",
  });

  return <BillingPartyTable initialData={firstPage} />;
}
