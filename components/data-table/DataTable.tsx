"use client";

import * as React from "react";
import {
  type ColumnDef,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DataTablePagination } from "./DataTablePagination";

/**
 * A column may describe the shape of its own placeholder cell. It is the only
 * way a first-load skeleton can keep the column widths the real rows will
 * settle on — a badge column and a date column are not the same width, and a
 * row of identical grey bars guarantees the table jumps once the data lands.
 */
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    skeleton?: React.ReactNode;
  }
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];

  page: number;
  pageSize: number;
  totalRows: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;

  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;

  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;

  /** True while a server request for new data is in flight (e.g. router transition). */
  isLoading?: boolean;
  /**
   * True before the FIRST rows have ever arrived. The table keeps its own
   * chrome — header labels, pagination controls, the border — and stands in
   * only the cells, so nothing that is already known has to wait for the
   * fetch, and nothing moves when it finishes.
   */
  isFirstLoad?: boolean;
  /** How many placeholder rows to draw while `isFirstLoad`. */
  skeletonRows?: number;

  toolbar?: React.ReactNode;
  emptyState?: React.ReactNode;

  // ── Row selection (opt-in) ────────────────────────────────────────────────
  // Only tables with bulk actions pass these. Left out, the table behaves
  // exactly as before, so existing call sites are unaffected.
  /** Selected rows, keyed by the id `getRowId` returns. */
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  /**
   * Required alongside rowSelection. Selection must key off the row's own id,
   * not its index, or paging would carry a selection over to whichever rows
   * happen to land in the same positions on the next page.
   */
  getRowId?: (row: TData) => string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  page,
  pageSize,
  totalRows,
  pageCount,
  onPageChange,
  onPageSizeChange,
  sorting,
  onSortingChange,
  columnVisibility,
  onColumnVisibilityChange,
  isLoading,
  isFirstLoad,
  skeletonRows = 6,
  toolbar,
  emptyState,
  rowSelection,
  onRowSelectionChange,
  getRowId,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    pageCount,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    enableRowSelection: Boolean(onRowSelectionChange),
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    onColumnVisibilityChange: (updater) => {
      if (!onColumnVisibilityChange) return;
      const next =
        typeof updater === "function" ? updater(columnVisibility ?? {}) : updater;
      onColumnVisibilityChange(next);
    },
    onRowSelectionChange: (updater) => {
      if (!onRowSelectionChange) return;
      const next =
        typeof updater === "function" ? updater(rowSelection ?? {}) : updater;
      onRowSelectionChange(next);
    },
    state: {
      sorting,
      columnVisibility,
      rowSelection: rowSelection ?? {},
    },
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-4">
      {toolbar}

      <div className="relative overflow-hidden rounded-md border">
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="whitespace-nowrap">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isFirstLoad ? (
                Array.from({ length: skeletonRows }).map((_, i) => (
                  <TableRow
                    key={`skeleton-${i}`}
                    className={cn("hover:bg-transparent", i % 2 !== 0 && "bg-muted/10")}
                  >
                    {table.getVisibleLeafColumns().map((column) => (
                      <TableCell key={column.id}>
                        {column.columnDef.meta?.skeleton ?? (
                          <Skeleton className="h-5 w-24" />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length ? (
                rows.map((row, i) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className={cn(i % 2 !== 0 && "bg-muted/10")}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-40 text-center">
                    {emptyState ?? "No results."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {isLoading && !isFirstLoad && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          </div>
        )}
      </div>

      <DataTablePagination
        isLoading={isFirstLoad}
        page={page}
        pageSize={pageSize}
        totalRows={totalRows}
        pageCount={pageCount}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}