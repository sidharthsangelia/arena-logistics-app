"use client";

import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INVOICE_STATUS_FILTERS,
  type InvoiceStatusFilter,
} from "@/lib/invoices/config";

const STATUS_LABELS: Record<InvoiceStatusFilter, string> = {
  ALL: "All statuses",
  UNPAID: "Unpaid",
  OVERDUE: "Overdue",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

/**
 * The row of controls above an invoice table: a debounced search box, a status
 * filter, and a slot for anything else a given dashboard needs (the Arena view
 * drops its org filter and "New invoice" button in here).
 */
export function InvoiceToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search invoice number or shipment…",
  status,
  onStatusChange,
  isFetching,
  children,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  status: InvoiceStatusFilter;
  onStatusChange: (value: InvoiceStatusFilter) => void;
  isFetching?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 pl-8 pr-8"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {isFetching && (
          <span className="absolute right-8 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={status}
          onValueChange={(v) => onStatusChange(v as InvoiceStatusFilter)}
        >
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INVOICE_STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {children}
      </div>
    </div>
  );
}

export { STATUS_LABELS as INVOICE_STATUS_FILTER_LABELS };

/** Empty-state used when a filter/search returns nothing (vs. a truly empty org). */
export function InvoiceEmptyState({
  filtered,
  onReset,
}: {
  filtered: boolean;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      <p className="text-sm text-muted-foreground">
        {filtered ? "No invoices match your filters." : "No invoices yet."}
      </p>
      {filtered && onReset && (
        <Button variant="outline" size="sm" onClick={onReset}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
