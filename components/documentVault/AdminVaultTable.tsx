"use client";

/**
 * components/documentVault/AdminVaultTable.tsx
 *
 * Every business associate's KYC and compliance paperwork in one table, for
 * Arena ops. Server-paginated, sorted and filtered on the server; the client only
 * ever holds one page.
 */

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, FileText, ImageIcon } from "lucide-react";

import { DataTable } from "@/components/data-table/DataTable";
import { DataTableColumnHeader } from "@/components/data-table/DataTableColumnHeader";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";
import {
  DataTableEmptyState,
  DataTableErrorState,
  DataTableToolbar,
} from "@/components/data-table/DataTableToolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/utils/format";
import {
  KYC_DOC_TYPES,
  KYC_DOC_TYPE_LABELS,
} from "@/lib/validations/clientsDocument.schema";
import {
  VAULT_QUICK_DOC_TYPES,
  formatBytes,
  type AdminVaultDocumentRow,
  type VaultDocTypeFilter,
} from "@/lib/documentVault/config";

import { useAdminVaultQuery } from "./useAdminVaultQuery";

const COLUMN_COUNT = 7;

/** "all" is the Select's stand-in for the empty filter, since "" is not a valid item value. */
const ALL_TYPES = "all";

export default function AdminVaultTable() {
  const t = useAdminVaultQuery();

  const columns = React.useMemo<ColumnDef<AdminVaultDocumentRow>[]>(
    () => [
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
        accessorKey: "orgName",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Organisation" />
        ),
        cell: ({ row }) => (
          <Link
            href={`/arena-dashboard/accounts/${row.original.org.id}`}
            className="group flex items-center gap-1.5"
          >
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="block max-w-[160px] truncate text-sm group-hover:underline">
              {row.original.org.name}
            </span>
          </Link>
        ),
      },
      {
        accessorKey: "clientName",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Client" />
        ),
        cell: ({ row }) => (
          <div className="max-w-[160px]">
            <span className="block truncate text-sm">
              {row.original.client.companyName}
            </span>
            {row.original.client.contactName && (
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
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
    ],
    [],
  );

  const total = t.data?.total ?? 0;

  const toolbar = (
    <DataTableToolbar
      search={t.searchInput}
      onSearchChange={t.setSearchInput}
      searchPlaceholder="Search document, file, client or organisation..."
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

  // First load has nothing to keep on screen, so show the shape of the table.
  // Every later fetch reuses the rows already rendered.
  if (t.isFirstLoad) {
    return (
      <div className="space-y-4">
        {toolbar}
        <DataTableSkeleton columns={COLUMN_COUNT} rows={10} />
      </div>
    );
  }

  if (t.error) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="rounded-md border">
          <DataTableErrorState
            message="Could not load documents. You may not have access, or the request failed."
            onRetry={() => t.refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={t.data?.rows ?? []}
      // The server's echoed page, not the URL's: it clamps a stale ?page= to the
      // last page that actually exists, and the controls should agree with the
      // rows on screen.
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
      emptyState={
        <DataTableEmptyState
          filtered={t.isFiltered}
          emptyText="No documents have been uploaded yet."
          filteredText="No documents match your filters."
          onReset={t.clearFilters}
        />
      }
    />
  );
}
