"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The controls above a server-paginated table: a search box that updates as you
 * type, plus a slot for that table's own filters.
 *
 * The small spinner sits inside the search box rather than replacing the rows,
 * which is what makes a filter change read as "still working on it" instead of
 * "everything went away and came back".
 */
export function DataTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  isFetching,
  resultLabel,
  children,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** True while a request is in flight over rows that are already on screen. */
  isFetching?: boolean;
  /** Right-aligned count, e.g. "1,204 quotes". */
  resultLabel?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative w-full lg:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 pl-8 pr-14"
        />
        {isFetching && (
          <span
            aria-hidden
            className="absolute right-8 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
          />
        )}
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {children}
        {resultLabel && (
          <span className="text-xs text-muted-foreground lg:ml-2">{resultLabel}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Distinguishes "your filters matched nothing" from "there is nothing here at
 * all", because only the first one has an action the user can take.
 */
export function DataTableEmptyState({
  filtered,
  emptyText,
  filteredText,
  onReset,
}: {
  filtered: boolean;
  emptyText: string;
  filteredText: string;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      <p className="text-sm text-muted-foreground">
        {filtered ? filteredText : emptyText}
      </p>
      {filtered && onReset && (
        <Button variant="outline" size="sm" onClick={onReset}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

/** Shown when the read itself failed, e.g. the caller is not Arena staff. */
export function DataTableErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
