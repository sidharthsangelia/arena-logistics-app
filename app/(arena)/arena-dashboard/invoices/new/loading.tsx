import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ManualInvoiceBuilderSkeleton } from "@/components/invoices/manual/ManualInvoiceBuilderSkeleton";

/**
 * Covers the instant between clicking New invoice and the route rendering.
 *
 * The back button, the heading and the sentence explaining what this screen is
 * for are all fixed copy, so they are rendered as themselves and the page that
 * replaces this repeats them unchanged. Only the form waits, and it waits behind
 * the same skeleton the page's own boundary uses, so there is one swap rather
 * than two.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/arena-dashboard/invoices">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Invoices
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">New invoice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For a shipment or a deal that did not go through the platform. Save it
          as a draft as often as you like; nothing is numbered until you issue.
        </p>
      </div>

      <ManualInvoiceBuilderSkeleton />
    </div>
  );
}
