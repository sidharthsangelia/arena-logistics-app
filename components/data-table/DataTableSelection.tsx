"use client";

import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * The leading checkbox column. Kept here rather than redefined per table so
 * "select all" always means "every row on this page" and nothing else: the
 * tables are server-paginated, so the header checkbox cannot honestly claim to
 * cover rows it has never loaded.
 */
export function selectionColumn<TData>(
  label: (row: TData) => string,
): ColumnDef<TData> {
  return {
    id: "select",
    enableSorting: false,
    size: 32,
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all rows on this page"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label={`Select ${label(row.original)}`}
      />
    ),
  };
}

/** The ids currently ticked, in the order react-table holds them. */
export function selectedIds(selection: RowSelectionState): string[] {
  return Object.keys(selection).filter((id) => selection[id]);
}

/**
 * Replaces the filter controls while rows are ticked, so the destructive action
 * and the filters are never adjacent. Delete always goes through a confirm.
 */
export function DataTableBulkBar({
  count,
  noun,
  isPending,
  onDelete,
  onClear,
}: {
  count: number;
  /** Singular noun for the confirm copy, e.g. "quote". */
  noun: string;
  isPending?: boolean;
  onDelete: () => void;
  onClear: () => void;
}) {
  const plural = count !== 1 ? "s" : "";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
      <span className="text-sm font-medium">
        {count} {noun}
        {plural} selected
      </span>

      <div className="ml-auto flex items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={isPending}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete {count}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {count} {noun}
                {plural}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                The selected {noun}
                {plural} will be permanently removed. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button variant="ghost" size="sm" onClick={onClear} disabled={isPending}>
          Clear selection
        </Button>
      </div>
    </div>
  );
}
