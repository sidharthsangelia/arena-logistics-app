"use client";

import { useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { listQuotesAction } from "@/actions/quote/quotesList.action";
import { useTableUrlState } from "@/hooks/useTableUrlState";
import {
  DEFAULT_QUOTE_PAGE_SIZE,
  DEFAULT_QUOTE_SORT,
  QUOTE_PAGE_SIZE_OPTIONS,
  QUOTE_SORT_FIELDS,
  coerceQuoteSortField,
  coerceQuoteStatusFilter,
  type QuoteListParams,
  type QuoteStatusFilter,
} from "@/lib/quotes/config";

export const QUOTES_QUERY_KEY = "quotes";

/**
 * State + data for the tenant's own quotes table. Same contract as
 * useAdminQuotesQuery, pointed at the org-scoped action: URL-backed filters
 * written through the History API, react-query holding the previous page on
 * screen while the next one loads.
 */
export function useQuotesQuery() {
  const qc = useQueryClient();

  const url = useTableUrlState({
    pageSizeOptions: QUOTE_PAGE_SIZE_OPTIONS,
    defaultPageSize: DEFAULT_QUOTE_PAGE_SIZE,
    sortFields: QUOTE_SORT_FIELDS,
    defaultSortField: DEFAULT_QUOTE_SORT,
    defaultSortDesc: true,
    filterKeys: ["status"],
  });

  const status = coerceQuoteStatusFilter(url.getFilter("status"));

  const params: QuoteListParams = {
    page: url.page,
    pageSize: url.pageSize,
    sortField: coerceQuoteSortField(url.sortField),
    sortDir: url.sortDir,
    status,
    search: url.search || undefined,
  };

  const query = useQuery({
    queryKey: [QUOTES_QUERY_KEY, params],
    queryFn: () => listQuotesAction(params),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  // Deleting or sending a quote changes what every cached page holds, so drop
  // the whole key rather than trying to patch one page in place.
  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: [QUOTES_QUERY_KEY] });
  }, [qc]);

  return {
    ...url,
    status,
    setStatus: (next: QuoteStatusFilter) =>
      url.setFilter("status", next === "ALL" ? null : next),

    isFirstLoad: query.isPending,
    isFetching: query.isFetching,
    data: query.data,
    error: query.error,
    refetch: query.refetch,
    invalidate,
  };
}
