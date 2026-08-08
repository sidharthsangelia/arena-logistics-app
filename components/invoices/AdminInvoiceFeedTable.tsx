"use client";

/**
 * Every invoice Arena has raised, in one table.
 *
 * Booking invoices, manual invoices and uploaded bills used to be a panel and
 * two tabs, which meant knowing which of the three a document was before you
 * could go looking for it. They are one list now: the kind is a tag and a
 * filter, the state is a badge, and the search box spans all three. See
 * lib/invoices/admin/config.ts for the reasoning and lib/invoices/admin/feed.ts
 * for how three tables become one page of rows.
 *
 * react-query with a 15s staleTime and kept-previous-data, so filtering
 * something you have already looked at is instant and paging never flashes an
 * empty table.
 */

import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  ArrowUpRight,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MoreHorizontal,
  Plus,
  Receipt,
  RotateCcw,
  RotateCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableColumnHeader } from "@/components/data-table/DataTableColumnHeader";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { formatDate } from "@/utils/format";
// The invoice-money formatter rather than the dashboard one: these rows have to
// match the figure printed on the PDF, and utils/format rounds to whole rupees.
import { formatMoney } from "@/lib/invoices/manual/config";
import {
  ADMIN_INVOICE_KIND_FILTERS,
  ADMIN_INVOICE_KIND_TAG,
  ADMIN_INVOICE_STATUS_FILTERS,
  ADMIN_INVOICE_STATUS_LABELS,
  ADMIN_INVOICE_STATUS_TONE,
  DEFAULT_INVOICE_PAGE_SIZE,
  coerceAdminInvoiceSortField,
  type AdminInvoiceFeedParams,
  type AdminInvoiceKind,
  type AdminInvoiceKindFilter,
  type AdminInvoicePage,
  type AdminInvoiceRow,
  type AdminInvoiceStatusFilter,
} from "@/lib/invoices/admin/config";
import type { InvoiceRow } from "@/lib/invoices/config";
import {
  listAdminInvoiceFeedAction,
  listInvoiceOrgsAction,
} from "@/actions/invoices/invoices.action";
import { retryTaxInvoiceAction } from "@/actions/invoices/taxInvoices.action";

import { AsyncCombobox, type ComboOption } from "./AsyncCombobox";
import { AdminInvoiceRowActions } from "./AdminInvoiceRowActions";
import { EditInvoiceDialog } from "./EditInvoiceDialog";
import { InvoicePreviewDialog } from "./InvoicePreviewDialog";
import { InvoiceSummaryCards } from "./InvoiceSummaryCards";
import { InvoicesTableSkeleton } from "./InvoicesTableSkeleton";
import { NewInvoiceSheet } from "./NewInvoiceSheet";
import { ManualInvoiceRowActions } from "./manual/ManualInvoiceRowActions";

const QUERY_KEY = "admin-invoice-feed";

export function AdminInvoiceFeedTable({
  initialData,
}: {
  initialData?: AdminInvoicePage;
}) {
  const qc = useQueryClient();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSizeRaw] = React.useState<number>(
    DEFAULT_INVOICE_PAGE_SIZE,
  );
  const [sorting, setSortingRaw] = React.useState<SortingState>([
    { id: "issueDate", desc: true },
  ]);
  const [status, setStatusRaw] =
    React.useState<AdminInvoiceStatusFilter>("ALL");
  const [kind, setKindRaw] = React.useState<AdminInvoiceKindFilter>("ALL");
  const [org, setOrgRaw] = React.useState<ComboOption | null>(null);
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebounce(searchInput.trim(), 350);

  const [preview, setPreview] = React.useState<InvoiceRow | null>(null);
  const [editing, setEditing] = React.useState<InvoiceRow | null>(null);

  const sortField = coerceAdminInvoiceSortField(sorting[0]?.id);
  const sortDir: "asc" | "desc" = sorting[0]?.desc === false ? "asc" : "desc";

  const params: AdminInvoiceFeedParams = {
    page,
    pageSize,
    sortField,
    sortDir,
    statusFilter: status,
    kindFilter: kind,
    orgId: org?.id ?? null,
    search: search || undefined,
  };

  // The server rendered exactly one view: the untouched default. Seeding any
  // other query key with those rows would be showing the wrong result set.
  const isDefaultView =
    page === 1 &&
    pageSize === DEFAULT_INVOICE_PAGE_SIZE &&
    status === "ALL" &&
    kind === "ALL" &&
    org === null &&
    search === "" &&
    sortField === "issueDate" &&
    sortDir === "desc";

  const query = useQuery({
    queryKey: [QUERY_KEY, params],
    queryFn: () => listAdminInvoiceFeedAction(params),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    initialData: isDefaultView ? initialData : undefined,
  });

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: [QUERY_KEY] });
  }, [qc]);

  // Anything that changes the result set returns to page one, so you are never
  // stranded on a page number the new set does not have.
  const setStatus = React.useCallback((next: AdminInvoiceStatusFilter) => {
    setStatusRaw(next);
    setPage(1);
  }, []);
  const setKind = React.useCallback((next: AdminInvoiceKindFilter) => {
    setKindRaw(next);
    setPage(1);
  }, []);
  const setOrg = React.useCallback((next: ComboOption | null) => {
    setOrgRaw(next);
    setPage(1);
  }, []);
  const setPageSize = React.useCallback((next: number) => {
    setPageSizeRaw(next);
    setPage(1);
  }, []);
  const setSorting = React.useCallback((next: SortingState) => {
    setSortingRaw(next);
    setPage(1);
  }, []);
  const onSearchChange = React.useCallback((next: string) => {
    setSearchInput(next);
    setPage(1);
  }, []);

  const reset = React.useCallback(() => {
    setSearchInput("");
    setStatusRaw("ALL");
    setKindRaw("ALL");
    setOrgRaw(null);
    setPage(1);
  }, []);

  const columns = React.useMemo<ColumnDef<AdminInvoiceRow>[]>(
    () => [
      {
        accessorKey: "invoiceNumber",
        enableSorting: false,
        header: () => <span className="text-xs">Invoice</span>,
        cell: ({ row }) => (
          <NumberCell row={row.original} onPreview={setPreview} />
        ),
      },
      {
        accessorKey: "kind",
        enableSorting: false,
        header: () => <span className="text-xs">Type</span>,
        cell: ({ row }) => <KindTag row={row.original} />,
      },
      {
        accessorKey: "customerName",
        enableSorting: false,
        header: () => <span className="text-xs">Customer</span>,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-50">
            <p className="truncate">{row.original.customerName}</p>
            {row.original.customerNote ? (
              <p className="truncate text-xs text-muted-foreground">
                {row.original.customerNote}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "reference",
        enableSorting: false,
        header: () => <span className="text-xs">Reference</span>,
        cell: ({ row }) => <ReferenceCell row={row.original} />,
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Amount" />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-medium tabular-nums">
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
          <div className="whitespace-nowrap">
            <p className="text-muted-foreground">
              {formatDate(row.original.issueDate)}
            </p>
            {row.original.dueDate ? (
              <p className="text-xs text-muted-foreground/70">
                Due {formatDate(row.original.dueDate)}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "status",
        enableSorting: false,
        header: () => <span className="text-xs">Status</span>,
        cell: ({ row }) => <StatusCell row={row.original} />,
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RowActions
              row={row.original}
              onPreview={setPreview}
              onEdit={setEditing}
              onChanged={invalidate}
            />
          </div>
        ),
      },
    ],
    [invalidate],
  );

  const data = query.data;
  const filtered =
    status !== "ALL" ||
    kind !== "ALL" ||
    org !== null ||
    searchInput.trim().length > 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        <InvoiceSummaryCards
          summary={data?.summary}
          isLoading={query.isLoading}
        />

        {data?.summary.mixedCurrency ? (
          <p className="text-xs text-muted-foreground">
            Amounts above cover {data.summary.currency} invoices only. Others are
            listed but not summed.
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Number, customer, shipment, AWB or reference"
                className="h-9 pl-8 pr-8"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {query.isFetching && !query.isLoading ? (
                <span className="absolute right-8 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
              ) : null}
            </div>

            <KindSwitch
              value={kind}
              onChange={setKind}
              counts={data?.kindCounts}
            />

            <Select
              value={status}
              onValueChange={(v) => setStatus(v as AdminInvoiceStatusFilter)}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADMIN_INVOICE_STATUS_FILTERS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ADMIN_INVOICE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="w-50">
              <AsyncCombobox
                value={org}
                onChange={setOrg}
                allowClear
                clearLabel="All organisations"
                fetcher={async (q) => listInvoiceOrgsAction(q)}
                placeholder="All organisations"
                emptyText="No organisations found."
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <NewInvoiceSheet onCreated={invalidate} />
              <Button asChild size="sm">
                <Link href="/arena-dashboard/invoices/new">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New invoice
                </Link>
              </Button>
            </div>
          </div>

          {/* Two things that need a person rather than a look. Shown only when
              there are any, and each one IS the filter that isolates them, so
              the count and the list behind it can never disagree. */}
          {data?.summary ? (
            <div className="flex flex-wrap items-center gap-2 empty:hidden">
              {data.summary.attentionCount > 0 ? (
                <QuickFilter
                  active={status === "ATTENTION"}
                  tone="alert"
                  onClick={() =>
                    setStatus(status === "ATTENTION" ? "ALL" : "ATTENTION")
                  }
                >
                  {data.summary.attentionCount} need
                  {data.summary.attentionCount === 1 ? "s" : ""} attention
                </QuickFilter>
              ) : null}
              {data.summary.draftCount > 0 ? (
                <QuickFilter
                  active={status === "DRAFT"}
                  onClick={() =>
                    setStatus(status === "DRAFT" ? "ALL" : "DRAFT")
                  }
                >
                  {data.summary.draftCount} draft
                  {data.summary.draftCount === 1 ? "" : "s"}
                </QuickFilter>
              ) : null}
            </div>
          ) : null}
        </div>

        {query.isLoading ? (
          <InvoicesTableSkeleton columns={8} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.rows ?? []}
            page={page}
            pageSize={pageSize}
            totalRows={data?.total ?? 0}
            pageCount={data?.pageCount ?? 1}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            sorting={sorting}
            onSortingChange={setSorting}
            isLoading={query.isFetching}
            getRowId={(row) => row.id}
            emptyState={<EmptyState filtered={filtered} onReset={reset} />}
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
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/**
 * The number is the way into the document, and where that goes depends on what
 * the document is: a manual invoice has a page of its own, an uploaded bill is a
 * PDF behind a dialog, and a booking invoice is a PDF a job produced.
 *
 * A booking invoice is numbered and rendered seconds after the booking, so there
 * is genuinely nothing to link to for a moment. Saying so beats a dead link or
 * an empty cell that reads as a lost document.
 */
function NumberCell({
  row,
  onPreview,
}: {
  row: AdminInvoiceRow;
  onPreview: (invoice: InvoiceRow) => void;
}) {
  if (row.kind === "MANUAL") {
    return (
      <Link
        href={`/arena-dashboard/invoices/manual/${row.rawId}`}
        className="font-medium tabular-nums underline-offset-4 hover:underline"
      >
        {row.invoiceNumber ?? (
          <span className="font-normal text-muted-foreground">Not issued</span>
        )}
      </Link>
    );
  }

  if (row.kind === "ACCOUNT") {
    return (
      <button
        type="button"
        onClick={() => row.account && onPreview(row.account)}
        className="font-medium tabular-nums underline-offset-4 hover:underline"
      >
        {row.invoiceNumber}
      </button>
    );
  }

  if (row.status === "PREPARING") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Preparing
      </span>
    );
  }

  if (!row.fileUrl) {
    return (
      <span className="text-sm text-muted-foreground">
        {row.invoiceNumber ?? "Not numbered"}
      </span>
    );
  }

  return (
    <a
      href={row.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1 font-medium tabular-nums underline-offset-4 hover:underline"
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

const KIND_ICON: Record<AdminInvoiceKind, React.ElementType> = {
  BOOKING: FileText,
  MANUAL: Receipt,
  ACCOUNT: Upload,
};

/**
 * Which document this is. Deliberately colourless: colour on this table means
 * something is owed, overdue or broken, and the kind of a document is not that.
 */
function KindTag({ row }: { row: AdminInvoiceRow }) {
  const tag = ADMIN_INVOICE_KIND_TAG[row.kind];
  const Icon = row.isCreditNote ? RotateCcw : KIND_ICON[row.kind];
  const label = row.isCreditNote ? "Credit note" : tag.label;
  const hint = row.isCreditNote
    ? `Reverses part or all of an invoice. ${tag.hint}`
    : tag.hint;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="gap-1 whitespace-nowrap font-medium text-muted-foreground"
        >
          <Icon className="h-3 w-3" aria-hidden />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

/** The shipment a booking or uploaded bill is for, or a manual invoice's AWB. */
function ReferenceCell({ row }: { row: AdminInvoiceRow }) {
  if (row.shipmentNumber) {
    return row.shipmentId ? (
      <Link
        href={`/arena-dashboard/bookings/${row.shipmentId}`}
        className="tabular-nums text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {row.shipmentNumber}
      </Link>
    ) : (
      <span className="tabular-nums text-muted-foreground">
        {row.shipmentNumber}
      </span>
    );
  }

  if (row.kind === "MANUAL" && row.consignmentCount > 0) {
    return (
      <div className="min-w-0 text-sm">
        <p className="truncate tabular-nums">
          {row.awbNumber ?? row.reference ?? "No AWB"}
        </p>
        {row.consignmentCount > 1 ? (
          <p className="text-xs text-muted-foreground">
            and {row.consignmentCount - 1} more
          </p>
        ) : null}
      </div>
    );
  }

  return <span className="text-muted-foreground/60">—</span>;
}

/**
 * The state badge. A failed booking invoice carries its error in the tooltip:
 * that text is the whole reason somebody can act on the row rather than just see
 * that it is red.
 */
function StatusCell({ row }: { row: AdminInvoiceRow }) {
  const tone = ADMIN_INVOICE_STATUS_TONE[row.status];

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("whitespace-nowrap", tone.className)}>
            {tone.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {row.generationError ?? tone.description}
        </TooltipContent>
      </Tooltip>

      {row.lastSentAt ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Mail
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-label="Emailed to the customer"
            />
          </TooltipTrigger>
          <TooltipContent>
            Emailed on {formatDate(row.lastSentAt)}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------

/**
 * Three documents, three menus. Branching once here rather than in every item
 * keeps each menu written against the kind it actually belongs to: manual
 * invoices reuse ManualInvoiceRowActions, uploaded bills reuse
 * AdminInvoiceRowActions, and a booking invoice has almost nothing to offer
 * because nobody edits one.
 */
function RowActions({
  row,
  onPreview,
  onEdit,
  onChanged,
}: {
  row: AdminInvoiceRow;
  onPreview: (invoice: InvoiceRow) => void;
  onEdit: (invoice: InvoiceRow) => void;
  onChanged: () => void;
}) {
  if (row.kind === "MANUAL") {
    return (
      <ManualInvoiceRowActions
        id={row.rawId}
        isDraft={row.status === "DRAFT"}
        isCancelled={row.status === "CANCELLED"}
        isPaid={row.status === "PAID"}
        fileUrl={row.fileUrl}
        lastSentAt={row.lastSentAt}
        onDone={onChanged}
      />
    );
  }

  if (row.kind === "ACCOUNT" && row.account) {
    return (
      <AdminInvoiceRowActions
        invoice={row.account}
        onView={onPreview}
        onEdit={onEdit}
        onChanged={onChanged}
      />
    );
  }

  return <BookingRowActions row={row} onChanged={onChanged} />;
}

/**
 * A booking invoice is issued by a background job and an issued tax document is
 * not something anyone gets to edit, so the only write here is operational:
 * re-drive the job. Safe to press repeatedly, which is why it needs no confirm.
 */
function BookingRowActions({
  row,
  onChanged,
}: {
  row: AdminInvoiceRow;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function retry() {
    if (!row.shipmentId) return;
    setBusy(true);
    try {
      const result = await retryTaxInvoiceAction(row.shipmentId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Queued invoice generation for ${row.shipmentNumber}.`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {row.shipmentId ? (
          <DropdownMenuItem asChild>
            <Link href={`/arena-dashboard/bookings/${row.shipmentId}`}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open the booking
            </Link>
          </DropdownMenuItem>
        ) : null}

        {row.fileUrl ? (
          <DropdownMenuItem asChild>
            <a href={row.fileUrl} target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </a>
          </DropdownMenuItem>
        ) : null}

        {row.status === "ATTENTION" || row.status === "PREPARING" ? (
          <DropdownMenuItem onClick={retry} disabled={busy}>
            <RotateCw className="mr-2 h-4 w-4" />
            Retry generation
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<AdminInvoiceKindFilter, string> = {
  ALL: "All",
  BOOKING: "Booking",
  MANUAL: "Manual",
  ACCOUNT: "Uploaded",
};

/**
 * The control that replaced the tabs. Counts come from the current status
 * filter, org filter and search, so the split you see is the split you get.
 */
function KindSwitch({
  value,
  onChange,
  counts,
}: {
  value: AdminInvoiceKindFilter;
  onChange: (next: AdminInvoiceKindFilter) => void;
  counts?: Record<AdminInvoiceKind, number>;
}) {
  const countFor = (kind: AdminInvoiceKindFilter) => {
    if (!counts) return null;
    if (kind === "ALL") return counts.BOOKING + counts.MANUAL + counts.ACCOUNT;
    return counts[kind];
  };

  return (
    <div
      role="radiogroup"
      aria-label="Document type"
      className="flex h-9 items-center rounded-md border p-0.5"
    >
      {ADMIN_INVOICE_KIND_FILTERS.map((kind) => {
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

function QuickFilter({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone?: "alert";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
        tone === "alert"
          ? "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
          : "text-muted-foreground hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  filtered,
  onReset,
}: {
  filtered: boolean;
  onReset: () => void;
}) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No invoices match these filters.
        </p>
        <Button variant="outline" size="sm" onClick={onReset}>
          Clear filters
        </Button>
      </div>
    );
  }

  return (
    <div className="py-12 text-center">
      <Receipt className="mx-auto h-8 w-8 text-muted-foreground/50" />
      <p className="mt-3 text-sm font-medium">No invoices yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Bookings invoice themselves. Raise one by hand for work that did not go
        through the platform.
      </p>
      <Button asChild className="mt-4">
        <Link href="/arena-dashboard/invoices/new">
          <Plus className="mr-2 h-4 w-4" />
          New invoice
        </Link>
      </Button>
    </div>
  );
}
