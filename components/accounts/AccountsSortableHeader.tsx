"use client";

// components/accounts/AccountsSortableHeader.tsx
//
// A column header that sorts by writing to the URL, not by sorting the array in
// the browser. The table only ever holds one page, so client-side sorting would
// reorder twenty five rows and quietly lie about the other two hundred.
//
// It writes the same two params the sort dropdown does, through the same
// helper, so the two controls always agree on what the current order is.

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { useListNavigation } from "@/components/data-table/ListNavigation";
import {
  accountSortParams,
  type AccountFilters,
  type AccountSortField,
} from "@/lib/accounts/filters";

type Props = {
  title: string;
  field: AccountSortField;
  filters: AccountFilters;
  /** Right-aligns the label for numeric columns. */
  align?: "left" | "right";
};

export default function AccountsSortableHeader({
  title,
  field,
  filters,
  align = "left",
}: Props) {
  const { setParams } = useListNavigation();
  const isActive = filters.sort === field;

  // Clicking the column you are already sorted by flips direction. Clicking a
  // new one starts descending, which is the useful end for dates and counts.
  const nextDir = isActive && filters.dir === "desc" ? "asc" : "desc";

  const Icon = !isActive
    ? ChevronsUpDown
    : filters.dir === "desc"
      ? ArrowDown
      : ArrowUp;

  return (
    <button
      type="button"
      onClick={() => setParams(accountSortParams(field, nextDir))}
      aria-label={`Sort by ${title}, ${nextDir === "desc" ? "descending" : "ascending"}`}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors",
        "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        align === "right" && "flex-row-reverse",
        isActive ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {title}
      <Icon
        className={cn("h-3 w-3 shrink-0", !isActive && "opacity-50")}
        aria-hidden="true"
      />
    </button>
  );
}
