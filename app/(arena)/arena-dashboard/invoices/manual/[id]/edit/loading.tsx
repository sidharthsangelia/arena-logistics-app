import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ManualInvoiceBuilderSkeleton } from "@/components/invoices/manual/ManualInvoiceBuilderSkeleton";

/**
 * Fallback while a draft and the three catalogues behind the builder are read.
 *
 * "Draft invoice" is the heading whatever the draft turns out to be, so it is
 * real. The line under it names the customer, which is the draft's own data, so
 * that is the only thing in the header standing in for something.
 *
 * Its own file rather than inheriting the sibling [id]/loading.tsx: a draft is a
 * form and an issued invoice is a document, and showing the wrong one of those
 * for a moment would be a worse guess than showing nothing.
 */
export default function EditManualInvoiceLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/arena-dashboard/invoices">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Invoices
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Draft invoice</h1>
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>

      <ManualInvoiceBuilderSkeleton />
    </div>
  );
}
