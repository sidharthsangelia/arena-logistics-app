"use client";

import { useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

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
  type VaultPage,
} from "@/lib/documentVault/config";

export const VAULT_QUERY_KEY = "vault-documents";

/**
 * State + data for the tenant's own client-document table. Same contract as
 * useAdminVaultQuery, pointed at the org-scoped endpoint — see that hook for why
 * both read a GET rather than calling a server action, and why the prefetch is
 * matched on params rather than on "is this the default view".
 */
export function useVaultQuery(opts?: {
  initialData?: VaultPage;
  initialParams?: VaultListParams;
}) {
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

  const seed = opts?.initialParams;
  const matchesPrefetch =
    Boolean(opts?.initialData && seed) &&
    seed!.page === params.page &&
    seed!.pageSize === params.pageSize &&
    seed!.sortField === params.sortField &&
    seed!.sortDir === params.sortDir &&
    (seed!.docType ?? "") === (params.docType ?? "") &&
    (seed!.search ?? "") === (params.search ?? "");

  const query = useQuery({
    queryKey: [VAULT_QUERY_KEY, params],
    queryFn: ({ signal }) => fetchTenantVaultPage(params, signal),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    initialData: matchesPrefetch ? opts?.initialData : undefined,
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

async function fetchTenantVaultPage(
  params: VaultListParams,
  signal: AbortSignal,
): Promise<VaultPage> {
  const qs = new URLSearchParams({
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? DEFAULT_VAULT_PAGE_SIZE),
    sort: params.sortField ?? DEFAULT_VAULT_SORT,
    dir: params.sortDir ?? "desc",
  });
  if (params.docType) qs.set("docType", params.docType);
  if (params.search) qs.set("q", params.search);

  const res = await fetch(`/api/document-vault/tenant?${qs}`, { signal });
  if (!res.ok) throw new Error("Could not load documents.");
  return res.json();
}
