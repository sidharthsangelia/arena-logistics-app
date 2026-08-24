import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DEFAULT_BILLING_PARTY_PAGE_SIZE } from "@/lib/invoices/manual/config";
import { BillingPartyTableSkeleton } from "@/components/invoices/customers/BillingPartyTableSkeleton";

/**
 * Covers the instant between clicking the customers link and the route
 * rendering.
 *
 * The back button, the heading and the sentence under it are the page's own
 * fixed copy, so they are here as real text and the page repeats them
 * unchanged. Below that, the same skeleton the page's Suspense boundary uses,
 * so the two hand over without the placeholder changing shape on the way.
 */
export default function Loading() {
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

      <BillingPartyTableSkeleton rows={DEFAULT_BILLING_PARTY_PAGE_SIZE} />
    </div>
  );
}
