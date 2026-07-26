"use client";

/**
 * hooks/useTableUrlState.ts
 *
 * Paging / sorting / search / filter state for a server-paginated table, kept in
 * the URL but WITHOUT a server round-trip on every change.
 *
 * Why not router.push? A searchParams-driven page re-renders on the server for
 * each keystroke and filter click: every interaction pays a full RSC request
 * before anything on screen moves. Writing the same params with the native
 * History API keeps the URL shareable and refresh-safe (and back/forward still
 * work) while the data itself comes from react-query, which caches and holds the
 * previous rows on screen. The Next.js docs sanction this: pushState and
 * replaceState integrate with the router, so useSearchParams stays in sync.
 *
 * The URL is the single source of truth. The one exception is the search box,
 * which keeps a local value so typing is instant and only the settled value is
 * written to the URL.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { SortingState } from "@tanstack/react-table";

import { useDebounce } from "./useDebounce";

export interface TableUrlStateConfig {
  /** Accepted `pageSize` values. Anything else in the URL falls back to the default. */
  pageSizeOptions: readonly number[];
  defaultPageSize: number;
  /** Accepted `sort` values, i.e. the columns the server knows how to order by. */
  sortFields: readonly string[];
  defaultSortField: string;
  /** Direction used when the URL carries no `dir`. */
  defaultSortDesc?: boolean;
  /** Extra filter params this table owns, so "clear filters" knows what to drop. */
  filterKeys?: readonly string[];
  /** How long to wait after the last keystroke before the search hits the URL. */
  searchDelayMs?: number;
}

type ParamUpdates = Record<string, string | number | null | undefined>;

export interface TableUrlState {
  page: number;
  pageSize: number;
  sortField: string;
  sortDir: "asc" | "desc";
  /** TanStack's shape, for feeding straight into DataTable. */
  sorting: SortingState;
  /** The settled search term the query should use. */
  search: string;
  /** The live value of the input, which updates on every keystroke. */
  searchInput: string;

  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSorting: (sorting: SortingState) => void;
  setSearchInput: (value: string) => void;

  getFilter: (key: string) => string;
  setFilter: (key: string, value: string | null) => void;

  /** True when a search term or any registered filter is active. */
  isFiltered: boolean;
  clearFilters: () => void;
}

export function useTableUrlState({
  pageSizeOptions,
  defaultPageSize,
  sortFields,
  defaultSortField,
  defaultSortDesc = true,
  filterKeys = [],
  searchDelayMs = 300,
}: TableUrlStateConfig): TableUrlState {
  const searchParams = useSearchParams();

  // ── Write ────────────────────────────────────────────────────────────────
  // Reads window.location rather than the searchParams snapshot so two updates
  // landing in the same tick cannot overwrite each other with stale values.
  const write = useCallback(
    (updates: ParamUpdates, mode: "push" | "replace" = "push") => {
      const next = new URLSearchParams(window.location.search);

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }

      const qs = next.toString();
      const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      if (url === `${window.location.pathname}${window.location.search}`) return;

      if (mode === "replace") window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    },
    [],
  );

  // ── Read ─────────────────────────────────────────────────────────────────
  const page = (() => {
    const raw = Number.parseInt(searchParams.get("page") ?? "", 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  })();

  const pageSize = (() => {
    const raw = Number.parseInt(searchParams.get("pageSize") ?? "", 10);
    return pageSizeOptions.includes(raw) ? raw : defaultPageSize;
  })();

  const sortField = (() => {
    const raw = searchParams.get("sort") ?? "";
    return sortFields.includes(raw) ? raw : defaultSortField;
  })();

  const sortDir: "asc" | "desc" = (() => {
    const raw = searchParams.get("dir");
    if (raw === "asc") return "asc";
    if (raw === "desc") return "desc";
    return defaultSortDesc ? "desc" : "asc";
  })();

  const sorting = useMemo<SortingState>(
    () => [{ id: sortField, desc: sortDir === "desc" }],
    [sortField, sortDir],
  );

  const search = searchParams.get("q")?.trim() ?? "";

  // ── Search box ───────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebounce(searchInput, searchDelayMs);
  // The last value this hook itself put in the URL. Lets the two effects below
  // tell "the user typed this" apart from "the URL moved under us".
  const ownedSearch = useRef(search);

  useEffect(() => {
    const value = debouncedSearch.trim();
    if (value === ownedSearch.current) return;
    ownedSearch.current = value;
    // replace, not push: a typed word should not fill the back stack with one
    // entry per character.
    write({ q: value || null, page: null }, "replace");
  }, [debouncedSearch, write]);

  useEffect(() => {
    // Back/forward, or a "clear filters" press. Adopting the URL value here is
    // safe because a value the user just typed always matches ownedSearch.
    if (search === ownedSearch.current) return;
    ownedSearch.current = search;
    setSearchInput(search);
  }, [search]);

  // ── Setters ──────────────────────────────────────────────────────────────
  const setPage = useCallback(
    (next: number) => write({ page: next <= 1 ? null : next }),
    [write],
  );

  const setPageSize = useCallback(
    (next: number) =>
      write({ pageSize: next === defaultPageSize ? null : next, page: null }),
    [write, defaultPageSize],
  );

  const setSorting = useCallback(
    (next: SortingState) => {
      const first = next[0];
      if (!first) {
        write({ sort: null, dir: null, page: null });
        return;
      }
      // Leave the default sort out of the URL so a freshly opened page has a
      // clean address.
      const isDefault =
        first.id === defaultSortField && first.desc === defaultSortDesc;
      write({
        sort: isDefault ? null : first.id,
        dir: isDefault ? null : first.desc ? "desc" : "asc",
        page: null,
      });
    },
    [write, defaultSortField, defaultSortDesc],
  );

  const getFilter = useCallback(
    (key: string) => searchParams.get(key) ?? "",
    [searchParams],
  );

  const setFilter = useCallback(
    (key: string, value: string | null) => write({ [key]: value, page: null }),
    [write],
  );

  const isFiltered =
    search.length > 0 || filterKeys.some((key) => Boolean(searchParams.get(key)));

  const filterKeysSignature = filterKeys.join(",");
  const clearFilters = useCallback(() => {
    const cleared: ParamUpdates = { q: null, page: null };
    for (const key of filterKeysSignature ? filterKeysSignature.split(",") : []) {
      cleared[key] = null;
    }
    ownedSearch.current = "";
    setSearchInput("");
    write(cleared);
  }, [write, filterKeysSignature]);

  return {
    page,
    pageSize,
    sortField,
    sortDir,
    sorting,
    search,
    searchInput,
    setPage,
    setPageSize,
    setSorting,
    setSearchInput,
    getFilter,
    setFilter,
    isFiltered,
    clearFilters,
  };
}
