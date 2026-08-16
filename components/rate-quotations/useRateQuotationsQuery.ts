"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { listRateQuotationsAction } from "@/actions/rateQuotations.action";
import { useTableUrlState } from "@/hooks/useTableUrlState";
import {
  DEFAULT_RATE_QUOTATION_PAGE_SIZE,
  DEFAULT_RATE_QUOTATION_SORT,
  RATE_QUOTATION_PAGE_SIZE_OPTIONS,
  RATE_QUOTATION_SORT_FIELDS,
  coerceRateQuotationAudienceFilter,
  coerceRateQuotationSortField,
  type RateQuotationAudienceFilter,
  type RateQuotationListParams,
} from "@/lib/rateQuotations/config";

export const RATE_QUOTATIONS_QUERY_KEY = "rate-quotations";

/**
 * State + data for the generated rate-card history.
 *
 * Same shape as useAdminQuotesQuery: filters in the URL through the History API
 * so a filter change costs a cached fetch rather than a server render, and
 * keepPreviousData so paging never flashes an empty table.
 *
 * The filter key is "audience" rather than "status" — these have no workflow,
 * and the only distinction that matters is customer versus cost.
 */
export function useRateQuotationsQuery() {
  const url = useTableUrlState({
    pageSizeOptions: RATE_QUOTATION_PAGE_SIZE_OPTIONS,
    defaultPageSize: DEFAULT_RATE_QUOTATION_PAGE_SIZE,
    sortFields: RATE_QUOTATION_SORT_FIELDS,
    defaultSortField: DEFAULT_RATE_QUOTATION_SORT,
    defaultSortDesc: true,
    filterKeys: ["audience"],
  });

  const audience = coerceRateQuotationAudienceFilter(url.getFilter("audience"));

  const params: RateQuotationListParams = {
    page: url.page,
    pageSize: url.pageSize,
    sortField: coerceRateQuotationSortField(url.sortField),
    sortDir: url.sortDir,
    audience,
    search: url.search || undefined,
  };

  const query = useQuery({
    queryKey: [RATE_QUOTATIONS_QUERY_KEY, params],
    queryFn: () => listRateQuotationsAction(params),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  return {
    ...url,
    audience,
    setAudience: (next: RateQuotationAudienceFilter) =>
      url.setFilter("audience", next === "ALL" ? null : next),

    isFirstLoad: query.isPending,
    isFetching: query.isFetching,
    data: query.data,
    error: query.error,
    refetch: query.refetch,
  };
}
