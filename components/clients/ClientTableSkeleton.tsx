"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { DataTable } from "@/components/data-table/DataTable";
import { DataTableFacetedFilter } from "@/components/data-table/DataTableFacetedFilter";
import { DataTableViewOptions } from "@/components/data-table/DataTableViewOptions";
import { Input } from "@/components/ui/input";
import {
  CLIENT_TOGGLEABLE_COLUMNS,
  DEFAULT_CLIENT_COLUMN_VISIBILITY,
  getClientColumns,
} from "@/app/(arena)/arena-dashboard/clients/Columns";

/**
 * The clients table before its rows arrive.
 *
 * ── WHY THIS RENDERS THE REAL TABLE ─────────────────────────────────────────
 * This used to be a hand-written table of six grey bars under six hardcoded
 * headers. The table it stood in for has eight columns with different labels, so
 * every load ended with the header row rewriting itself and the column widths
 * jumping — the exact shift a skeleton exists to prevent. Worse, the two could
 * not be kept in step: adding a column to Columns.tsx left this file behind with
 * nothing to catch it.
 *
 * So it renders the same DataTable with the same column definitions and hands it
 * `isFirstLoad`. The header labels, the column widths, the border, the row
 * striping and the pager are then not a copy of the real ones, they ARE the real
 * ones. Only the cells are placeholders, and each column can describe its own
 * through `meta.skeleton`. A column added to Columns.tsx shows up here for free.
 *
 * The toolbar is built from the same primitives for the same reason. The search
 * box is disabled rather than merely inert: it occupies its exact final space,
 * but it cannot quietly swallow something typed a moment before the real input
 * replaces it.
 */
export default function ClientsTableSkeleton({
  client = false,
  rows,
  pageSize,
}: {
  /** Tenant view. Decides the column set, exactly as it does for the real table. */
  client?: boolean;
  /**
   * How many placeholder rows to draw, and what the pager should say. Both are
   * required rather than defaulted, because the default lives in queries/clients
   * which is a server-only module — importing its value here would drag it into
   * the client bundle and fail the build. The callers are all server components
   * and already know the number.
   */
  rows: number;
  pageSize: number;
}) {
  const columns = React.useMemo(() => getClientColumns(client), [client]);

  return (
    <DataTable
      columns={columns}
      data={[]}
      isFirstLoad
      skeletonRows={rows}
      page={1}
      pageSize={pageSize}
      totalRows={0}
      pageCount={1}
      onPageChange={noop}
      onPageSizeChange={noop}
      sorting={[]}
      onSortingChange={noop}
      columnVisibility={DEFAULT_CLIENT_COLUMN_VISIBILITY}
      onColumnVisibilityChange={noop}
      toolbar={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                disabled
                placeholder="Search client, contact, email..."
                className="h-8 pl-8"
              />
            </div>

            <DataTableFacetedFilter
              title="Business Associate"
              options={[]}
              selected={[]}
              onChange={noop}
            />
          </div>

          <DataTableViewOptions
            columns={CLIENT_TOGGLEABLE_COLUMNS}
            columnVisibility={DEFAULT_CLIENT_COLUMN_VISIBILITY}
            onColumnVisibilityChange={noop}
          />
        </div>
      }
    />
  );
}

function noop() {}
