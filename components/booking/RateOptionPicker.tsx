"use client";

/**
 * RateOptionPicker
 *
 * Interactive carrier picker shared by the international service step and the
 * domestic first-mile step. Takes the raw RateQuote list (which carries the
 * full charge breakdown) so it can show sortable, filterable, squarish cards
 * with an expandable "what am I paying for" breakdown — while the parent step
 * still persists the slim ServiceOption on select.
 *
 * Inspired by components/rate-calculator/RateResultCard.tsx, rebuilt for the
 * booking wizard's single-select flow (radio semantics, not compare/quote).
 */

import { useMemo, useState } from "react";
import {
  Clock,
  TrendingDown,
  Zap,
  ChevronDown,
  CheckCircle2,
  LayoutGrid,
  List,
  Layers,
  SearchX,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { RateQuote } from "@/lib/types";
import type { ServiceOption } from "@/types/booking.types";
import { useIsArenaOrg } from "@/hooks/useIsArenaOrg";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stable identity for a quote — matches ServiceOption.productCode upstream. */
export function quoteKey(q: RateQuote): string {
  return `${q.vendorId}-${q.productName}-${q.totalWithTax}`;
}

/** RateQuote → the slim ServiceOption the booking form persists on select. */
export function quoteToServiceOption(q: RateQuote): ServiceOption {
  return {
    vendorId: q.vendorId,
    vendorName: q.vendorName,
    productCode: quoteKey(q),
    productName: q.productName,
    transitDays: q.tatDays ?? 0,
    price: q.totalWithTax,
    currency: q.currency ?? "INR",
  };
}

const VENDOR_BADGE: Record<string, string> = {
  skart:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  aramex:
    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800",
  shipmozo:
    "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-400 dark:border-teal-800",
};

function vendorBadgeClass(id: string) {
  return VENDOR_BADGE[id] ?? "bg-muted text-muted-foreground border-border";
}

function money(amount: number, currency: string, dp = 0) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(amount);
}

type SortKey = "price-asc" | "price-desc" | "tat-asc";
type ViewMode = "grid" | "list";

const SORT_LABEL: Record<SortKey, string> = {
  "price-asc": "Cheapest first",
  "price-desc": "Priciest first",
  "tat-asc": "Fastest first",
};

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function RateOptionCard({
  quote,
  selected,
  isCheapest,
  isFastest,
  tatSuffix,
  onSelect,
}: {
  quote: RateQuote;
  selected: boolean;
  isCheapest: boolean;
  isFastest: boolean;
  tatSuffix?: string;
  onSelect: () => void;
}) {
  const tax = quote.totalWithTax - quote.totalWithoutTax;
  const hasCharges = quote.charges.length > 0;
  const isArena = useIsArenaOrg();

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card transition-all",
        selected
          ? "border-primary ring-1 ring-primary"
          : "hover:border-primary/40 hover:shadow-sm",
      )}
    >
      {/* Selectable region */}
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 flex-col gap-3 p-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            {(isCheapest || isFastest) && (
              <div className="flex flex-wrap gap-1.5">
                {isCheapest && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                    <TrendingDown className="h-2.5 w-2.5" />
                    Best price
                  </span>
                )}
                {isFastest && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-400">
                    <Zap className="h-2.5 w-2.5" />
                    Fastest
                  </span>
                )}
              </div>
            )}
            <h3 className="truncate text-sm font-semibold leading-tight text-foreground">
              {quote.productName}
            </h3>
            {isArena && (
              <Badge
                variant="outline"
                className={cn("w-fit text-[10px] font-medium", vendorBadgeClass(quote.vendorId))}
              >
                {quote.vendorName}
              </Badge>
            )}
          </div>

          {/* Radio-style select indicator */}
          <div
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/30",
            )}
          >
            {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3">
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {quote.tatDays > 0
                ? `${quote.tatDays} day${quote.tatDays !== 1 ? "s" : ""}${tatSuffix ? ` ${tatSuffix}` : ""}`
                : "Transit time on confirmation"}
            </span>
            {hasCharges && (
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {quote.charges.length} charge{quote.charges.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="shrink-0 text-right">
            <p className="text-lg font-bold leading-none text-foreground">
              {money(quote.totalWithTax, quote.currency)}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              incl. GST
              {tax > 0 && (
                <> · {money(quote.totalWithoutTax, quote.currency)} excl.</>
              )}
            </p>
          </div>
        </div>
      </button>

      {/* Charge breakdown — kept OUTSIDE the button so it never triggers select */}
      {hasCharges && (
        <div className="px-4 pb-3">
          <Separator className="mb-2" />
          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
              <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
              View charge breakdown
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1.5">
                {quote.charges.map((charge, i) => (
                  <div key={i} className="flex justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{charge.name}</span>
                    <span className="text-right font-medium text-foreground">
                      {money(charge.amount, charge.currency, 2)}
                      {charge.taxAmount !== undefined && charge.taxAmount > 0 && (
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          (+{money(charge.taxAmount, charge.currency, 2)} tax)
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                <Separator className="my-1.5" />
                <div className="flex justify-between text-xs font-semibold">
                  <span>Total incl. GST</span>
                  <span>{money(quote.totalWithTax, quote.currency, 2)}</span>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Picker (toolbar + grid)
// ---------------------------------------------------------------------------

interface Props {
  quotes: RateQuote[];
  /** ServiceOption.productCode of the current selection, or null. */
  selectedKey: string | null;
  onSelect: (quote: RateQuote) => void;
  /** Words appended after the transit-day count, e.g. "to hub". */
  tatSuffix?: string;
}

export function RateOptionPicker({ quotes, selectedKey, onSelect, tatSuffix }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>("price-asc");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Carrier filter chips are labelled by the sourcing vendor, so they only
  // render for Arena staff. Customers never see the vendor axis.
  const isArena = useIsArenaOrg();

  // Unique carriers for the filter chips (stable across sort).
  const carriers = useMemo(
    () => [...new Map(quotes.map((q) => [q.vendorId, q.vendorName])).entries()],
    [quotes],
  );

  // Badge IDs from the FULL list, so "Best price"/"Fastest" stay put under
  // filtering and sorting.
  const cheapestKey = useMemo(() => {
    if (!quotes.length) return null;
    return quoteKey(quotes.reduce((a, b) => (a.totalWithTax <= b.totalWithTax ? a : b)));
  }, [quotes]);

  const fastestKey = useMemo(() => {
    const withTat = quotes.filter((q) => q.tatDays > 0);
    if (!withTat.length) return null;
    return quoteKey(withTat.reduce((a, b) => (a.tatDays <= b.tatDays ? a : b)));
  }, [quotes]);

  const processed = useMemo(() => {
    const result = quotes.filter((q) => !hidden.has(q.vendorId));
    result.sort((a, b) => {
      switch (sortBy) {
        case "price-asc":
          return a.totalWithTax - b.totalWithTax;
        case "price-desc":
          return b.totalWithTax - a.totalWithTax;
        case "tat-asc":
          return (a.tatDays || 9999) - (b.tatDays || 9999);
        default:
          return 0;
      }
    });
    return result;
  }, [quotes, hidden, sortBy]);

  const toggleCarrier = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {isArena &&
            carriers.length > 1 &&
            carriers.map(([id, name]) => {
              const on = !hidden.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleCarrier(id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    on
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground line-through hover:bg-muted",
                  )}
                >
                  {name}
                </button>
              );
            })}
        </div>

        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k} className="text-xs">
                  {SORT_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded transition-colors",
                viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-label="List view"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded transition-colors",
                viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Cards */}
      {processed.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
          <SearchX className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">No carriers match your filters</p>
          <p className="text-xs text-muted-foreground">Turn a carrier back on to see its rates.</p>
        </div>
      ) : (
        <div className={cn(viewMode === "grid" ? "grid gap-3 sm:grid-cols-2" : "flex flex-col gap-3")}>
          {processed.map((quote) => {
            const key = quoteKey(quote);
            return (
              <RateOptionCard
                key={key}
                quote={quote}
                selected={selectedKey === key}
                isCheapest={key === cheapestKey}
                isFastest={key === fastestKey}
                tatSuffix={tatSuffix}
                onSelect={() => onSelect(quote)}
              />
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {processed.length} of {quotes.length} option{quotes.length !== 1 ? "s" : ""} shown · Prices include GST
      </p>
    </div>
  );
}
