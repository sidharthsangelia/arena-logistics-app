// components/data-table/LinkPagination.tsx
//
// Pagination for server-rendered tables whose state lives in the URL, as
// opposed to DataTablePagination in this folder, which drives a TanStack table
// held in client state.
//
// Deliberately a server component built from <Link>. Every page is a real URL,
// so it prefetches on hover, opens in a new tab and survives a refresh, none of
// which a button calling router.push would give you. It also ships no JavaScript.

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  /** Route the links point at, e.g. "/arena-dashboard/accounts". */
  basePath: string;
  page: number;
  pageCount: number;
  /**
   * Filter state to carry across page changes. Undefined values are dropped, so
   * a caller can hand over its whole filter object without pruning defaults.
   */
  searchParams?: Record<string, string | undefined>;
  /** Optional line on the left, e.g. "Showing 1 to 25 of 240 accounts". */
  summary?: string;
};

export default function LinkPagination({
  basePath,
  page,
  pageCount,
  searchParams = {},
  summary,
}: Props) {
  // A single page still renders when there is a summary, so the row count does
  // not vanish the moment a filter narrows the list to one page.
  if (pageCount <= 1 && !summary) return null;

  function buildHref(targetPage: number) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value);
    }

    // Page 1 is the default, so it stays out of the URL. Otherwise the plain
    // route and "?page=1" become two addresses for one list.
    if (targetPage > 1) params.set("page", String(targetPage));

    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <nav
      className="flex items-center justify-between gap-4"
      aria-label="Pagination"
    >
      <p className="text-sm text-muted-foreground">
        {summary ?? `Page ${page} of ${pageCount}`}
      </p>

      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          {summary && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Page {page} of {pageCount}
            </span>
          )}

          {page <= 1 ? (
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildHref(page - 1)} rel="prev">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Link>
            </Button>
          )}

          {page >= pageCount ? (
            <Button variant="outline" size="sm" disabled>
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildHref(page + 1)} rel="next">
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      )}
    </nav>
  );
}
