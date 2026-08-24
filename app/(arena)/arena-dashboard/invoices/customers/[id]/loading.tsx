import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { BillingPartyInvoicesSkeleton } from "@/components/invoices/customers/BillingPartyInvoices";

/**
 * Covers the read of the customer record itself, which the page awaits before
 * anything renders because their name is what the page is.
 *
 * The back button and the two section headings are the page's own fixed copy,
 * so they are here as real text and the page repeats them unchanged. Only the
 * customer's own particulars are placeholders, and they are laid out in the
 * same grid at the same sizes, so nothing moves when the data lands.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
        <Link href="/arena-dashboard/invoices/customers">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Billing customers
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-2 h-4 w-48" />
        </div>

        <div className="flex flex-col items-end">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="mt-2 h-8 w-36" />
          <Skeleton className="mt-2 h-3 w-32" />
          <Skeleton className="mt-1.5 h-3 w-40" />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>

      <Separator className="my-7" />
      <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Details
      </h2>
      <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-1.5 h-4 w-32" />
          </div>
        ))}
      </dl>

      <Separator className="my-7" />
      <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Invoices
      </h2>
      <div className="mt-4">
        <BillingPartyInvoicesSkeleton />
      </div>
    </div>
  );
}
