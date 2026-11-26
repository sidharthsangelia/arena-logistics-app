"use client";

/**
 * Stand-in for RateResultsList while a search is running. RatesClient scrolls
 * the page to it the moment Get live rates is clicked, so the user watches the
 * spot where the cards will land instead of a growing scroll bar.
 *
 * Built to the list's real shape so the swap does not jump: the stats bar keeps
 * its real labels with only the figures as skeletons, the toolbar is the real
 * one (sort, view and compare do not depend on the results), and the cards
 * follow the current grid or list view. Card heights vary with each rate, so
 * those are a close match, not an exact one.
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/store";
import Toolbar from "./rateResultList/Toolbar";

const STAT_LABELS = [
  { label: "Quotes", width: "w-8" },
  { label: "Lowest Cost", width: "w-24" },
  { label: "Fastest Transit", width: "w-16" },
];

const PLACEHOLDER_CARDS = 4;

export default function RateResultsLoading() {
  const viewMode = useAppStore((s) => s.viewMode);
  const isList = viewMode === "list";

  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading rates">
      {/* Same box as Stats.tsx; labels real, figures pending. */}
      <div className="flex flex-wrap items-center gap-8 rounded-xl border border-slate-200 bg-white px-5 py-4">
        {STAT_LABELS.map((s) => (
          <div key={s.label}>
            <p className="text-xs text-slate-500">{s.label}</p>
            <div className="flex h-7 items-center">
              <Skeleton className={`h-5 ${s.width}`} />
            </div>
          </div>
        ))}
      </div>

      <Toolbar carriers={[]} />

      <div className={isList ? "flex flex-col gap-3" : "grid gap-3 sm:grid-cols-2"}>
        {Array.from({ length: PLACEHOLDER_CARDS }, (_, i) => (
          <Card key={i} className={isList ? "flex flex-row items-stretch" : undefined}>
            {isList && <div className="w-1 shrink-0 rounded-l-lg" />}
            <div className="flex-1">
              <CardHeader className={isList ? "py-3" : "pb-2"}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40 max-w-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-2.5 w-10" />
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </CardHeader>
              {!isList && (
                <CardContent className="pt-0">
                  <div className="mb-2 h-px bg-border" />
                  <Skeleton className="h-3 w-28" />
                </CardContent>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
