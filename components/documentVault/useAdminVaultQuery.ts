"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useTableUrlState } from "@/hooks/useTableUrlState";
import {
  ADMIN_VAULT_SORT_FIELDS,
  DEFAULT_ADMIN_VAULT_SORT,
  DEFAULT_VAULT_PAGE_SIZE,
  VAULT_PAGE_SIZE_OPTIONS,
  coerceAdminVaultSortField,
  coerceVaultDocTypeFilter,
  type AdminVaultListParams,
  type AdminVaultPage,
  type VaultDocTypeFilter,
} from "@/lib/documentVault/config";

export const ADMIN_VAULT_QUERY_KEY = "arena-vault-documents";

/**
 * State + data for the Arena document vault table. URL-backed filters written
 * through the History API, and react-query holding the previous page on screen
 * while the next one loads.
 *
 * ── WHY THIS FETCHES A URL RATHER THAN CALLING A SERVER ACTION ──────────────
 * This list was read through a server action. Server actions are POSTs that
 * Next.js runs one at a time per client, so on a table where a keystroke, a
 * filter change and a page change can overlap, each request waited for the one
 * before it and the only result anybody wanted was the one that started last.
 *
 * Fetching a GET lets them run concurrently, and passing react-query's own
 * `signal` through means a request whose query key has already moved on is
 * actually aborted rather than left to finish and be discarded.
 */
export function useAdminVaultQuery(opts?: {
  /**
   * The first page, already rendered on the server by the route, and the exact
   * params it was rendered for.
   *
   * The params are what makes this safe. The route reads the same URL this hook
   * does, so on a plain visit the two agree and the table paints with real rows
   * and no fetch at all. On a shared link carrying a filter they also agree,
   * because the route prefetched that filter. They disagree only after the user
   * changes something, and at that point the server's rows are the wrong result
   * set and must not be used — hence the comparison rather than a blanket
   * "is this the default view" test, which would throw away a correct prefetch
   * for every filtered link.
   */
  initialData?: AdminVaultPage;
  initialParams?: AdminVaultListParams;
}) {
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

  // Compared field by field rather than by serialising both, so a difference in
  // key order or an undefined-versus-missing key cannot silently make a matching
  // prefetch look stale.
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
    queryKey: [ADMIN_VAULT_QUERY_KEY, params],
    queryFn: ({ signal }) => fetchAdminVaultPage(params, signal),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    initialData: matchesPrefetch ? opts?.initialData : undefined,
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

async function fetchAdminVaultPage(
  params: AdminVaultListParams,
  signal: AbortSignal,
): Promise<AdminVaultPage> {
  const qs = new URLSearchParams({
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? DEFAULT_VAULT_PAGE_SIZE),
    sort: params.sortField ?? DEFAULT_ADMIN_VAULT_SORT,
    dir: params.sortDir ?? "desc",
  });
  if (params.docType) qs.set("docType", params.docType);
  if (params.search) qs.set("q", params.search);

  const res = await fetch(`/api/document-vault/admin?${qs}`, { signal });

  if (!res.ok) {
    // The message is deliberately not the server's. A failing read here is
    // either a session that lost Arena membership or a database problem, and
    // neither is something to spell out to whoever is looking at the screen.
    throw new Error("Could not load documents.");
  }

  return res.json();
}
