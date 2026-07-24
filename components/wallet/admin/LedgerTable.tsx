"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Download, ReceiptText, Search, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { DataTableFacetedFilter } from "@/components/data-table/DataTableFacetedFilter";
import { exportWalletTransactionsAction } from "@/actions/wallet/adminWallet.action";
import type { TxnSortField } from "@/lib/wallet/adminConfig";
import type { WalletTxnRow } from "@/lib/wallet/adminLedger";
import type { WalletTxnStatus, WalletTxnType } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney } from "@/utils/format";

/**
 * Every movement in and out of every wallet.
 *
 * This is the screen someone opens when a customer says "I paid you". So the
 * filters are built around what that person has in hand: a date, an amount, a
 * payment reference off an email, or a shipment number off a document. The search
 * box covers all of them at once.
 *
 * The totals in the toolbar cover the whole filtered set rather than the visible
 * page, because a page total on a ledger is worse than no total at all.
 */

const SEARCH_DEBOUNCE_MS = 350;

/** Internal-facing labels. Blunter than the tenant copy on purpose. */
const TYPE_LABELS: Record<WalletTxnType, string> = {
  TOP_UP: "Top-up",
  SHIPMENT_DEBIT: "Booking",
  REFUND: "Refund",
  MANUAL_CREDIT: "Added by hand",
  MANUAL_DEBIT: "Removed by hand",
  ADJUSTMENT: "Adjustment",
};

const STATUS_LABELS: Record<WalletTxnStatus, string> = {
  SUCCESS: "Done",
  PENDING: "Not finished",
  FAILED: "Failed",
  REVERSED: "Reversed",
};

const STATUS_CHIP: Record<WalletTxnStatus, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  REVERSED: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_HINT: Record<WalletTxnStatus, string> = {
  SUCCESS: "The money moved. The balance reflects this.",
  PENDING:
    "The payment page was opened but never completed. Usually an abandoned checkout, so no money moved.",
  FAILED: "The bank turned this down. No money moved, but the customer may think it did.",
  REVERSED: "This was undone after the fact.",
};

interface LedgerTableProps {
  rows: WalletTxnRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  pageCount: number;
  sortField: TxnSortField;
  sortDir: "asc" | "desc";
  filteredIn: number;
  filteredOut: number;
  filteredNet: number;
  currency: string;
  orgOptions: { id: string; name: string }[];
  selectedOrgId: string;
  selectedTypes: WalletTxnType[];
  selectedStatuses: WalletTxnStatus[];
  from: string;
  to: string;
  query: string;
}

export function LedgerTable({
  rows,
  page,
  pageSize,
  totalRows,
  pageCount,
  sortField,
  sortDir,
  filteredIn,
  filteredOut,
  filteredNet,
  currency,
  orgOptions,
  selectedOrgId,
  selectedTypes,
  selectedStatuses,
  from,
  to,
  query,
}: LedgerTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  const [exporting, setExporting] = React.useState(false);

  const [searchValue, setSearchValue] = React.useState(query);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adjusted during render rather than in an effect, so back/forward navigation
  // updates the box without an extra commit. See OrgBalancesTable for the note.
  const [lastQuery, setLastQuery] = React.useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setSearchValue(query);
  }

  const updateParams = React.useCallback(
    (updates: Record<string, string | null>, options?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (options?.resetPage !== false) next.delete("page");

      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParams({ q: value || null }), SEARCH_DEBOUNCE_MS);
  };

  const handleExport = () => {
    setExporting(true);

    startTransition(async () => {
      try {
        const result = await exportWalletTransactionsAction({
          orgId: selectedOrgId || undefined,
          types: selectedTypes.length ? selectedTypes : undefined,
          statuses: selectedStatuses.length ? selectedStatuses : undefined,
          from: from || undefined,
          to: to || undefined,
          query: query || undefined,
          sortField,
          sortDir,
        });

        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        if (result.rowCount === 0) {
          toast.info("Nothing to export with these filters.");
          return;
        }

        // Built in the browser rather than served from a route so the admin check
        // and the filter parsing stay in one place.
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.filename;
        link.click();
        URL.revokeObjectURL(url);

        toast.success(`Exported ${result.rowCount} rows.`, {
          description: result.truncated
            ? "This hit the export limit, so older rows were left out. Narrow the dates to get the rest."
            : undefined,
        });
      } finally {
        setExporting(false);
      }
    });
  };

  const columns = React.useMemo<ColumnDef<WalletTxnRow>[]>(
    () => [
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap text-muted-foreground">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "org",
        enableSorting: false,
        header: () => <span className="text-xs">Organisation</span>,
        cell: ({ row }) => (
          <span className="text-sm font-medium">{row.original.orgName}</span>
        ),
      },
      {
        id: "type",
        enableSorting: false,
        header: () => <span className="text-xs">What happened</span>,
        cell: ({ row }) => {
          const txn = row.original;
          return (
            <div className="min-w-0">
              <p className="text-sm">{TYPE_LABELS[txn.type]}</p>
              {txn.shipmentNumber && (
                <Link
                  href={`/arena-dashboard/bookings/${txn.shipmentId}`}
                  className="font-mono text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  {txn.shipmentNumber}
                </Link>
              )}
              {txn.notes && !txn.shipmentNumber && (
                <p className="max-w-70 truncate text-[11px] text-muted-foreground" title={txn.notes}>
                  {txn.notes}
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: "amount",
        accessorKey: "amount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => {
          const txn = row.original;
          const isCredit = txn.signedAmount >= 0;

          return (
            <span
              className={cn(
                "text-sm font-medium tabular-nums whitespace-nowrap",
                // Only successful movements are coloured. A failed payment shown in
                // green would read as money that arrived.
                txn.status !== "SUCCESS"
                  ? "text-muted-foreground"
                  : isCredit
                    ? "text-emerald-700"
                    : "text-foreground",
              )}
            >
              {isCredit ? "+" : "−"}
              {formatMoney(Math.abs(txn.signedAmount), txn.currency)}
            </span>
          );
        },
      },
      {
        id: "balanceAfter",
        enableSorting: false,
        header: () => <span className="text-xs">Balance after</span>,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {row.original.balanceAfter == null
              ? "—"
              : formatMoney(row.original.balanceAfter, row.original.currency)}
          </span>
        ),
      },
      {
        id: "status",
        enableSorting: false,
        header: () => <span className="text-xs">Status</span>,
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={cn("cursor-help", STATUS_CHIP[status])}>
                  {STATUS_LABELS[status]}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{STATUS_HINT[status]}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "who",
        enableSorting: false,
        header: () => <span className="text-xs">Recorded by</span>,
        cell: ({ row }) => {
          const txn = row.original;

          if (txn.actorName) {
            return (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserRound className="h-3 w-3 shrink-0" />
                {txn.actorName}
              </span>
            );
          }

          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-xs text-muted-foreground">Automatic</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-60">
                The system wrote this: an online payment or a booking taking money out.
                Nobody entered it by hand.
              </TooltipContent>
            </Tooltip>
          );
        },
      },
    ],
    [],
  );

  const sorting: SortingState = [{ id: sortField, desc: sortDir === "desc" }];

  const handleSortingChange = (next: SortingState) => {
    const first = next[0];
    if (!first) {
      updateParams({ sort: null, dir: null });
      return;
    }
    updateParams({ sort: first.id, dir: first.desc ? "desc" : "asc" });
  };

  const hasFilters =
    Boolean(selectedOrgId) ||
    selectedTypes.length > 0 ||
    selectedStatuses.length > 0 ||
    Boolean(from) ||
    Boolean(to) ||
    query.length > 0;

  const clearAll = () => {
    setSearchValue("");
    updateParams({ q: null, orgId: null, type: null, status: null, from: null, to: null });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <DataTable
        columns={columns}
        data={rows}
        page={page}
        pageSize={pageSize}
        totalRows={totalRows}
        pageCount={pageCount}
        onPageChange={(next) => updateParams({ page: String(next) }, { resetPage: false })}
        onPageSizeChange={(next) => updateParams({ pageSize: String(next) })}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        isLoading={isPending}
        toolbar={
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchValue}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Shipment number, payment reference, note"
                  className="h-8 w-72 pl-8"
                  aria-label="Search transactions"
                />
              </div>

              <Select
                value={selectedOrgId || "__all__"}
                onValueChange={(next) =>
                  updateParams({ orgId: next === "__all__" ? null : next })
                }
              >
                <SelectTrigger className="h-8 w-48" aria-label="Filter by organisation">
                  <SelectValue placeholder="Every organisation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Every organisation</SelectItem>
                  {orgOptions.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DataTableFacetedFilter
                title="What happened"
                selected={selectedTypes}
                options={(Object.keys(TYPE_LABELS) as WalletTxnType[]).map((value) => ({
                  value,
                  label: TYPE_LABELS[value],
                }))}
                onChange={(values) => updateParams({ type: values.join(",") || null })}
              />

              <DataTableFacetedFilter
                title="Status"
                selected={selectedStatuses}
                options={(Object.keys(STATUS_LABELS) as WalletTxnStatus[]).map((value) => ({
                  value,
                  label: STATUS_LABELS[value],
                }))}
                onChange={(values) => updateParams({ status: values.join(",") || null })}
              />

              {hasFilters && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearAll}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Clear
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-8 gap-1.5 text-xs"
                onClick={handleExport}
                disabled={exporting || isPending}
              >
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Preparing..." : "Export CSV"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="ledger-from" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="ledger-from"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => updateParams({ from: e.target.value || null })}
                  className="h-8 w-36"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Label htmlFor="ledger-to" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="ledger-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => updateParams({ to: e.target.value || null })}
                  className="h-8 w-36"
                />
              </div>

              {/* Totals for everything matching the filters, not just this page. */}
              <div className="ml-auto flex flex-wrap items-center gap-4 text-xs">
                <span className="text-muted-foreground">
                  In{" "}
                  <span className="font-medium tabular-nums text-emerald-700">
                    {formatMoney(filteredIn, currency)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Out{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMoney(filteredOut, currency)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Net{" "}
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      filteredNet >= 0 ? "text-emerald-700" : "text-red-700",
                    )}
                  >
                    {filteredNet < 0 ? "−" : ""}
                    {formatMoney(Math.abs(filteredNet), currency)}
                  </span>
                </span>
              </div>
            </div>
          </div>
        }
        emptyState={
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <ReceiptText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {hasFilters ? "Nothing matches those filters." : "No transactions yet."}
            </p>
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={clearAll}>
                Clear the filters
              </Button>
            )}
          </div>
        }
      />
    </TooltipProvider>
  );
}
