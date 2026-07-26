"use client";

/**
 * components/quotes/QuotesTable.tsx
 *
 * A Business Associate's own quotes. Server-paginated, sorted and filtered on
 * the server; the client only ever holds one page.
 *
 * Two things this table has that the Arena one does not: row selection with a
 * bulk delete, and a per-row actions menu (send by email, mark as sent). Both
 * invalidate the react-query cache on success rather than calling
 * router.refresh(), which would have re-rendered the whole route.
 */

import * as React from "react";
import Link from "next/link";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { FileWarning } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bulkDeleteQuotesAction } from "@/actions/quote/quotes.action";
import { useIsArenaOrg } from "@/hooks/useIsArenaOrg";
import { displayServiceName } from "@/lib/branding/serviceName";
import { formatDate, formatMoney } from "@/utils/format";
import {
  QUOTE_STATUS_FILTERS,
  QUOTE_STATUS_FILTER_LABELS,
  type QuoteRow,
  type QuoteStatusFilter,
} from "@/lib/quotes/config";

import QuoteStatusBadge from "./QuotesStatusBadge";
import QuoteActionsMenu from "./QuoteActionsMenu";
import { EmailEventBadge } from "./EmailEventBadge";
import { QuotesExportButton } from "./QuotesExportButton";
import { useQuotesQuery } from "./useQuotesQuery";

export default function QuotesTable() {
  const t = useQuotesQuery();
  // Vendor column is Arena-internal; masked for tenants and BAs.
  const isArena = useIsArenaOrg();

  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Pulled out of `t` so the columns memo can depend on it directly; it is a
  // stable useCallback, so the columns are not rebuilt every render.
  const invalidate = t.invalidate;

  const chosen = selectedIds(selection);

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await bulkDeleteQuotesAction(chosen);
      if (result.success) {
        toast.success(
          `${chosen.length} quote${chosen.length !== 1 ? "s" : ""} deleted`,
        );
        setSelection({});
        invalidate();
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = React.useMemo<ColumnDef<QuoteRow>[]>(() => {
    const cols: ColumnDef<QuoteRow>[] = [
      selectionColumn<QuoteRow>((row) => row.quoteNumber),
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
    ];

    // The sourcing vendor's identity is Arena-internal. See carrierBranding.md.
    if (isArena) {
      cols.push({
        accessorKey: "vendorName",
        enableSorting: false,
        header: () => <span className="text-xs">Vendor</span>,
        cell: ({ row }) => (
          <span className="block max-w-[130px] truncate text-sm text-muted-foreground">
            {row.original.vendorName}
          </span>
        ),
      });
    }

    cols.push(
      {
        accessorKey: "productName",
        enableSorting: false,
        header: () => <span className="text-xs">Product</span>,
        cell: ({ row }) => (
          <span className="block max-w-[130px] truncate text-sm">
            {displayServiceName(row.original.productName, isArena)}
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
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <QuoteActionsMenu
              quote={{
                ...row.original,
                validUntil: row.original.validUntil
                  ? new Date(row.original.validUntil)
                  : null,
              }}
              client={{
                companyName: row.original.client?.companyName ?? "",
                contactName: row.original.client?.contactName ?? null,
                email: null,
              }}
              onChanged={invalidate}
            />
          </div>
        ),
      },
    );

    return cols;
  }, [isArena, invalidate]);

  const total = t.data?.total ?? 0;

  const toolbar =
    chosen.length > 0 ? (
      <DataTableBulkBar
        count={chosen.length}
        noun="quote"
        isPending={isDeleting}
        onDelete={handleBulkDelete}
        onClear={() => setSelection({})}
      />
    ) : (
      <DataTableToolbar
        search={t.searchInput}
        onSearchChange={t.setSearchInput}
        searchPlaceholder="Search quote, client or product..."
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

        <QuotesExportButton />
      </DataTableToolbar>
    );

  // First load has nothing to keep on screen, so show the shape of the table.
  // Every later fetch reuses the rows already rendered.
  if (t.isFirstLoad) {
    return (
      <div className="space-y-4">
        {toolbar}
        <DataTableSkeleton columns={columns.length} rows={10} />
      </div>
    );
  }

  if (t.error) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="rounded-md border">
          <DataTableErrorState
            message="Could not load your quotes. Please try again."
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
      rowSelection={selection}
      onRowSelectionChange={setSelection}
      getRowId={(row) => row.id}
      emptyState={
        <DataTableEmptyState
          filtered={t.isFiltered}
          emptyText="You have not generated any quotes yet."
          filteredText="No quotes match your filters."
          onReset={t.clearFilters}
        />
      }
    />
  );
}
