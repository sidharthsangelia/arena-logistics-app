"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
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
import { Skeleton } from "@/components/ui/skeleton";
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
  DEFAULT_INVOICE_PAGE_SIZE,
  INVOICE_KIND_FILTERS,
  invoiceDownloadHref,
  type InvoiceFeedPage,
  type InvoiceFeedRow,
  type InvoiceKind,
  type InvoiceKindFilter,
  type InvoiceStatusFilter,
} from "@/lib/invoices/config";

import { InvoiceViewStatusBadge } from "./InvoiceStatusBadge";
import { InvoiceSummaryCards } from "./InvoiceSummaryCards";
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
 *
 * Loading is per-cell, not per-page. Everything on this screen that is fixed by
 * the design rather than by the data — the tile labels and icons, the search
 * box, the type switch, the column headings, "Rows per page", the paging arrows
 * — is rendered on the first frame; only the figures and the row cells stand in
 * as skeletons, each sized to the content that replaces it.
 *
 * `skeleton` renders the same panel with a standing-still view in place of the
 * query, which is what the route uses for loading.tsx and its Suspense
 * fallback. One tree serves both states, so there is no lookalike to keep in
 * step and nothing moves when the real data takes over.
 */
export function TenantInvoicesTable({
  initialData,
  skeleton,
}: {
  initialData?: InvoiceFeedPage;
  skeleton?: boolean;
}) {
  return skeleton ? (
    <InvoicesPanel view={IDLE_VIEW} />
  ) : (
    <LiveInvoicesPanel initialData={initialData} />
  );
}

/**
 * Everything the panel reads off the feed. Narrower than the hook's return on
 * purpose: it is also what the idle view has to satisfy, and a placeholder that
 * had to stub `refetch` would be inventing behaviour it does not have.
 */
interface InvoiceFeedView {
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  sorting: SortingState;
  setSorting: (sorting: SortingState) => void;
  status: InvoiceStatusFilter;
  setStatus: (status: InvoiceStatusFilter) => void;
  kind: InvoiceKindFilter;
  setKind: (kind: InvoiceKindFilter) => void;
  searchInput: string;
  onSearchChange: (value: string) => void;
  reset: () => void;
  filtered: boolean;
  isFirstLoad: boolean;
  isFetching: boolean;
  data: InvoiceFeedPage | undefined;
}

const noop = () => {};

/**
 * The skeleton's stand-in for the feed. It deliberately does NOT run the query
 * hook: a disabled useQuery still registers its key in the cache, and the entry
 * it leaves behind would make react-query ignore the `initialData` the server
 * fetched — the fallback would cost us the very handover it is standing in for.
 */
const IDLE_VIEW: InvoiceFeedView = {
  page: 1,
  setPage: noop,
  pageSize: DEFAULT_INVOICE_PAGE_SIZE,
  setPageSize: noop,
  sorting: [{ id: "issueDate", desc: true }],
  setSorting: noop,
  status: "ALL",
  setStatus: noop,
  kind: "ALL",
  setKind: noop,
  searchInput: "",
  onSearchChange: noop,
  reset: noop,
  filtered: false,
  isFirstLoad: true,
  isFetching: false,
  data: undefined,
};

function LiveInvoicesPanel({ initialData }: { initialData?: InvoiceFeedPage }) {
  const view = useInvoiceFeedQuery({
    fetcher: listOrgInvoiceFeedAction,
    initialData,
  });

  return <InvoicesPanel view={view} />;
}

function InvoicesPanel({ view: t }: { view: InvoiceFeedView }) {
  const columns = React.useMemo<ColumnDef<InvoiceFeedRow>[]>(
    () => [
      {
        accessorKey: "invoiceNumber",
        enableSorting: false,
        header: () => <span className="text-xs">Invoice</span>,
        cell: ({ row }) => <InvoiceNumberCell row={row.original} />,
        meta: { skeleton: <Skeleton className="h-5 w-28" /> },
      },
      {
        accessorKey: "kind",
        enableSorting: false,
        header: () => <span className="text-xs">Type</span>,
        cell: ({ row }) => <KindTag row={row.original} />,
        // Badge-shaped, or the column starts narrow and widens on arrival.
        meta: { skeleton: <Skeleton className="h-5 w-24 rounded-full" /> },
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
        meta: { skeleton: <Skeleton className="h-5 w-24" /> },
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
        meta: { skeleton: <Skeleton className="h-5 w-20" /> },
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
        meta: { skeleton: <Skeleton className="h-5 w-24" /> },
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
        meta: { skeleton: <Skeleton className="h-5 w-24" /> },
      },
      {
        accessorKey: "status",
        enableSorting: false,
        header: () => <span className="text-xs">Status</span>,
        cell: ({ row }) => <InvoiceViewStatusBadge view={row.original.status} />,
        meta: { skeleton: <Skeleton className="h-5 w-20 rounded-full" /> },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <RowActions row={row.original} />,
        // The icon button is the tallest thing in a row and therefore sets the
        // row height. Matching it here is what keeps the rows from shrinking.
        meta: {
          skeleton: (
            <div className="flex items-center justify-end">
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          ),
        },
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
          disabled={t.isFirstLoad}
          leading={
            <KindSwitch
              value={t.kind}
              onChange={t.setKind}
              counts={t.data?.kindCounts}
              disabled={t.isFirstLoad}
            />
          }
        />

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
          isFirstLoad={t.isFirstLoad}
          skeletonRows={t.pageSize > 10 ? 10 : t.pageSize}
          emptyState={
            <InvoiceEmptyState filtered={t.filtered} onReset={t.reset} />
          }
        />
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
  InvoiceKind | "CREDIT_NOTE",
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
    hint: "Reverses part or all of an invoice.",
  },
  MANUAL: {
    label: "Services",
    icon: Receipt,
    hint: "Tax invoice for work arranged with us directly.",
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
  // Raised by hand for work arranged off the platform. "Services" rather than
  // "Manual", which describes how Arena made it and means nothing to the person
  // being billed.
  MANUAL: "Services",
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
  disabled,
}: {
  value: InvoiceKindFilter;
  onChange: (next: InvoiceKindFilter) => void;
  counts?: Record<InvoiceKind, number>;
  disabled?: boolean;
}) {
  const countFor = (kind: InvoiceKindFilter) => {
    if (!counts) return null;
    if (kind === "ALL") return counts.BOOKING + counts.ACCOUNT + counts.MANUAL;
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
            disabled={disabled}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors",
              selected
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
              disabled && "cursor-default",
            )}
          >
            {/* The label is fixed; only its tally waits, and it waits in a box
                the same width, so the switch does not grow underneath a
                pointer that is already on it. */}
            {KIND_LABEL[kind]}
            {count === null ? (
              <Skeleton className="h-3 w-4" />
            ) : (
              <span className="tabular-nums text-muted-foreground">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
