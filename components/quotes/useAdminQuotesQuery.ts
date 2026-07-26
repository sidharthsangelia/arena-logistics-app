"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { listAllQuotesAction } from "@/actions/quote/quotesListAdmin.action";
import { useTableUrlState } from "@/hooks/useTableUrlState";
import {
  ADMIN_QUOTE_SORT_FIELDS,
  DEFAULT_ADMIN_QUOTE_SORT,
  DEFAULT_QUOTE_PAGE_SIZE,
  QUOTE_PAGE_SIZE_OPTIONS,
  coerceAdminQuoteSortField,
  coerceQuoteStatusFilter,
  type AdminQuoteListParams,
  type QuoteStatusFilter,
} from "@/lib/quotes/config";

export const ADMIN_QUOTES_QUERY_KEY = "arena-quotes";

/**
 * State + data for the Arena quotes table.
 *
 * Filters live in the URL (shareable, survives a refresh) but move through the
 * History API, so changing one costs a cached client fetch rather than a full
 * server render. staleTime means going back to a filter you have already used is
 * instant; keepPreviousData keeps the current rows visible, dimmed, while the
 * next page loads, so the list never flashes empty.
 */
export function useAdminQuotesQuery() {
  const url = useTableUrlState({
    pageSizeOptions: QUOTE_PAGE_SIZE_OPTIONS,
    defaultPageSize: DEFAULT_QUOTE_PAGE_SIZE,
    sortFields: ADMIN_QUOTE_SORT_FIELDS,
    defaultSortField: DEFAULT_ADMIN_QUOTE_SORT,
    defaultSortDesc: true,
    filterKeys: ["status"],
  });

  const status = coerceQuoteStatusFilter(url.getFilter("status"));

  const params: AdminQuoteListParams = {
    page: url.page,
    pageSize: url.pageSize,
    sortField: coerceAdminQuoteSortField(url.sortField),
    sortDir: url.sortDir,
    status,
    search: url.search || undefined,
  };

  const query = useQuery({
    queryKey: [ADMIN_QUOTES_QUERY_KEY, params],
    queryFn: () => listAllQuotesAction(params),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  return {
    ...url,
    status,
    setStatus: (next: QuoteStatusFilter) =>
      url.setFilter("status", next === "ALL" ? null : next),

    /** No rows to show yet, so a skeleton is the honest placeholder. */
    isFirstLoad: query.isPending,
    /** A request over rows that are already on screen. */
    isFetching: query.isFetching,
    data: query.data,
    error: query.error,
    refetch: query.refetch,
  };
}
