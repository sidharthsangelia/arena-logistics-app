"use client";

/**
 * app/rates/domestic/DomesticRateResultsList.tsx
 *
 * RESPONSIBILITY
 * --------------
 * Local-state adaptation of the international RateResultsList for the
 * domestic calculator. Since the domestic flow has no Zustand store (the
 * server action result is held in the parent client component), all the
 * sort/filter/compare/sheet state that used to live in `useAppStore` slices
 * is reimplemented here with plain `useState`.
 *
 * The visual structure, memoization strategy, and badge logic (cheapest /
 * fastest) are unchanged from the original — only the state source differs.
 * `RateResultCard`, `ComparePanel`, and `QuoteSheet` are reused as-is since
 * `DomesticRateQuote` matches the `RateQuote` shape they expect
 * (vendorId, vendorName, totalWithTax, totalWithoutTax, tatDays, charges,
 * currency, productName).
 */

import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  ArrowUpDown,
  LayoutGrid,
  List,
  Scale,
} from "lucide-react";

 

import type { DomesticRateResult, DomesticRateQuote } from "@/lib/domestic/domestic.types";
import RateResultCard from "../RateResultCard";
import ComparePanel, { quoteKey } from "../ComparePanel";
import QuoteSheet from "../QuoteSheet";

type SortBy = "price-asc" | "price-desc" | "tat-asc" | "tat-desc";
type ViewMode = "grid" | "list";

interface DomesticRateResultsListProps {
  result: DomesticRateResult | null;
}

export default function DomesticRateResultsList({
  result,
}: DomesticRateResultsListProps) {
  const quotes = result?.quotes ?? [];
  const vendorErrors = result?.vendorErrors ?? [];

  // -- Local state (replaces ui / compare / quoteSheet store slices) --------
  const [sortBy, setSortBy] = useState<SortBy>("price-asc");
  const [activeCarriers, setActiveCarriers] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<DomesticRateQuote | null>(
    null,
  );

  const toggleCompareId = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((c) => c !== id)
        : prev.length >= 3
          ? prev
          : [...prev, id],
    );
  };

  const clearCompareIds = () => setCompareIds([]);

  const openSheet = (quote: DomesticRateQuote) => {
    setSelectedQuote(quote);
    setSheetOpen(true);
  };

  const closeSheet = () => setSheetOpen(false);

  const toggleCarrier = (id: string) => {
    setActiveCarriers((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  // -- Derived data -----------------------------------------------------------

  const carriers = useMemo(
    () => [
      ...new Map(
        quotes.map((q) => [q.vendorId, { id: q.vendorId, name: q.vendorName }]),
      ).values(),
    ],
    [quotes],
  );

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

  // -- Handlers -----------------------------------------------------------

  const handleCardClick = (quote: DomesticRateQuote) => {
    if (compareMode) {
      toggleCompareId(quoteKey(quote));
    } else {
      openSheet(quote);
    }
  };

  // -- Guard ----------------------------------------------------------------

  if (!quotes.length && !vendorErrors.length) return null;

  return (
    <div className="space-y-4">
      {/* ── Vendor errors ── */}
      {vendorErrors.length > 0 && (
        <Alert variant="default" className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">
            Some carriers had no matching rate
          </AlertTitle>
          <AlertDescription className="text-amber-700 space-y-1 mt-1">
            {vendorErrors.map((err) => (
              <p key={err.vendorId} className="text-sm">
                <span className="font-medium">{err.vendorName}</span>:{" "}
                {err.message}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {processed.length > 0 || activeCarriers.length > 0 ? (
        <>
          {/* ── Stats bar ── */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border bg-white dark:bg-slate-950 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                  Quotes found
                </p>
                <p className="text-lg font-semibold text-slate-800">
                  {stats.count}
                </p>
              </div>
              {stats.cheapest && (
                <div className="rounded-lg border bg-emerald-50 border-emerald-200 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-500">
                    Best price
                  </p>
                  <p className="text-lg font-semibold text-emerald-700">
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: stats.cheapest.currency,
                      maximumFractionDigits: 0,
                    }).format(stats.cheapest.totalWithTax)}
                  </p>
                  <p className="text-[10px] text-emerald-500 truncate">
                    {stats.cheapest.vendorName}
                  </p>
                </div>
              )}
              {stats.fastest && (
                <div className="rounded-lg border bg-purple-50 border-purple-200 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-purple-500">
                    Fastest
                  </p>
                  <p className="text-lg font-semibold text-purple-700">
                    {stats.fastest.tatDays} day
                    {stats.fastest.tatDays !== 1 ? "s" : ""}
                  </p>
                  <p className="text-[10px] text-purple-500 truncate">
                    {stats.fastest.vendorName}
                  </p>
                </div>
              )}
              <div className="rounded-lg border bg-white dark:bg-slate-950 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                  Showing
                </p>
                <p className="text-lg font-semibold text-slate-800">
                  {stats.filtered} / {stats.count}
                </p>
              </div>
            </div>
          )}

          {/* ── Toolbar ── */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white dark:bg-slate-950 px-3 py-2.5">
            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="price-asc">Price: Low to High</SelectItem>
                  <SelectItem value="price-desc">Price: High to Low</SelectItem>
                  <SelectItem value="tat-asc">TAT: Fastest first</SelectItem>
                  <SelectItem value="tat-desc">TAT: Slowest first</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Carrier filter chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {carriers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCarrier(c.id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    activeCarriers.includes(c.id)
                      ? "border-primary bg-muted text-foreground"
                      : "border-slate-200 text-slate-500 hover:bg-muted/50"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              {/* View toggle */}
              <div className="flex items-center rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 ${viewMode === "grid" ? "bg-muted text-foreground" : "text-slate-400 hover:bg-muted/50"}`}
                  aria-label="Grid view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 ${viewMode === "list" ? "bg-muted text-foreground" : "text-slate-400 hover:bg-muted/50"}`}
                  aria-label="List view"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Compare toggle */}
              <Button
                type="button"
                size="sm"
                variant={compareMode ? "default" : "outline"}
                className="h-8 text-xs gap-1.5"
                onClick={() => {
                  setCompareMode((v) => !v);
                  setCompareIds([]);
                }}
              >
                <Scale className="h-3.5 w-3.5" />
                Compare
              </Button>
            </div>
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

          {/* ── Cards grid / list ── */}
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

          {/* ── Compare panel ── */}
          {/* {compareMode && compareIds.length >= 2 && (
            <>
              <ComparePanel
                quotes={quotes.filter((q) => compareIds.includes(quoteKey(q)))}
              />
              <div className="h-44" aria-hidden />
            </>
          )} */}
        </>
      ) : (
        vendorErrors.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            No quotes returned. Try adjusting the shipment details.
          </p>
        )
      )}

      {/* ── Quote sheet ── */}
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