"use client";

import { useState, useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, GitCompare, LayoutGrid, List, X, ArrowUpDown } from "lucide-react";
import RateResultCard from "./RateResultCard";
import QuoteSheet from "./QuoteSheet";
import { RateQuote, VendorError, RateRequest } from "@/lib/types";

interface Props {
  quotes: RateQuote[];
  vendorErrors: VendorError[];
  request: RateRequest;
}

type SortOption = "price-asc" | "price-desc" | "tat-asc" | "tat-desc";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function quoteKey(q: RateQuote) {
  return `${q.vendorId}::${q.productName}`;
}

// ─── compare panel (fixed bottom overlay) ───────────────────────────────────

interface ComparePanelProps {
  selectedIds: string[];
  allQuotes: RateQuote[];
  onRemove: (id: string) => void;
  onClose: () => void;
}

function ComparePanel({ selectedIds, allQuotes, onRemove, onClose }: ComparePanelProps) {
  const selected = selectedIds
    .map((id) => allQuotes.find((q) => quoteKey(q) === id))
    .filter(Boolean) as RateQuote[];

  if (selected.length < 2) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white shadow-2xl">
      <div className="max-w-5xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700">
            Comparing {selected.length} option{selected.length !== 1 ? "s" : ""}
          </p>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 gap-1 text-xs">
            <X className="h-3.5 w-3.5" />
            Close
          </Button>
        </div>

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${selected.length}, 1fr)` }}
        >
          {selected.map((q) => {
            const id = quoteKey(q);
            return (
              <div
                key={id}
                className="relative rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <button
                  onClick={() => onRemove(id)}
                  className="absolute right-2 top-2 text-slate-300 hover:text-slate-500 transition-colors"
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>

                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 mb-1">
                  {q.vendorName}
                </p>
                <p className="text-sm font-semibold text-slate-800 pr-5 leading-snug mb-2">
                  {q.productName}
                </p>

                <div className="space-y-1 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Price (incl.)</span>
                    <span className="font-semibold text-slate-800">
                      {fmt(q.totalWithTax, q.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Price (excl.)</span>
                    <span>{fmt(q.totalWithoutTax, q.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transit</span>
                    <span>{q.tatDays > 0 ? `${q.tatDays} days` : "TBD"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Charges</span>
                    <span>{q.charges.length}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function RateResultsList({ quotes, vendorErrors, request }: Props) {
  const [sortBy, setSortBy] = useState<SortOption>("price-asc");
  const [activeCarriers, setActiveCarriers] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<RateQuote | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // unique carriers for filter chips
  const carriers = useMemo(
    () =>
      [...new Map(quotes.map((q) => [q.vendorId, { id: q.vendorId, name: q.vendorName }])).values()],
    [quotes]
  );

  // filtered + sorted
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

  // badge identifiers — stable across sort
  const cheapestId = useMemo(() => {
    if (!quotes.length) return null;
    return quoteKey(quotes.reduce((a, b) => (a.totalWithTax < b.totalWithTax ? a : b)));
  }, [quotes]);

  const fastestId = useMemo(() => {
    const withTat = quotes.filter((q) => q.tatDays > 0);
    if (!withTat.length) return null;
    return quoteKey(withTat.reduce((a, b) => (a.tatDays < b.tatDays ? a : b)));
  }, [quotes]);

  // summary stats
  const stats = useMemo(() => {
    if (!quotes.length) return null;
    const cheapest = quotes.find((q) => quoteKey(q) === cheapestId);
    const fastest  = quotes.find((q) => quoteKey(q) === fastestId);
    return { cheapest, fastest, count: quotes.length, filtered: processed.length };
  }, [quotes, processed, cheapestId, fastestId]);

  // handlers
  const toggleCarrier = (id: string) =>
    setActiveCarriers((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );

  const toggleCompareId = (id: string) =>
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((c) => c !== id)
        : prev.length >= 3
        ? prev // max 3
        : [...prev, id]
    );

  const handleCardClick = (quote: RateQuote) => {
    if (compareMode) {
      toggleCompareId(quoteKey(quote));
    } else {
      setSelectedQuote(quote);
      setSheetOpen(true);
    }
  };

  const exitCompare = () => {
    setCompareMode(false);
    setCompareIds([]);
  };

  if (!quotes.length && !vendorErrors.length) return null;

  return (
    <div className="space-y-4">
      {/* ── vendor errors ───────────────────────────────────────────────── */}
      {vendorErrors.length > 0 && (
        <Alert variant="default" className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Some carriers could not be reached</AlertTitle>
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
          {/* ── stats bar ─────────────────────────────────────────────── */}
          {stats && (
            <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
              <div className="py-3 px-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                  Options
                </p>
                <p className="text-2xl font-bold text-slate-800">{stats.count}</p>
                {stats.filtered !== stats.count && (
                  <p className="text-[11px] text-slate-400">
                    {stats.filtered} shown
                  </p>
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

          {/* ── toolbar ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            {/* carrier filter chips */}
            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
              {carriers.map((c) => {
                const active = activeCarriers.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCarrier(c.id)}
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
                  onClick={() => setActiveCarriers([])}
                  className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
                >
                  Clear
                </button>
              )}
            </div>

            {/* sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
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

            {/* view toggle */}
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

            {/* compare toggle */}
            <Button
              variant={compareMode ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => (compareMode ? exitCompare() : setCompareMode(true))}
            >
              <GitCompare className="h-3.5 w-3.5" />
              {compareMode ? "Exit compare" : "Compare"}
            </Button>
          </div>

          {/* compare hint */}
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
                  onClick={() => setCompareIds([])}
                  className="text-blue-500 underline underline-offset-2 hover:text-blue-700"
                >
                  Clear selection
                </button>
              )}
            </div>
          )}

          {/* ── cards grid/list ───────────────────────────────────────── */}
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
                    isCompareDisabled={compareIds.length >= 3 && !compareIds.includes(id)}
                    viewMode={viewMode}
                    onClick={() => handleCardClick(quote)}
                  />
                );
              })}
            </div>
          )}

          {/* ── compare panel ─────────────────────────────────────────── */}
          {compareMode && compareIds.length >= 2 && (
            <ComparePanel
              selectedIds={compareIds}
              allQuotes={quotes}
              onRemove={toggleCompareId}
              onClose={exitCompare}
            />
          )}

          {/* bottom padding so fixed compare panel doesn't cover cards */}
          {compareMode && compareIds.length >= 2 && (
            <div className="h-44" aria-hidden />
          )}
        </>
      ) : (
        vendorErrors.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            No quotes returned. Try adjusting the shipment details.
          </p>
        )
      )}

      {/* ── quote sheet ───────────────────────────────────────────────── */}
      {selectedQuote && (
        <QuoteSheet
          open={sheetOpen}
          onOpenChange={(open) => {
            setSheetOpen(open);
            if (!open) setSelectedQuote(null);
          }}
          quote={selectedQuote}
          request={request}
        />
      )}
    </div>
  );
}