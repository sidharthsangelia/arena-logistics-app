import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback while one issued invoice is read.
 *
 * The way back out, the section headings and the container are all real, so the
 * page is navigable and legible before the document itself arrives. Everything
 * that is a placeholder here is genuinely a property of this one invoice: its
 * number, its status, its total, its consignments.
 *
 * The invoice is read in a single query, so this is one boundary rather than
 * several. Splitting it would produce staggered sections with nothing gained.
 */
export default function ManualInvoiceLoading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
        <Link href="/arena-dashboard/invoices">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Invoices
        </Link>
      </Button>

      {/* ── hero ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            {/* h-8 is the line box of the text-2xl invoice number. */}
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-5 w-16 rounded-md" />
          </div>
          <Skeleton className="mt-2 h-4 w-72 max-w-full" />
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="h-3 w-20" />
          {/* h-9 is the line box of the text-3xl total. */}
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>

      {/* ── actions ──────────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-36 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>

      {/* ── facts ────────────────────────────────────────────────────── */}
      <Separator className="my-7" />
      <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Details
      </h2>
      <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-1.5 h-4 w-32" />
          </div>
        ))}
      </dl>

      {/* ── consignments ─────────────────────────────────────────────── */}
      <Separator className="my-7" />
      <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Consignments
      </h2>

      <div className="mt-4 space-y-6">
        <div>
          <div className="flex flex-wrap items-baseline gap-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>

          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-24" />
            ))}
          </div>

          <div className="mt-3 space-y-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b py-1.5 last:border-0">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
