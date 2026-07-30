"use client";

import { useCallback, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useDebounce } from "@/hooks/useDebounce";
import {
  DEFAULT_INVOICE_PAGE_SIZE,
  coerceInvoiceSortField,
  type InvoiceListParams,
  type InvoicePage,
  type InvoiceStatusFilter,
} from "@/lib/invoices/config";

/**
 * Shared client state + data for an invoice table. Both dashboards drive off
 * this, so filtering, sorting, paging and the 15s cache behave identically.
 *
 * Caching: staleTime 15s means navigating filters you have already seen is
 * instant from cache; keepPreviousData keeps the current rows on screen (dimmed
 * by the table's own overlay) while the next page loads, so the list never
 * flashes empty. A full skeleton shows only on the very first load.
 *
 * `initialData` lets the server hand over the first page it already rendered.
 * Without it the sequence is: HTML arrives, JS downloads, React hydrates, and
 * only THEN does a server action go and ask for rows — a whole round trip after
 * the page already looked ready, which is what made this route feel slow. With
 * it, the first paint has real rows and no fetch happens at all until the data
 * goes stale.
 */
export function useInvoicesQuery(opts: {
  queryKey: string;
  fetcher: (params: InvoiceListParams) => Promise<InvoicePage>;
  /** Arena only: narrow every query to one org (null = all orgs). */
  orgId?: string | null;
  /** Server-rendered first page. Only seeds the untouched default view. */
  initialData?: InvoicePage;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState<number>(DEFAULT_INVOICE_PAGE_SIZE);
  const [sorting, setSortingRaw] = useState<SortingState>([
    { id: "issueDate", desc: true },
  ]);
  const [status, setStatusRaw] = useState<InvoiceStatusFilter>("ALL");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);

  const sortField = coerceInvoiceSortField(sorting[0]?.id);
  const sortDir: "asc" | "desc" = sorting[0]?.desc === false ? "asc" : "desc";

  const params: InvoiceListParams = {
    page,
    pageSize,
    sortField,
    sortDir,
    statusFilter: status,
    search: search || undefined,
    orgId: opts.orgId ?? undefined,
  };

  // The server rendered exactly one view: the untouched default. The moment the
  // user sorts, filters, searches or pages, the query key changes and seeding it
  // with the server's rows would be showing them the wrong result set, so the
  // handover is scoped to the view it actually came from.
  const isDefaultView =
    page === 1 &&
    pageSize === DEFAULT_INVOICE_PAGE_SIZE &&
    status === "ALL" &&
    search === "" &&
    sortField === "issueDate" &&
    sortDir === "desc";

  const query = useQuery({
    queryKey: [opts.queryKey, params],
    queryFn: () => opts.fetcher(params),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    initialData: isDefaultView ? opts.initialData : undefined,
  });

  // Any change to what is being filtered resets to the first page, so you are
  // never stranded on a page number the new result set does not have.
  const setStatus = useCallback((next: InvoiceStatusFilter) => {
    setStatusRaw(next);
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

  return {
    // state
    page,
    setPage,
    pageSize,
    setPageSize,
    sorting,
    setSorting,
    status,
    setStatus,
    searchInput,
    onSearchChange,
    // derived flags
    isFirstLoad: query.isLoading,
    isFetching: query.isFetching,
    // data
    data: query.data,
    refetch: query.refetch,
    error: query.error,
  };
}
