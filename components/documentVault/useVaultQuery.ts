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

  /**
   * Take rows off the page the user is looking at, before the server has agreed.
   *
   * Deleting a document is a slow operation — the row goes, and so does the file
   * in UploadThing — and watching a row sit there for a second after confirming
   * its deletion reads as the click not having registered. So the row goes
   * immediately and the truth catches up.
   *
   * Only the visible page is patched, not every cached page: the ones behind it
   * shift by a row and there is no honest way to guess how. `invalidate()` is
   * what puts them right, and the caller runs it either way.
   *
   * Returns the undo. The caller keeps it and calls it if the server says no,
   * which is the whole reason this hands back a function rather than just
   * mutating and hoping.
   */
  const removeRowsOptimistically = (ids: string[]) => {
    const key = [VAULT_QUERY_KEY, params];
    const previous = qc.getQueryData<VaultPage>(key);
    if (!previous) return () => {};

    const doomed = new Set(ids);
    qc.setQueryData<VaultPage>(key, {
      ...previous,
      rows: previous.rows.filter((row) => !doomed.has(row.id)),
      // The pager has to agree with the rows, or removing the last row of a page
      // leaves a count claiming it is still there.
      total: Math.max(0, previous.total - ids.length),
    });

    return () => qc.setQueryData(key, previous);
  };

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
    removeRowsOptimistically,
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
