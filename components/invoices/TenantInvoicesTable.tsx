"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpRight,
  Download,
  FileText,
  Loader2,
  Receipt,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableColumnHeader } from "@/components/data-table/DataTableColumnHeader";
import { listOrgInvoiceFeedAction } from "@/actions/invoices/invoices.action";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/utils/format";
import {
  INVOICE_KIND_FILTERS,
  invoiceDownloadHref,
  type InvoiceFeedPage,
  type InvoiceFeedRow,
  type InvoiceKindFilter,
} from "@/lib/invoices/config";

import { InvoiceViewStatusBadge } from "./InvoiceStatusBadge";
import { InvoiceSummaryCards } from "./InvoiceSummaryCards";
import { InvoicesTableSkeleton } from "./InvoicesTableSkeleton";
import { InvoiceEmptyState, InvoiceToolbar } from "./InvoiceToolbar";
import { useInvoiceFeedQuery } from "./useInvoiceFeedQuery";

/**
 * Everything Arena has billed this org, in one table.
 *
 * Booking invoices (one per shipment, issued automatically) and account bills
 * (raised by hand) used to sit in two stacked tables. They are different
 * documents, but the customer's question is the same for both — what am I
 * being charged, is it paid, where is the PDF — so they share a list, and the
 * difference shows as a tag and a filter rather than as a second table with
 * its own header, its own empty state and its own place to look.
 *
 * Read-only. Everything about an invoice is controlled by Arena; the customer
 * opens it, downloads it, or finds it.
 */
export function TenantInvoicesTable({
  initialData,
}: {
  initialData?: InvoiceFeedPage;
}) {
  const t = useInvoiceFeedQuery({
    fetcher: listOrgInvoiceFeedAction,
    initialData,
  });

  const columns = React.useMemo<ColumnDef<InvoiceFeedRow>[]>(
    () => [
      {
        accessorKey: "invoiceNumber",
        enableSorting: false,
        header: () => <span className="text-xs">Invoice</span>,
        cell: ({ row }) => <InvoiceNumberCell row={row.original} />,
      },
      {
        accessorKey: "kind",
        enableSorting: false,
        header: () => <span className="text-xs">Type</span>,
        cell: ({ row }) => <KindTag row={row.original} />,
      },
      {
        accessorKey: "shipmentNumber",
        enableSorting: false,
        header: () => <span className="text-xs">Shipment</span>,
        cell: ({ row }) =>
          row.original.shipmentNumber ? (
            row.original.shipmentId ? (
              <Link
                href={`/shipments/${row.original.shipmentId}`}
                className="tabular-nums text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {row.original.shipmentNumber}
              </Link>
            ) : (
              <span className="tabular-nums text-muted-foreground">
                {row.original.shipmentNumber}
              </span>
            )
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
        enableSorting: false,
        header: () => <span className="text-xs">Due</span>,
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
        enableSorting: false,
        header: () => <span className="text-xs">Status</span>,
        cell: ({ row }) => <InvoiceViewStatusBadge view={row.original.status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <RowActions row={row.original} />,
      },
    ],
    [],
  );

  const rows = t.data?.rows ?? [];

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
          leading={
            <KindSwitch
              value={t.kind}
              onChange={t.setKind}
              counts={t.data?.kindCounts}
            />
          }
        />

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
              <InvoiceEmptyState filtered={t.filtered} onReset={t.reset} />
            }
          />
        )}
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/**
 * The invoice number IS the link to the document, opened in a new tab so the
 * list you were reading is still there behind it.
 *
 * A booking invoice is numbered and rendered by a background job, so for about
 * a minute after a booking there is genuinely nothing to link to. Saying
 * "Preparing" beats a dead link or an empty cell that reads as a lost document.
 */
function InvoiceNumberCell({ row }: { row: InvoiceFeedRow }) {
  if (row.preparing || !row.fileUrl) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {row.invoiceNumber ?? "Preparing"}
      </span>
    );
  }

  return (
    <a
      href={row.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1 font-medium tabular-nums underline-offset-4 hover:underline focus-visible:outline-1 focus-visible:outline-ring"
    >
      {row.invoiceNumber}
      <ArrowUpRight
        className="h-3.5 w-3.5 text-muted-foreground transition-opacity group-hover:opacity-100 sm:opacity-0"
        aria-hidden
      />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

const KIND_TAG: Record<
  "BOOKING" | "CREDIT_NOTE" | "ACCOUNT",
  { label: string; icon: React.ElementType; hint: string }
> = {
  BOOKING: {
    label: "Booking",
    icon: FileText,
    hint: "Tax invoice raised automatically for a shipment.",
  },
  CREDIT_NOTE: {
    label: "Credit note",
    icon: RotateCcw,
    hint: "Reverses part or all of a booking invoice.",
  },
  ACCOUNT: {
    label: "Account bill",
    icon: Receipt,
    hint: "Raised by Arena to your account directly.",
  },
};

/**
 * Which document this is. Deliberately colourless: colour on this table means
 * something is owed or overdue, and the kind of a document is not that.
 */
function KindTag({ row }: { row: InvoiceFeedRow }) {
  const key = row.isCreditNote ? "CREDIT_NOTE" : row.kind;
  const cfg = KIND_TAG[key];
  const Icon = cfg.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="gap-1 whitespace-nowrap font-medium text-muted-foreground"
        >
          <Icon className="h-3 w-3" aria-hidden />
          {cfg.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{cfg.hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Download, and only download. Opening the invoice is the number's job — a
 * second button for it would be the same click twice.
 *
 * The href is our own route rather than the storage URL, because a
 * cross-origin `download` is ignored and the browser would show the PDF
 * instead of saving it. See invoiceDownloadHref.
 */
function RowActions({ row }: { row: InvoiceFeedRow }) {
  const ready = !row.preparing && !!row.fileUrl;

  return (
    <div className="flex items-center justify-end">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", !ready && "pointer-events-none opacity-40")}
            asChild={ready}
            disabled={!ready}
            aria-label="Download invoice"
          >
            {ready ? (
              <a
                href={invoiceDownloadHref(row)}
                download={row.fileName ?? undefined}
              >
                <Download className="h-4 w-4" />
              </a>
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {ready ? "Download" : "Still being prepared"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kind switch
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<InvoiceKindFilter, string> = {
  ALL: "All",
  BOOKING: "Booking",
  ACCOUNT: "Account",
};

/**
 * The one control that replaces the old second table. Counts come from the
 * current status filter and search, so the split you see is the split you get.
 */
function KindSwitch({
  value,
  onChange,
  counts,
}: {
  value: InvoiceKindFilter;
  onChange: (next: InvoiceKindFilter) => void;
  counts?: Record<"BOOKING" | "ACCOUNT", number>;
}) {
  const countFor = (kind: InvoiceKindFilter) => {
    if (!counts) return null;
    if (kind === "ALL") return counts.BOOKING + counts.ACCOUNT;
    return counts[kind];
  };

  return (
    <div
      role="radiogroup"
      aria-label="Document type"
      className="flex h-9 items-center rounded-md border p-0.5"
    >
      {INVOICE_KIND_FILTERS.map((kind) => {
        const selected = kind === value;
        const count = countFor(kind);
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(kind)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors",
              selected
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {KIND_LABEL[kind]}
            {count !== null && (
              <span className="tabular-nums text-muted-foreground">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
