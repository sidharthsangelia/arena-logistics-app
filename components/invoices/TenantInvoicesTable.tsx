"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableColumnHeader } from "@/components/data-table/DataTableColumnHeader";
import { listOrgInvoicesAction } from "@/actions/invoices/invoices.action";
import { formatDate, formatMoney } from "@/utils/format";
import type { InvoicePage, InvoiceRow } from "@/lib/invoices/config";

import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { InvoiceSummaryCards } from "./InvoiceSummaryCards";
import { InvoicePreviewDialog } from "./InvoicePreviewDialog";
import { InvoicesTableSkeleton } from "./InvoicesTableSkeleton";
import { InvoiceEmptyState, InvoiceToolbar } from "./InvoiceToolbar";
import { useInvoicesQuery } from "./useInvoicesQuery";

/**
 * The customer's own invoices. Read-only: view the PDF in a modal or download
 * it. Everything (issuing, status) is controlled by Arena.
 *
 * `initialData` is the first page, already fetched on the server by the route.
 * It means the summary cards and the rows are correct on first paint instead of
 * appearing a round trip after hydration.
 */
export function TenantInvoicesTable({
  initialData,
}: {
  initialData?: InvoicePage;
}) {
  const t = useInvoicesQuery({
    queryKey: "org-invoices",
    fetcher: listOrgInvoicesAction,
    initialData,
  });

  const [preview, setPreview] = React.useState<InvoiceRow | null>(null);

  const columns = React.useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
      {
        accessorKey: "invoiceNumber",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Invoice" />
        ),
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {row.original.invoiceNumber}
          </span>
        ),
      },
      {
        accessorKey: "shipmentNumber",
        enableSorting: false,
        header: () => <span className="text-xs">Shipment</span>,
        cell: ({ row }) =>
          row.original.shipmentNumber ? (
            <span className="tabular-nums text-muted-foreground">
              {row.original.shipmentNumber}
            </span>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Amount" />
        ),
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {formatMoney(row.original.amount, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "issueDate",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Issued" />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDate(row.original.issueDate)}
          </span>
        ),
      },
      {
        accessorKey: "dueDate",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Due" />
        ),
        cell: ({ row }) =>
          row.original.dueDate ? (
            <span className="whitespace-nowrap text-muted-foreground">
              {formatDate(row.original.dueDate)}
            </span>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => (
          <InvoiceStatusBadge
            status={row.original.status}
            dueDate={row.original.dueDate}
          />
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPreview(row.original)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View invoice</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <a
                    href={row.original.fileUrl}
                    download={row.original.fileName}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [],
  );

  const rows = t.data?.rows ?? [];
  const filtered = t.status !== "ALL" || t.searchInput.trim().length > 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        <InvoiceSummaryCards summary={t.data?.summary} isLoading={t.isFirstLoad} />

        <InvoiceToolbar
          search={t.searchInput}
          onSearchChange={t.onSearchChange}
          status={t.status}
          onStatusChange={t.setStatus}
          isFetching={t.isFetching && !t.isFirstLoad}
        />

        {t.isFirstLoad ? (
          <InvoicesTableSkeleton columns={7} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            page={t.page}
            pageSize={t.pageSize}
            totalRows={t.data?.total ?? 0}
            pageCount={t.data?.pageCount ?? 1}
            onPageChange={t.setPage}
            onPageSizeChange={t.setPageSize}
            sorting={t.sorting}
            onSortingChange={t.setSorting}
            isLoading={t.isFetching}
            emptyState={
              <InvoiceEmptyState
                filtered={filtered}
                onReset={() => {
                  t.onSearchChange("");
                  t.setStatus("ALL");
                }}
              />
            }
          />
        )}
      </div>

      <InvoicePreviewDialog
        invoice={preview}
        open={preview !== null}
        onOpenChange={(o) => !o && setPreview(null)}
      />
    </TooltipProvider>
  );
}
