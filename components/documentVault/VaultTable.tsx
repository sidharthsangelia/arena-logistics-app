"use client";

/**
 * components/documentVault/VaultTable.tsx
 *
 * A Business Associate's own client KYC paperwork. Server-paginated, sorted and
 * filtered on the server; the client only ever holds one page.
 *
 * What this has over the Arena table: row selection with a bulk delete, and a
 * per-row delete. Both remove the file from UploadThing as well as the row, so
 * both go through a confirm.
 */

import * as React from "react";
import Link from "next/link";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Building2, FileText, ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/DataTable";
import { DataTableColumnHeader } from "@/components/data-table/DataTableColumnHeader";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";
import {
  DataTableBulkBar,
  selectedIds,
  selectionColumn,
} from "@/components/data-table/DataTableSelection";
import {
  DataTableEmptyState,
  DataTableErrorState,
  DataTableToolbar,
} from "@/components/data-table/DataTableToolbar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteKycDocumentAction } from "@/actions/documentVault/clientsDocument.action";
import { formatDate } from "@/utils/format";
import {
  KYC_DOC_TYPES,
  KYC_DOC_TYPE_LABELS,
} from "@/lib/validations/clientsDocument.schema";
import {
  VAULT_QUICK_DOC_TYPES,
  formatBytes,
  type VaultDocTypeFilter,
  type VaultDocumentRow,
} from "@/lib/documentVault/config";

import { useVaultQuery } from "./useVaultQuery";

/** "all" is the Select's stand-in for the empty filter, since "" is not a valid item value. */
const ALL_TYPES = "all";

export default function VaultTable() {
  const t = useVaultQuery();
  const invalidate = t.invalidate;

  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [isPending, setIsPending] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<VaultDocumentRow | null>(null);

  const chosen = selectedIds(selection);

  const handleSingleDelete = async () => {
    if (!toDelete) return;
    setIsPending(true);
    try {
      const result = await deleteKycDocumentAction(toDelete.id);
      if (result.success) {
        toast.success("Document deleted.");
        setToDelete(null);
        invalidate();
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsPending(false);
    }
  };

  const handleBulkDelete = async () => {
    setIsPending(true);
    try {
      // deleteKycDocumentAction handles one document at a time, because each one
      // also has to be removed from UploadThing.
      const results = await Promise.all(
        chosen.map((id) => deleteKycDocumentAction(id)),
      );
      const failed = results.filter((r) => !r.success).length;

      if (failed === 0) {
        toast.success(
          `${chosen.length} document${chosen.length !== 1 ? "s" : ""} deleted`,
        );
      } else {
        toast.error(
          `${failed} deletion${failed !== 1 ? "s" : ""} failed. Please try again.`,
        );
      }
      // Some may have succeeded even when others failed, so always refetch.
      setSelection({});
      invalidate();
    } finally {
      setIsPending(false);
    }
  };

  const columns = React.useMemo<ColumnDef<VaultDocumentRow>[]>(
    () => [
      selectionColumn<VaultDocumentRow>((row) => row.label),
      {
        accessorKey: "label",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Document" />
        ),
        cell: ({ row }) => (
          <div className="max-w-[220px]">
            <Link
              href={row.original.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium leading-tight hover:underline"
            >
              {row.original.label}
            </Link>
            {row.original.description && (
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {row.original.description}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "docType",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Type" />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary" className="text-[11px] font-normal">
            {KYC_DOC_TYPE_LABELS[row.original.docType]}
          </Badge>
        ),
      },
      {
        accessorKey: "clientName",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Client" />
        ),
        cell: ({ row }) => (
          <div className="max-w-[180px]">
            <Link
              href={`/clients/${row.original.client.id}`}
              className="group flex items-center gap-1.5"
            >
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="block truncate text-sm group-hover:underline">
                {row.original.client.companyName}
              </span>
            </Link>
            {row.original.client.contactName && (
              <span className="mt-0.5 block truncate pl-5 text-[11px] text-muted-foreground">
                {row.original.client.contactName}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "fileName",
        enableSorting: false,
        header: () => <span className="text-xs">File</span>,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            {row.original.mimeType.startsWith("image/") ? (
              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="block max-w-[140px] truncate">
              {row.original.fileName}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "fileSize",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Size" />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
            {formatBytes(row.original.fileSize)}
          </span>
        ),
      },
      {
        accessorKey: "uploadedAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Uploaded" />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDate(row.original.uploadedAt)}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => setToDelete(row.original)}
              aria-label={`Delete ${row.original.label}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const total = t.data?.total ?? 0;

  const toolbar =
    chosen.length > 0 ? (
      <DataTableBulkBar
        count={chosen.length}
        noun="document"
        isPending={isPending}
        onDelete={handleBulkDelete}
        onClear={() => setSelection({})}
      />
    ) : (
      <DataTableToolbar
        search={t.searchInput}
        onSearchChange={t.setSearchInput}
        searchPlaceholder="Search documents, clients, GST, IEC, PAN..."
        isFetching={t.isFetching && !t.isFirstLoad}
        resultLabel={
          t.data
            ? `${total.toLocaleString()} document${total !== 1 ? "s" : ""}`
            : null
        }
      >
        <Select
          value={t.docType || ALL_TYPES}
          onValueChange={(value) =>
            t.setDocType(value === ALL_TYPES ? "" : (value as VaultDocTypeFilter))
          }
        >
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>All types</SelectItem>
            {KYC_DOC_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {KYC_DOC_TYPE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-wrap gap-1.5">
          {VAULT_QUICK_DOC_TYPES.map((chip) => (
            <Button
              key={chip.value}
              variant={t.docType === chip.value ? "default" : "outline"}
              size="sm"
              className="h-9"
              aria-pressed={t.docType === chip.value}
              onClick={() => t.toggleDocType(chip.value)}
            >
              {chip.label}
            </Button>
          ))}
        </div>
      </DataTableToolbar>
    );

  const deleteDialog = (
    <AlertDialog
      open={toDelete !== null}
      onOpenChange={(open) => !open && setToDelete(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete document?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{toDelete?.label}</strong> will be permanently deleted from
            the vault and from storage. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSingleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // First load has nothing to keep on screen, so show the shape of the table.
  // Every later fetch reuses the rows already rendered.
  if (t.isFirstLoad) {
    return (
      <div className="space-y-4">
        {toolbar}
        <DataTableSkeleton columns={columns.length} rows={8} />
      </div>
    );
  }

  if (t.error) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="rounded-md border">
          <DataTableErrorState
            message="Could not load your documents. Please try again."
            onRetry={() => t.refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={t.data?.rows ?? []}
        // The server's echoed page, not the URL's: it clamps a stale ?page= to
        // the last page that actually exists, and the controls should agree with
        // the rows on screen.
        page={t.data?.page ?? t.page}
        pageSize={t.pageSize}
        totalRows={total}
        pageCount={t.data?.pageCount ?? 1}
        onPageChange={t.setPage}
        onPageSizeChange={t.setPageSize}
        sorting={t.sorting}
        onSortingChange={t.setSorting}
        isLoading={t.isFetching}
        toolbar={toolbar}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        getRowId={(row) => row.id}
        emptyState={
          <DataTableEmptyState
            filtered={t.isFiltered}
            emptyText="No client documents uploaded yet."
            filteredText="No documents match your filters."
            onReset={t.clearFilters}
          />
        }
      />
      {deleteDialog}
    </>
  );
}
