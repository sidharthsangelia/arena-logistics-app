"use client";

import { useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { listVaultDocumentsAction } from "@/actions/documentVault/documentValut.action";
import { useTableUrlState } from "@/hooks/useTableUrlState";
import {
  DEFAULT_VAULT_PAGE_SIZE,
  DEFAULT_VAULT_SORT,
  VAULT_PAGE_SIZE_OPTIONS,
  VAULT_SORT_FIELDS,
  coerceVaultDocTypeFilter,
  coerceVaultSortField,
  type VaultDocTypeFilter,
  type VaultListParams,
} from "@/lib/documentVault/config";

export const VAULT_QUERY_KEY = "vault-documents";

/**
 * State + data for the tenant's own client-document table. Same contract as
 * useAdminVaultQuery, pointed at the org-scoped action.
 */
export function useVaultQuery() {
  const qc = useQueryClient();

  const url = useTableUrlState({
    pageSizeOptions: VAULT_PAGE_SIZE_OPTIONS,
    defaultPageSize: DEFAULT_VAULT_PAGE_SIZE,
    sortFields: VAULT_SORT_FIELDS,
    defaultSortField: DEFAULT_VAULT_SORT,
    defaultSortDesc: true,
    filterKeys: ["docType"],
  });

  const docType = coerceVaultDocTypeFilter(url.getFilter("docType"));

  const params: VaultListParams = {
    page: url.page,
    pageSize: url.pageSize,
    sortField: coerceVaultSortField(url.sortField),
    sortDir: url.sortDir,
    docType,
    search: url.search || undefined,
  };

  const query = useQuery({
    queryKey: [VAULT_QUERY_KEY, params],
    queryFn: () => listVaultDocumentsAction(params),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  // Deleting shifts what every cached page holds, so drop the whole key rather
  // than trying to patch one page in place.
  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: [VAULT_QUERY_KEY] });
  }, [qc]);

  return {
    ...url,
    docType,
    setDocType: (next: VaultDocTypeFilter) =>
      url.setFilter("docType", next || null),
    /** Chips toggle: tapping the active type clears it. */
    toggleDocType: (next: VaultDocTypeFilter) =>
      url.setFilter("docType", docType === next ? null : next || null),

    isFirstLoad: query.isPending,
    isFetching: query.isFetching,
    data: query.data,
    error: query.error,
    refetch: query.refetch,
    invalidate,
  };
}
