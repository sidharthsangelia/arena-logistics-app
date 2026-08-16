import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback while one domestic booking is read.
 *
 * Everything on this page belongs to the shipment — its number, its status, its
 * addresses, its boxes, what the courier said — so unlike the list screens there
 * is very little here that could be printed as real text. What this file does
 * instead is hold the geometry: the reading column and the 340px operate rail,
 * the accent bar down the left of the hero, the five hero stats, the section
 * hairlines. Those are the same on every booking, so the page arrives into a
 * layout that is already the right shape and nothing reflows around it.
 *
 * The back link is real, because ops opening the wrong row should be able to
 * leave without waiting for the row to load.
 */
export default function DomesticBookingDetailLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <Link
        href="/arena-dashboard/domestic-bookings"
        className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Domestic bookings
      </Link>

      {/* ── Hero ──
          The accent colour is the status, which is not known yet, so the bar is
          neutral here and takes its colour when the shipment lands. Its width is
          what matters for layout and that never changes. */}
      <header className="border-l-4 border-border pl-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* h-9 matches the text-3xl shipment number at sm and up. */}
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-6 w-24 rounded-md" />
        </div>
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5 sm:grid-cols-3 lg:grid-cols-5">
          {["Booked by", "Courier", "Boxes", "Actual weight", "Freight charged"].map(
            (label) => (
              <div key={label} className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Skeleton className="h-3 w-3 shrink-0 rounded-sm" />
                  {label}
                </p>
                <Skeleton className="mt-1.5 h-6 w-24" />
              </div>
            ),
          )}
        </div>
      </header>

      {/* The attention strip is deliberately not represented. It renders only
          when something is wrong, and a placeholder for it would promise a
          problem on every booking and then vanish on most of them. */}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          {/* Section titles are fixed by the page, not by the booking, so they
              are real text under the same hairline SectionHeading draws. */}
          {["Addresses", "Goods", "GST paperwork", "Charges"].map((title) => (
            <section key={title} className="space-y-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-2.5">
                  <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-sm" />
                    {title}
                  </h2>
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <div className="space-y-2.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </section>
          ))}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="gap-0 py-0">
              <CardHeader className="border-b py-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded-sm" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5 py-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-9 w-full rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
