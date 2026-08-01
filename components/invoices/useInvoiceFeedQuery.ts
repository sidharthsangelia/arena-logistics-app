"use client";

import { useCallback, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useDebounce } from "@/hooks/useDebounce";
import {
  DEFAULT_INVOICE_PAGE_SIZE,
  coerceInvoiceFeedSortField,
  type InvoiceFeedPage,
  type InvoiceFeedParams,
  type InvoiceKindFilter,
  type InvoiceStatusFilter,
} from "@/lib/invoices/config";

/**
 * Client state + data for the merged tenant invoice feed.
 *
 * A sibling of useInvoicesQuery rather than a generalisation of it: this list
 * carries a kind switch and a narrower set of sortable columns, and folding
 * both shapes into one hook would mean every caller passing flags to say which
 * half of it applied.
 *
 * `initialData` is the first page the route already rendered on the server, so
 * the rows and the tiles are correct on first paint instead of a round trip
 * after hydration. It seeds ONLY the untouched default view — the moment
 * anything is filtered, sorted or paged, the query key changes and the server's
 * rows would be the wrong result set.
 */
export function useInvoiceFeedQuery(opts: {
  fetcher: (params: InvoiceFeedParams) => Promise<InvoiceFeedPage>;
  initialData?: InvoiceFeedPage;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState<number>(DEFAULT_INVOICE_PAGE_SIZE);
  const [sorting, setSortingRaw] = useState<SortingState>([
    { id: "issueDate", desc: true },
  ]);
  const [status, setStatusRaw] = useState<InvoiceStatusFilter>("ALL");
  const [kind, setKindRaw] = useState<InvoiceKindFilter>("ALL");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);

  const sortField = coerceInvoiceFeedSortField(sorting[0]?.id);
  const sortDir: "asc" | "desc" = sorting[0]?.desc === false ? "asc" : "desc";

  const params: InvoiceFeedParams = {
    page,
    pageSize,
    sortField,
    sortDir,
    statusFilter: status,
    kindFilter: kind,
    search: search || undefined,
  };

  const isDefaultView =
    page === 1 &&
    pageSize === DEFAULT_INVOICE_PAGE_SIZE &&
    status === "ALL" &&
    kind === "ALL" &&
    search === "" &&
    sortField === "issueDate" &&
    sortDir === "desc";

  const query = useQuery({
    queryKey: ["org-invoice-feed", params],
    queryFn: () => opts.fetcher(params),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    initialData: isDefaultView ? opts.initialData : undefined,
  });

  // Anything that changes the result set returns to page one, so you are never
  // stranded on a page number the new set does not have.
  const setStatus = useCallback((next: InvoiceStatusFilter) => {
    setStatusRaw(next);
    setPage(1);
  }, []);

  const setKind = useCallback((next: InvoiceKindFilter) => {
    setKindRaw(next);
    setPage(1);
  }, []);

  const setPageSize = useCallback((next: number) => {
    setPageSizeRaw(next);
    setPage(1);
  }, []);

  const setSorting = useCallback((next: SortingState) => {
    setSortingRaw(next);
    setPage(1);
  }, []);

  const onSearchChange = useCallback((next: string) => {
    setSearchInput(next);
    setPage(1);
  }, []);

  const reset = useCallback(() => {
    setSearchInput("");
    setStatusRaw("ALL");
    setKindRaw("ALL");
    setPage(1);
  }, []);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    sorting,
    setSorting,
    status,
    setStatus,
    kind,
    setKind,
    searchInput,
    onSearchChange,
    reset,
    filtered: status !== "ALL" || kind !== "ALL" || searchInput.trim().length > 0,
    isFirstLoad: query.isLoading,
    isFetching: query.isFetching,
    data: query.data,
    refetch: query.refetch,
    error: query.error,
  };
}
