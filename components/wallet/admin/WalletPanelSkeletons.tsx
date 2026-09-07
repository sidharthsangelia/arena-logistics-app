// components/wallet/admin/WalletPanelSkeletons.tsx
//
// One fallback per tab on the money screen.
//
// The tabs are genuinely different shapes — the overview is tiles and charts,
// the other three are filtered tables — so a single generic placeholder would be
// the wrong height on three of the four and the page would jump when the real
// panel arrived. Each of these reproduces the geometry of its own tab instead:
// the same card chrome, the same grid, the same chart heights, the same filter
// row.
//
// Labels that are printed in the markup rather than read from the database stay
// as text. "Money in wallets" is the name of a tile, not a number, and it is
// known before any query runs.

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------
//
// Three fallbacks rather than one, because the overview is fed by three separate
// queries behind three separate Suspense boundaries. Each of these has to hold
// exactly the space its own section will occupy, since its neighbours may already
// have resolved and be sitting on screen beside it.

/** The four figures. */
export function WalletTilesSkeleton() {
  return (
    <div className="space-y-6">
      {/* The attention strip is deliberately absent. It only renders when there
          is something wrong, so a placeholder for it would promise a problem
          that usually is not there and would collapse when the data lands. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          "Money in wallets",
          "Topped up",
          "Spent on bookings",
          "Waiting to be collected",
        ].map((label) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              {/* The real primitives, not lookalikes. CardTitle carries
                  font-heading and leading-snug, so a plain span here would be a
                  hair off and the label would nudge when StatCard replaced it. */}
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Skeleton className="h-4 w-4 rounded-sm" />
            </CardHeader>
            <CardContent>
              {/* h-8 is the line box of the text-2xl figure it replaces. */}
              <Skeleton className="h-8 w-28" />
              <Skeleton className="mt-1.5 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * The money-in-and-out card. Carries the same `lg:col-span-2` as the real card,
 * because it sits in the page's chart grid as a direct child and would otherwise
 * take one column and let the aging card jump sideways when it resolved.
 */
export function MoneyFlowCardSkeleton() {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Money in and out</CardTitle>
        {/* The real description states the net movement, which is the very
            number being fetched, so this one line is a placeholder. */}
        <CardDescription className="text-xs">
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </CardDescription>
      </CardHeader>
      <div className="px-4 pb-4">
        {/* h-64 matches MoneyFlowChart's own container, empty or not. */}
        <Skeleton className="h-64 w-full" />
      </div>
    </Card>
  );
}

/** The receivables aging card. Both header lines are fixed copy, so both stay. */
export function CollectionAgingCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          What you are owed, by age
        </CardTitle>
        <CardDescription className="text-xs">
          The older a balance gets, the less likely it is to be paid.
        </CardDescription>
      </CardHeader>
      <div className="px-4 pb-4">
        <Skeleton className="h-56 w-full" />
      </div>
    </Card>
  );
}

/**
 * All three at once, in the page's own layout. Used by the route's loading.tsx,
 * which stands in for the whole tab before any of the three boundaries exist.
 * The grid here must stay identical to the page's or the charts will shift
 * sideways on handover.
 */
export function WalletOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <WalletTilesSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <MoneyFlowCardSkeleton />
        <CollectionAgingCardSkeleton />
      </div>
    </div>
  );
}

/**
 * The three table tabs share a shape: a filter row, a bordered table and a
 * pager. Only the column count differs, so they share one fallback and pass it.
 */
export function WalletTableSkeleton({
  columns,
  rows = 10,
  filters = 2,
}: {
  columns: number;
  rows?: number;
  filters?: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full max-w-xs" />
        {Array.from({ length: filters }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-36" />
        ))}
      </div>

      <div className="overflow-hidden rounded-md border">
        <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-2.5">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 flex-1" />
          ))}
        </div>
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex items-center gap-4 px-4 py-3">
              {Array.from({ length: columns }).map((_, c) => (
                <Skeleton key={c} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-4 w-44" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
    </div>
  );
}
