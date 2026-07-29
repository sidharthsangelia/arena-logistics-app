"use client";

// components/accounts/AccountsTable.tsx
//
// Every organisation that has signed up, rendered with TanStack Table.
//
// TanStack does the column plumbing only. Sorting, filtering and paging are all
// manual: the server has already decided which twenty five rows these are, and
// letting the client re-sort them would reorder one page while claiming to have
// ordered the whole list. The column headers write to the URL instead. See
// AccountsSortableHeader.
//
// NO HORIZONTAL SCROLL
// The table is `table-fixed` inside a container with overflow-x clipped, so it
// always fits its box. Two things make that work, and both live in
// lib/accounts/columnLayout.ts: every column declares a percentage width, and
// the ones that describe an account rather than identify it are hidden below the
// breakpoint where they would start crushing the name. Long values truncate,
// with the full text on hover.
//
// Money columns are absent, not blank, for anyone who is not an Arena admin. The
// values are already null by the time they reach here (see queries/accounts.ts),
// so there is nothing to leak even if a column slipped through.

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import LinkPagination from "@/components/data-table/LinkPagination";
import { getAccountColumns } from "@/components/accounts/accountColumns";
import type { AccountRow } from "@/queries/accounts";
import {
  ACCOUNTS_BASE_PATH,
  accountFiltersToQuery,
  hasActiveAccountFilters,
  type AccountFilters,
} from "@/lib/accounts/filters";
import { cn } from "@/lib/utils";

type Props = {
  rows: AccountRow[];
  filters: AccountFilters;
  page: number;
  pageCount: number;
  totalRows: number;
  /** Arena admins only. Adds the markup and wallet columns. */
  canSeeMoney: boolean;
  /** Arena admins only. Adds the per-row promote and demote menu. */
  canManage: boolean;
};

export default function AccountsTable({
  rows,
  filters,
  page,
  pageCount,
  totalRows,
  canSeeMoney,
  canManage,
}: Props) {
  const columns = React.useMemo(
    () => getAccountColumns({ filters, canSeeMoney, canManage }),
    [filters, canSeeMoney, canManage],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    // The server owns all three. Left on, TanStack would paginate the single
    // page it has been given and report a row count of 25 forever.
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    pageCount,
  });

  const firstRow = totalRows === 0 ? 0 : (page - 1) * filters.pageSize + 1;
  const lastRow = Math.min(page * filters.pageSize, totalRows);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <TooltipProvider delayDuration={200}>
          <Table
            className="table-fixed"
            containerClassName="overflow-x-clip rounded-lg"
          >
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="bg-muted/50 hover:bg-muted/50"
                >
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "text-xs uppercase tracking-wide",
                        header.column.columnDef.meta?.headerClassName,
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    {hasActiveAccountFilters(filters)
                      ? "No accounts match these filters."
                      : "No accounts yet. They appear here as soon as someone signs up."}
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="group">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "overflow-hidden",
                          cell.column.columnDef.meta?.cellClassName,
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

      <LinkPagination
        basePath={ACCOUNTS_BASE_PATH}
        page={page}
        pageCount={pageCount}
        searchParams={accountFiltersToQuery(filters)}
        summary={
          totalRows === 0
            ? "No accounts"
            : `Showing ${firstRow} to ${lastRow} of ${totalRows} ${
                totalRows === 1 ? "account" : "accounts"
              }`
        }
      />
    </div>
  );
}
