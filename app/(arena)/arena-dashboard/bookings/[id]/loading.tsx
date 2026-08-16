import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback while one export booking is read.
 *
 * This file had drifted: it drew a card-based hero in a max-w-screen-xl
 * container, and the page it stands in for has for some time been a rule-accent
 * hero in a max-w-7xl one. So the placeholder was a different width and a
 * different shape from what replaced it, which is the one thing a loading state
 * must not be. It now traces the real page — the container, the accent rule, the
 * five hero stats, the two-thirds/one-third split and the sticky operate rail.
 *
 * Almost nothing here can be real text: every fact on this page belongs to the
 * shipment. The section titles in the reading column can, and are, because the
 * page picks those and not the database. The back link is real too, so a wrong
 * row can be left without waiting for it to load.
 */
export default function BookingDetailLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <Link
        href="/arena-dashboard/bookings"
        className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Bookings
      </Link>

      {/* The accent is the status, which is unknown until the row lands, so the
          rule is neutral here. Its width is what holds the layout and that is
          the same on every booking. */}
      <header className="border-l-4 border-border pl-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* h-9 matches the text-3xl shipment number at sm and up. */}
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-6 w-24 rounded-md" />
        </div>
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5 sm:grid-cols-3 lg:grid-cols-5">
          {[
            "Route",
            "Chargeable wt",
            "Declared value",
            "Quoted total",
            "Carrier",
          ].map((label) => (
            <div key={label} className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Skeleton className="h-3 w-3 shrink-0 rounded-sm" />
                {label}
              </p>
              <Skeleton className="mt-1.5 h-6 w-24" />
            </div>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {["Addresses", "Goods", "Customs", "Documents"].map((title) => (
            <section key={title} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-2.5">
                <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-sm" />
                  {title}
                </h2>
                <Skeleton className="h-3 w-32" />
              </div>
              <div className="space-y-2.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </section>
          ))}
        </div>

        <div className="lg:col-span-1">
          <div className="space-y-4 lg:sticky lg:top-6">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
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
    </div>
  );
}
