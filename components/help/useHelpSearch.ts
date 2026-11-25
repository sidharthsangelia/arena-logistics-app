"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getHelpSearchIndexAction } from "@/actions/help/help.action";
import { prepareIndex, searchHelp, type HelpSearchResult } from "@/lib/help/search";

export const HELP_INDEX_QUERY_KEY = ["help-search-index"] as const;

/**
 * The viewer's help search index, fetched once on first use and shared by the
 * help home and the Cmd+K palette. Content only changes on deploy, so it never
 * goes stale within a session.
 */
export function useHelpSearch(query: string, enabled: boolean, limit?: number) {
  const indexQuery = useQuery({
    queryKey: HELP_INDEX_QUERY_KEY,
    queryFn: () => getHelpSearchIndexAction(),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const prepared = useMemo(
    () => (indexQuery.data ? prepareIndex(indexQuery.data) : null),
    [indexQuery.data],
  );

  const results: HelpSearchResult[] = useMemo(
    () => (prepared && query.trim() ? searchHelp(prepared, query, limit) : []),
    [prepared, query, limit],
  );

  return {
    results,
    /** True only while the index itself is loading, not while typing. */
    isLoading: enabled && indexQuery.isPending,
    isError: indexQuery.isError,
  };
}
