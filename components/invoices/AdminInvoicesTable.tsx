"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/data-table/DataTable";
import { DataTableColumnHeader } from "@/components/data-table/DataTableColumnHeader";
import { listAllInvoicesAction } from "@/actions/invoices/invoices.action";
import { formatDate, formatMoney } from "@/utils/format";
import type { InvoiceRow } from "@/lib/invoices/config";

import { AsyncCombobox, type ComboOption } from "./AsyncCombobox";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { InvoiceSummaryCards } from "./InvoiceSummaryCards";
import { InvoicePreviewDialog } from "./InvoicePreviewDialog";
import { InvoicesTableSkeleton } from "./InvoicesTableSkeleton";
import { InvoiceEmptyState, InvoiceToolbar } from "./InvoiceToolbar";
import { NewInvoiceSheet } from "./NewInvoiceSheet";
import { EditInvoiceDialog } from "./EditInvoiceDialog";
import { AdminInvoiceRowActions } from "./AdminInvoiceRowActions";
import { useInvoicesQuery } from "./useInvoicesQuery";
import { listInvoiceOrgsAction } from "@/actions/invoices/invoices.action";

const QUERY_KEY = "all-invoices";

/**
 * The Arena admin's control surface: every org's invoices, filterable by org,
 * status and search, with issue / edit / mark-paid / void / delete inline. Money
 * data, so the whole route and every action are admin-gated.
 */
export function AdminInvoicesTable() {
  const qc = useQueryClient();
  const [orgFilter, setOrgFilter] = React.useState<ComboOption | null>(null);

  const t = useInvoicesQuery({
    queryKey: QUERY_KEY,
    fetcher: listAllInvoicesAction,
    orgId: orgFilter?.id ?? null,
  });

  const [preview, setPreview] = React.useState<InvoiceRow | null>(null);
  const [editing, setEditing] = React.useState<InvoiceRow | null>(null);

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: [QUERY_KEY] });
  }, [qc]);

  const columns = React.useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
      {
        accessorKey: "invoiceNumber",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Invoice" />
        ),
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setPreview(row.original)}
            className="font-medium tabular-nums hover:underline"
          >
            {row.original.invoiceNumber}
          </button>
        ),
      },
      {
        accessorKey: "orgName",
        enableSorting: false,
        header: () => <span className="text-xs">Organisation</span>,
        cell: ({ row }) => (
          <span className="max-w-[180px] truncate">{row.original.orgName}</span>
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
            <span className="text-muted-foreground/60">Standalone</span>
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
          <div className="flex justify-end">
            <AdminInvoiceRowActions
              invoice={row.original}
              onView={setPreview}
              onEdit={setEditing}
              onChanged={invalidate}
            />
          </div>
        ),
      },
    ],
    [invalidate],
  );

  const rows = t.data?.rows ?? [];
  const filtered =
    t.status !== "ALL" || t.searchInput.trim().length > 0 || orgFilter !== null;

  return (
    <div className="space-y-5">
      <InvoiceSummaryCards summary={t.data?.summary} isLoading={t.isFirstLoad} />

      <InvoiceToolbar
        search={t.searchInput}
        onSearchChange={t.onSearchChange}
        searchPlaceholder="Search invoice, org or shipment…"
        status={t.status}
        onStatusChange={t.setStatus}
        isFetching={t.isFetching && !t.isFirstLoad}
      >
        <div className="w-[200px]">
          <AsyncCombobox
            value={orgFilter}
            onChange={setOrgFilter}
            allowClear
            clearLabel="All organisations"
            fetcher={async (q) => listInvoiceOrgsAction(q)}
            placeholder="All organisations"
            emptyText="No organisations found."
          />
        </div>
        <NewInvoiceSheet onCreated={invalidate} />
      </InvoiceToolbar>

      {t.isFirstLoad ? (
        <InvoicesTableSkeleton columns={8} />
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
                setOrgFilter(null);
              }}
            />
          }
        />
      )}

      <InvoicePreviewDialog
        invoice={preview}
        open={preview !== null}
        onOpenChange={(o) => !o && setPreview(null)}
      />
      <EditInvoiceDialog
        invoice={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={invalidate}
      />
    </div>
  );
}
