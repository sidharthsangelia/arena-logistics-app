"use client";

/**
 * components/quotes/AdminQuotesTable.tsx
 *
 * Every tenant's quotes in one table, for Arena ops. Server-paginated, sorted
 * and filtered on the server; the client only ever holds one page.
 */

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, FileWarning } from "lucide-react";

import { DataTable } from "@/components/data-table/DataTable";
import { DataTableColumnHeader } from "@/components/data-table/DataTableColumnHeader";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";
import {
  DataTableEmptyState,
  DataTableErrorState,
  DataTableToolbar,
} from "@/components/data-table/DataTableToolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatMoney } from "@/utils/format";
import {
  QUOTE_STATUS_FILTERS,
  QUOTE_STATUS_FILTER_LABELS,
  type AdminQuoteRow,
  type QuoteStatusFilter,
} from "@/lib/quotes/config";

import QuoteStatusBadge from "./QuotesStatusBadge";
import { EmailEventBadge } from "./EmailEventBadge";
import { useAdminQuotesQuery } from "./useAdminQuotesQuery";

const COLUMN_COUNT = 10;

export default function AdminQuotesTable() {
  const t = useAdminQuotesQuery();

  const columns = React.useMemo<ColumnDef<AdminQuoteRow>[]>(
    () => [
      {
        accessorKey: "quoteNumber",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Quote" />
        ),
        cell: ({ row }) =>
          row.original.pdfUrl ? (
            <Link
              href={row.original.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium tabular-nums hover:underline"
            >
              {row.original.quoteNumber}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              {row.original.quoteNumber}
              <FileWarning
                className="h-3.5 w-3.5 shrink-0"
                aria-label="No PDF generated"
              />
            </span>
          ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => <QuoteStatusBadge status={row.original.status} />,
      },
      {
        id: "email",
        enableSorting: false,
        header: () => <span className="text-xs">Email</span>,
        cell: ({ row }) => <EmailEventBadge event={row.original.lastEmailEvent} />,
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
              {row.original.client?.companyName ?? "Unassigned"}
            </span>
            {row.original.client?.contactName && (
              <span className="block truncate text-[11px] text-muted-foreground">
                {row.original.client.contactName}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "vendorName",
        enableSorting: false,
        header: () => <span className="text-xs">Vendor</span>,
        cell: ({ row }) => (
          <span className="block max-w-[130px] truncate text-sm text-muted-foreground">
            {row.original.vendorName}
          </span>
        ),
      },
      {
        accessorKey: "productName",
        enableSorting: false,
        header: () => <span className="text-xs">Product</span>,
        cell: ({ row }) => (
          <span className="block max-w-[130px] truncate text-sm">
            {row.original.productName}
          </span>
        ),
      },
      {
        accessorKey: "quotedTotal",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Total" />
        ),
        cell: ({ row }) => (
          <span className="block text-right text-sm font-medium tabular-nums">
            {formatMoney(row.original.quotedTotal, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "validUntil",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Valid until" />
        ),
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <span className="block text-sm">
              {formatDate(row.original.validUntil)}
            </span>
            {row.original.isExpired && (
              <span className="text-[10px] text-destructive">Expired</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDate(row.original.createdAt)}
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
      searchPlaceholder="Search quote, client, vendor or organisation..."
      isFetching={t.isFetching && !t.isFirstLoad}
      resultLabel={
        t.data ? `${total.toLocaleString()} quote${total !== 1 ? "s" : ""}` : null
      }
    >
      <Select
        value={t.status}
        onValueChange={(value) => t.setStatus(value as QuoteStatusFilter)}
      >
        <SelectTrigger className="h-9 w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {QUOTE_STATUS_FILTERS.map((value) => (
            <SelectItem key={value} value={value}>
              {QUOTE_STATUS_FILTER_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
            message="Could not load quotes. You may not have access, or the request failed."
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
          emptyText="No quotes have been generated yet."
          filteredText="No quotes match your filters."
          onReset={t.clearFilters}
        />
      }
    />
  );
}
