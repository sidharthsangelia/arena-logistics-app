"use client";

// components/accounts/AccountsToolbar.tsx
//
// The only interactive part of the Accounts list. Everything it changes goes
// into the URL, so the server re-renders the table and this component holds no
// copy of the results.
//
// The one piece of local state is the search box, because a controlled input
// that waits for a server round trip between keystrokes feels broken. It is
// reconciled back to the URL on every change from outside, so the back button
// and a pasted link both put the right text in the field.

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListNavigation } from "@/components/data-table/ListNavigation";
import {
  ACCOUNT_HEALTH_FILTERS,
  ACCOUNT_HEALTH_LABELS,
  ACCOUNT_SORT_OPTIONS,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  accountSortToParams,
  accountSortValue,
  hasActiveAccountFilters,
  type AccountFilters,
} from "@/lib/accounts/filters";

/** Long enough to swallow a burst of typing, short enough to feel answered. */
const SEARCH_DEBOUNCE_MS = 300;

type Props = {
  filters: AccountFilters;
  /**
   * The Business Associates list is this same toolbar with the type locked, so
   * the control that would let you filter it away is dropped there.
   */
  showTypeFilter?: boolean;
  placeholder?: string;
};

export default function AccountsToolbar({
  filters,
  showTypeFilter = true,
  placeholder = "Search name, company, or email",
}: Props) {
  const { setParams } = useListNavigation();
  const [search, setSearch] = useState(filters.query);
  const [syncedQuery, setSyncedQuery] = useState(filters.query);

  // The URL changed from somewhere other than this box: the back button, a
  // pasted link, the Clear button. Adjusted during render rather than in an
  // effect, so the input never paints one frame of stale text first.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (filters.query !== syncedQuery) {
    setSyncedQuery(filters.query);
    setSearch(filters.query);
  }

  // Push typing into the URL once it settles. When `search` already matches the
  // URL there is nothing to do, which is what stops the adjustment above from
  // bouncing straight back into a navigation.
  useEffect(() => {
    if (search === filters.query) return;

    const timer = setTimeout(() => {
      setParams({ q: search || undefined });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search, filters.query, setParams]);

  // On a list with the type locked, a filter chip for it is not "active".
  const showClear = showTypeFilter
    ? hasActiveAccountFilters(filters)
    : filters.query.length > 0 || filters.health !== "all";

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative w-full lg:max-w-xs">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={placeholder}
          aria-label="Search accounts"
          className="pl-8"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {showTypeFilter && (
          <Select
            value={filters.type}
            onValueChange={(value) =>
              setParams({ type: value === "all" ? undefined : value })
            }
          >
            <SelectTrigger
              className="w-full sm:w-48"
              aria-label="Filter by account type"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {ACCOUNT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.health}
          onValueChange={(value) =>
            setParams({ health: value === "all" ? undefined : value })
          }
        >
          <SelectTrigger className="w-full sm:w-48" aria-label="Filter by signup status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_HEALTH_FILTERS.map((health) => (
              <SelectItem key={health} value={health}>
                {ACCOUNT_HEALTH_LABELS[health]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={accountSortValue(filters)}
          onValueChange={(value) => setParams(accountSortToParams(value))}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Sort accounts">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showClear && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setParams({ q: undefined, type: undefined, health: undefined })
            }
          >
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
