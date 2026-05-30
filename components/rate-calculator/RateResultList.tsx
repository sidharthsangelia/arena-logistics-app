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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  GitCompare,
  LayoutGrid,
  List,
  X,
  ArrowUpDown,
} from "lucide-react";

import { useAppStore } from "@/store"
import type { SortOption } from "@/store"
import type { RateQuote } from "@/lib/types";
import RateResultCard from "./RateResultCard";
import ComparePanel from "./ComparePanel";
import QuoteSheet from "./QuoteSheet";
import { quoteKey } from "./ComparePanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RateResultsList() {
  // -- Store reads -----------------------------------------------------------
  const quotes = useAppStore((s) => s.quotes);
  const vendorErrors = useAppStore((s) => s.vendorErrors);

  const sortBy = useAppStore((s) => s.sortBy);
  const activeCarriers = useAppStore((s) => s.activeCarriers);
  const viewMode = useAppStore((s) => s.viewMode);

  const compareMode = useAppStore((s) => s.compareMode);
  const compareIds = useAppStore((s) => s.compareIds);

  const sheetOpen = useAppStore((s) => s.sheetOpen);
  const selectedQuote = useAppStore((s) => s.selectedQuote);

  // -- Store actions ---------------------------------------------------------
  const setSortBy = useAppStore((s) => s.setSortBy);
  const toggleCarrierFilter = useAppStore((s) => s.toggleCarrierFilter);
  const clearCarrierFilters = useAppStore((s) => s.clearCarrierFilters);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const enableCompareMode = useAppStore((s) => s.enableCompareMode);
  const disableCompareMode = useAppStore((s) => s.disableCompareMode);
  const toggleCompareId = useAppStore((s) => s.toggleCompareId);
  const clearCompareIds = useAppStore((s) => s.clearCompareIds);
  const openSheet = useAppStore((s) => s.openSheet);
  const closeSheet = useAppStore((s) => s.closeSheet);

  // -- Derived data ----------------------------------------------------------

  // Unique carrier list for filter chips — stable reference as long as quotes
  // doesn't change (i.e. does NOT recompute on sort/filter)
  const carriers = useMemo(
    () =>
      [
        ...new Map(
          quotes.map((q) => [q.vendorId, { id: q.vendorId, name: q.vendorName }])
        ).values(),
      ],
    [quotes]
  );

  // Filtered and sorted result set
  const processed = useMemo(() => {
    let result = [...quotes];

    if (activeCarriers.length > 0) {
      result = result.filter((q) => activeCarriers.includes(q.vendorId));
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "price-asc":  return a.totalWithTax - b.totalWithTax;
        case "price-desc": return b.totalWithTax - a.totalWithTax;
        case "tat-asc":    return (a.tatDays || 9999) - (b.tatDays || 9999);
        case "tat-desc":   return (b.tatDays || 0)    - (a.tatDays || 0);
        default:           return 0;
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
      quotes.reduce((a, b) => (a.totalWithTax < b.totalWithTax ? a : b))
    );
  }, [quotes]);

  const fastestId = useMemo<string | null>(() => {
    const withTat = quotes.filter((q) => q.tatDays > 0);
    if (!withTat.length) return null;
    return quoteKey(
      withTat.reduce((a, b) => (a.tatDays < b.tatDays ? a : b))
    );
  }, [quotes]);

  // Summary stat bar
  const stats = useMemo(() => {
    if (!quotes.length) return null;
    const cheapest = quotes.find((q) => quoteKey(q) === cheapestId);
    const fastest  = quotes.find((q) => quoteKey(q) === fastestId);
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

      {/* ── Vendor errors ─────────────────────────────────────────────── */}
      {vendorErrors.length > 0 && (
        <Alert variant="default" className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">
            Some carriers could not be reached
          </AlertTitle>
          <AlertDescription className="text-amber-700 space-y-1 mt-1">
            {vendorErrors.map((err) => (
              <p key={err.vendorId} className="text-sm">
                <span className="font-medium">{err.vendorName}</span>: {err.message}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {processed.length > 0 || activeCarriers.length > 0 ? (
        <>
          {/* ── Stats bar ─────────────────────────────────────────────── */}
          {stats && (
            <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
              <div className="py-3 px-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                  Options
                </p>
                <p className="text-2xl font-bold text-slate-800">{stats.count}</p>
                {stats.filtered !== stats.count && (
                  <p className="text-[11px] text-slate-400">{stats.filtered} shown</p>
                )}
              </div>
              <div className="py-3 px-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                  Best price
                </p>
                <p className="text-2xl font-bold text-emerald-600">
                  {stats.cheapest
                    ? fmt(stats.cheapest.totalWithTax, stats.cheapest.currency)
                    : "—"}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {stats.cheapest?.vendorName}
                </p>
              </div>
              <div className="py-3 px-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                  Fastest
                </p>
                <p className="text-2xl font-bold text-blue-600">
                  {stats.fastest ? `${stats.fastest.tatDays}d` : "—"}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {stats.fastest?.vendorName ?? "N/A"}
                </p>
              </div>
            </div>
          )}

          {/* ── Toolbar ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Carrier filter chips */}
            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
              {carriers.map((c) => {
                const active = activeCarriers.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCarrierFilter(c.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600"
                    }`}
                  >
                    {active && <X className="h-2.5 w-2.5" />}
                    {c.name}
                  </button>
                );
              })}
              {activeCarriers.length > 0 && (
                <button
                  onClick={clearCarrierFilters}
                  className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Sort */}
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as SortOption)}
            >
              <SelectTrigger className="h-8 w-44 text-xs gap-1.5">
                <ArrowUpDown className="h-3 w-3 text-slate-400 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price-asc">Price: Low → High</SelectItem>
                <SelectItem value="price-desc">Price: High → Low</SelectItem>
                <SelectItem value="tat-asc">Delivery: Fastest first</SelectItem>
                <SelectItem value="tat-desc">Delivery: Slowest first</SelectItem>
              </SelectContent>
            </Select>

            {/* View toggle */}
            <div className="flex items-center rounded-md border border-slate-200 overflow-hidden h-8">
              <button
                onClick={() => setViewMode("grid")}
                className={`flex items-center justify-center w-8 h-full transition-colors ${
                  viewMode === "grid"
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center justify-center w-8 h-full transition-colors border-l border-slate-200 ${
                  viewMode === "list"
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
                aria-label="List view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Compare toggle */}
            <Button
              variant={compareMode ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() =>
                compareMode ? disableCompareMode() : enableCompareMode()
              }
            >
              <GitCompare className="h-3.5 w-3.5" />
              {compareMode ? "Exit compare" : "Compare"}
            </Button>
          </div>

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

          {/* ── Cards grid / list ─────────────────────────────────────── */}
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
                  />
                );
              })}
            </div>
          )}

          {/* ── Compare panel (fixed overlay) ─────────────────────────── */}
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

      {/* ── Quote sheet ───────────────────────────────────────────────── */}
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