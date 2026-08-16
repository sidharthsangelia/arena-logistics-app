// components/invoices/manual/ManualInvoiceBuilderSkeleton.tsx
//
// Fallback for the manual invoice builder, shared by the two routes that mount
// it: raising a new invoice and editing a draft.
//
// The builder is a form, and a form's questions are not data. "Customer",
// "Invoice date", "Payment terms", the tax-mode switch and its explanation are
// printed in the markup and are the same every time, so they are printed here
// too and never flash. What waits is the charge-type catalogue, the preset list,
// the service history and — when editing — the draft's own values, which is
// everything the placeholders stand in for.
//
// The sticky totals bar is reproduced because it is the tallest fixture on the
// screen and the last thing to resolve. Leaving it out would let the page settle
// at one height and then jump when the bar appeared under the fold.

import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export function ManualInvoiceBuilderSkeleton() {
  return (
    <div>
      {/* ── who and when ──────────────────────────────────────────────── */}
      <section className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid gap-2">
          <Label>Customer</Label>
          <Skeleton className="h-9 w-full rounded-md" />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {["Invoice date", "Payment terms", "Currency", "Type", "Category"].map(
            (label) => (
              <div key={label} className="grid gap-2">
                <Label>{label}</Label>
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ),
          )}
        </div>
      </section>

      {/* ── the one switch that changes what the customer pays ─────────── */}
      <section className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-8 rounded-full" />
          <div className="grid gap-0.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-8 rounded-full" />
          <div className="grid gap-0.5">
            <Label className="cursor-default">Reverse charge</Label>
            <p className="text-xs text-muted-foreground">
              The customer pays the GST, so none is charged here.
            </p>
          </div>
        </div>

        <div className="ml-auto grid gap-1">
          <Label className="text-xs text-muted-foreground">Place of supply</Label>
          <Skeleton className="h-8 w-56 rounded-md" />
        </div>
      </section>

      {/* ── one consignment ───────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid gap-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 flex-1 rounded-md" />
                <Skeleton className="h-9 w-24 rounded-md" />
                <Skeleton className="h-9 w-20 rounded-md" />
                <Skeleton className="h-9 w-9 rounded-md" />
              </div>
            ))}
          </div>
        </div>

        <Skeleton className="mt-3 h-9 w-52 rounded-md" />
      </section>

      {/* Collapsed on arrival, so it is one button tall and nothing else. */}
      <div className="mt-8">
        <Skeleton className="h-9 w-64 rounded-md" />
      </div>

      {/* ── sticky totals ─────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-30 -mx-6 -mb-8 mt-8 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3">
          {["Taxable", "IGST"].map((label) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <Skeleton className="mt-0.5 h-5 w-20" />
            </div>
          ))}

          <div className="ml-auto flex items-center gap-6">
            <div className="flex flex-col items-end">
              <Skeleton className="h-3 w-24" />
              {/* h-8 is the line box of the text-2xl total it replaces. */}
              <Skeleton className="mt-1 h-8 w-36" />
            </div>

            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-28 rounded-md" />
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
