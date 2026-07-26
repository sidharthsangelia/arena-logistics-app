"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { listAllVaultDocumentsAction } from "@/actions/documentVault/documentVaultAdmin.action";
import { useTableUrlState } from "@/hooks/useTableUrlState";
import {
  ADMIN_VAULT_SORT_FIELDS,
  DEFAULT_ADMIN_VAULT_SORT,
  DEFAULT_VAULT_PAGE_SIZE,
  VAULT_PAGE_SIZE_OPTIONS,
  coerceAdminVaultSortField,
  coerceVaultDocTypeFilter,
  type AdminVaultListParams,
  type VaultDocTypeFilter,
} from "@/lib/documentVault/config";

export const ADMIN_VAULT_QUERY_KEY = "arena-vault-documents";

/**
 * State + data for the Arena document vault table. Same contract as
 * useAdminQuotesQuery: URL-backed filters written through the History API, and
 * react-query holding the previous page on screen while the next one loads.
 */
export function useAdminVaultQuery() {
  const url = useTableUrlState({
    pageSizeOptions: VAULT_PAGE_SIZE_OPTIONS,
    defaultPageSize: DEFAULT_VAULT_PAGE_SIZE,
    sortFields: ADMIN_VAULT_SORT_FIELDS,
    defaultSortField: DEFAULT_ADMIN_VAULT_SORT,
    defaultSortDesc: true,
    filterKeys: ["docType"],
  });

  const docType = coerceVaultDocTypeFilter(url.getFilter("docType"));

  const params: AdminVaultListParams = {
    page: url.page,
    pageSize: url.pageSize,
    sortField: coerceAdminVaultSortField(url.sortField),
    sortDir: url.sortDir,
    docType,
    search: url.search || undefined,
  };

  const query = useQuery({
    queryKey: [ADMIN_VAULT_QUERY_KEY, params],
    queryFn: () => listAllVaultDocumentsAction(params),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

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
  };
}
