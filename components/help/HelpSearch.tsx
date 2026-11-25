"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { FileText, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HELP_CATEGORIES } from "@/lib/help/types";
import { SUPPORT_EMAIL } from "@/lib/help/types";

import { useHelpSearch } from "./useHelpSearch";

const CATEGORY_TITLE = new Map<string, string>(HELP_CATEGORIES.map((c) => [c.id, c.title]));

/**
 * Search box for the help home. While a query is typed its results take the
 * place of `children` (the category browse); clearing it brings that back.
 *
 * The query is mirrored into ?q= with replaceState, so a search can be shared
 * or survive a refresh without a server round trip on every keystroke.
 */
export function HelpSearch({
  base,
  initialQuery,
  children,
}: {
  base: string;
  initialQuery: string;
  children: ReactNode;
}) {
  const [query, setQuery] = useState(initialQuery);
  // Fetch the index as soon as the box is used (or arrived pre-filled).
  const [armed, setArmed] = useState(initialQuery.length > 0);
  const { results, isLoading, isError } = useHelpSearch(query, armed, 30);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
  }, [query]);

  const searching = query.trim().length > 0;

  return (
    <div className="space-y-8">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => {
            setArmed(true);
            setQuery(e.target.value);
          }}
          onFocus={() => setArmed(true)}
          placeholder="Search the guides, e.g. customs hold, print label, top up"
          aria-label="Search the guides"
          className="h-11 bg-background pl-9 pr-10 text-base sm:text-sm"
        />
        {searching && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {!searching ? (
        children
      ) : isLoading ? (
        <ResultsSkeleton />
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          Search could not load. Refresh the page, or browse the guides below once it reloads.
        </p>
      ) : results.length === 0 ? (
        <div className="space-y-1 py-4">
          <p className="text-sm font-medium text-foreground">No guides match &ldquo;{query}&rdquo;</p>
          <p className="text-sm text-muted-foreground">
            Try fewer or different words, or email {SUPPORT_EMAIL} and we will answer directly.
          </p>
        </div>
      ) : (
        <section aria-label="Search results" className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {results.length} {results.length === 1 ? "guide" : "guides"}
          </p>
          <ul className="divide-y rounded-lg border bg-background">
            {results.map((r) => (
              <li key={r.doc.slug}>
                <Link
                  href={`${base}/help/${r.doc.slug}`}
                  className="flex gap-3 p-4 transition-colors hover:bg-muted/50"
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-foreground">{r.doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {CATEGORY_TITLE.get(r.doc.category)}
                    </p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{r.snippet}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Same row geometry as a real result, so nothing jumps when they arrive. */
function ResultsSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-16" />
      <ul className="divide-y rounded-lg border bg-background">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex gap-3 p-4">
            <Skeleton className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
