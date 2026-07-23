"use client";

/**
 * RateResultsList.tsx
 *
 * RESPONSIBILITY
 * --------------
 * Renders the toolbar (sort, carrier filters, view toggle, compare button)
 * and the cards grid/list. It does NOT own compare state, sort state, or
 * sheet state — those live in the Zustand store.
 *
 * STATE OWNERSHIP AFTER REFACTOR
 * --------------------------------
 * All state previously held in useState hooks here is now in the store:
 *
 *   sortBy            → ui.slice
 *   activeCarriers    → ui.slice
 *   viewMode          → ui.slice
 *   compareMode       → compare.slice
 *   compareIds        → compare.slice
 *   selectedQuote     → quoteSheet.slice
 *   sheetOpen         → quoteSheet.slice
 *
 * This component is now only responsible for:
 *   - Computing derived data (filtered + sorted quotes, stats, badge IDs)
 *   - Rendering the toolbar and cards
 *   - Delegating interactions to store actions
 *
 * MEMOIZATION NOTES
 * -----------------
 * `useMemo` is used for:
 *   - `carriers` — depends only on quotes; stable across sort/filter changes
 *   - `processed` — expensive sort+filter; only recomputes when inputs change
 *   - `cheapestId` / `fastestId` — stable badge IDs; must not change on sort
 *   - `stats` — summary bar values
 *
 * Individual cards are NOT wrapped in React.memo here because RateResultCard
 * only re-renders when its own props change, and the key props
 * (isCheapest, isFastest, compareMode, isCompareSelected, isCompareDisabled)
 * are all derived from stable primitive comparisons. If profiling shows a
 * problem, add memo to RateResultCard directly.
 */

import { useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { AlertTriangle } from "lucide-react";

import { useAppStore } from "@/store";
import { useIsArenaOrg } from "@/hooks/useIsArenaOrg";
import type { RateQuote } from "@/lib/types";
import RateResultCard from "./RateResultCard";
import ComparePanel from "./ComparePanel";
import QuoteSheet from "./QuoteSheet";
import { quoteKey } from "./ComparePanel";

import { fmt } from "@/utils/helpers";
import Toolbar from "./rateResultList/Toolbar";
import Stats from "./rateResultList/Stats";
import type { RateVariant } from "./rateVariants";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RateResultsList({
  variant = "international",
}: {
  /**
   * Which calculator this list renders for. Selects the variant preset
   * (logo, branding) applied to every card. Defaults to "international".
   */
  variant?: RateVariant;
}) {
  // -- Store reads -----------------------------------------------------------
  const quotes = useAppStore((s) => s.quotes);
  const vendorErrors = useAppStore((s) => s.vendorErrors);

  // Vendor identity is masked from every customer-facing surface.
  const isArena = useIsArenaOrg();

  const sortBy = useAppStore((s) => s.sortBy);
  const activeCarriers = useAppStore((s) => s.activeCarriers);
  const viewMode = useAppStore((s) => s.viewMode);

  const compareMode = useAppStore((s) => s.compareMode);
  const compareIds = useAppStore((s) => s.compareIds);

  const sheetOpen = useAppStore((s) => s.sheetOpen);
  const selectedQuote = useAppStore((s) => s.selectedQuote);

  // -- Store actions ---------------------------------------------------------

  const toggleCompareId = useAppStore((s) => s.toggleCompareId);
  const clearCompareIds = useAppStore((s) => s.clearCompareIds);
  const openSheet = useAppStore((s) => s.openSheet);
  const closeSheet = useAppStore((s) => s.closeSheet);

  // -- Derived data ----------------------------------------------------------

  // Unique carrier list for filter chips — stable reference as long as quotes
  // doesn't change (i.e. does NOT recompute on sort/filter)
  const carriers = useMemo(
    () => [
      ...new Map(
        quotes.map((q) => [q.vendorId, { id: q.vendorId, name: q.vendorName }]),
      ).values(),
    ],
    [quotes],
  );

  // Filtered and sorted result set
  const processed = useMemo(() => {
    let result = [...quotes];

    if (activeCarriers.length > 0) {
      result = result.filter((q) => activeCarriers.includes(q.vendorId));
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "price-asc":
          return a.totalWithTax - b.totalWithTax;
        case "price-desc":
          return b.totalWithTax - a.totalWithTax;
        case "tat-asc":
          return (a.tatDays || 9999) - (b.tatDays || 9999);
        case "tat-desc":
          return (b.tatDays || 0) - (a.tatDays || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [quotes, activeCarriers, sortBy]);

  // Badge IDs are derived from the FULL quotes array — not the processed slice.
  // This ensures "Best price" and "Fastest" badges are stable even when the
  // user filters out the cheapest/fastest carrier from view.
  const cheapestId = useMemo<string | null>(() => {
    if (!quotes.length) return null;
    return quoteKey(
      quotes.reduce((a, b) => (a.totalWithTax < b.totalWithTax ? a : b)),
    );
  }, [quotes]);

  const fastestId = useMemo<string | null>(() => {
    const withTat = quotes.filter((q) => q.tatDays > 0);
    if (!withTat.length) return null;
    return quoteKey(withTat.reduce((a, b) => (a.tatDays < b.tatDays ? a : b)));
  }, [quotes]);

  // Summary stat bar
  const stats = useMemo(() => {
    if (!quotes.length) return null;
    const cheapest = quotes.find((q) => quoteKey(q) === cheapestId);
    const fastest = quotes.find((q) => quoteKey(q) === fastestId);
    return {
      cheapest,
      fastest,
      count: quotes.length,
      filtered: processed.length,
    };
  }, [quotes, processed.length, cheapestId, fastestId]);

  // -- Handlers --------------------------------------------------------------

  const handleCardClick = (quote: RateQuote) => {
    if (compareMode) {
      toggleCompareId(quoteKey(quote));
    } else {
      openSheet(quote);
    }
  };

  // -- Guard: nothing to render ----------------------------------------------
  if (!quotes.length && !vendorErrors.length) return null;

  return (
    <div className="space-y-4">
      {/* ── Vendor errors -─-*/}
      {vendorErrors.length > 0 && (
        <Alert variant="default" className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">
            Some carriers could not be reached
          </AlertTitle>
          <AlertDescription className="text-amber-700 space-y-1 mt-1">
            {isArena ? (
              vendorErrors.map((err) => (
                <p key={err.vendorId} className="text-sm">
                  <span className="font-medium">{err.vendorName}</span>:{" "}
                  {err.message}
                </p>
              ))
            ) : (
              <p className="text-sm">
                A few carriers didn&apos;t return a rate this time. The options
                below are still complete and ready to book.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {processed.length > 0 || activeCarriers.length > 0 ? (
        <>
          {/* ── Stats bar -─-*/}
          {stats && (
           <Stats stats={stats} />
          )}

          {/* ── Toolbar -───-*/}
          <Toolbar carriers={carriers} />

          {/* Compare hint */}
          {compareMode && (
            <div className="flex items-center justify-between rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              <span>
                Select up to 3 carriers to compare.{" "}
                {compareIds.length > 0 && (
                  <strong>{compareIds.length} selected.</strong>
                )}
              </span>
              {compareIds.length > 0 && (
                <button
                  onClick={clearCompareIds}
                  className="text-blue-500 underline underline-offset-2 hover:text-blue-700"
                >
                  Clear selection
                </button>
              )}
            </div>
          )}

          {/* ── Cards grid / list ─────-*/}
          {processed.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No carriers match the active filters.
            </p>
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid gap-3 sm:grid-cols-2"
                  : "flex flex-col gap-3"
              }
            >
              {processed.map((quote, i) => {
                const id = quoteKey(quote);
                return (
                  <RateResultCard
                    key={id}
                    quote={quote}
                    rank={i + 1}
                    isCheapest={id === cheapestId}
                    isFastest={id === fastestId}
                    compareMode={compareMode}
                    isCompareSelected={compareIds.includes(id)}
                    isCompareDisabled={
                      compareIds.length >= 3 && !compareIds.includes(id)
                    }
                    viewMode={viewMode}
                    onClick={() => handleCardClick(quote)}
                    variant={variant}
                  />
                );
              })}
            </div>
          )}

          {/* ── Compare panel (fixed overlay) --─── */}
          {compareMode && compareIds.length >= 2 && (
            <>
              <ComparePanel />
              {/* Spacer so the fixed panel doesn't overlap the last card */}
              <div className="h-44" aria-hidden />
            </>
          )}
        </>
      ) : (
        vendorErrors.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            No quotes returned. Try adjusting the shipment details.
          </p>
        )
      )}

      {/* ── Quote sheet -───-*/}
      {selectedQuote && (
        <QuoteSheet
          open={sheetOpen}
          onOpenChange={(open) => {
            if (!open) closeSheet();
          }}
          quote={selectedQuote}
        />
      )}
    </div>
  );
}
