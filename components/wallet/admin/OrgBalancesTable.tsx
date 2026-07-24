"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Building2, Search, Settings2, TriangleAlert, Wallet, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  MONEY_PERIODS,
  type BalanceFilter,
  type MoneyPeriod,
  type OrgSortField,
  type WalletOrgRow,
} from "@/lib/wallet/adminConfig";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/utils/format";

import { AdjustBalanceDialog, type AdjustBalanceTarget } from "./AdjustBalanceDialog";

/**
 * Who is holding a balance, and who is about to be blocked from booking.
 *
 * All state lives in the URL so a filtered view is shareable and survives the
 * router refresh that follows a manual adjustment. The server does the filtering,
 * so what is on screen always matches what the query returned.
 */

const SEARCH_DEBOUNCE_MS = 350;

const BALANCE_FILTER_LABELS: Record<BalanceFilter, string> = {
  all: "All organisations",
  low: "Running low",
  empty: "Nothing left",
  healthy: "Comfortable",
};

interface OrgBalancesTableProps {
  rows: WalletOrgRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  pageCount: number;
  sortField: OrgSortField;
  sortDir: "asc" | "desc";
  balance: BalanceFilter;
  query: string;
  period: MoneyPeriod;
  lowThreshold: number;
  currency: string;
}

export function OrgBalancesTable({
  rows,
  page,
  pageSize,
  totalRows,
  pageCount,
  sortField,
  sortDir,
  balance,
  query,
  period,
  lowThreshold,
  currency,
}: OrgBalancesTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const [searchValue, setSearchValue] = React.useState(query);
  const [adjusting, setAdjusting] = React.useState<AdjustBalanceTarget | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in step with back/forward navigation, which changes `query`
  // underneath us with no typing involved.
  //
  // Adjusted during render rather than in an effect. React documents this as the
  // way to derive state from a changed prop, and it avoids the extra commit an
  // effect would cause. A keyed remount is the other option but it would steal
  // focus mid-typing, since every debounced commit changes the committed query.
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

  const openAdjust = React.useCallback((row: WalletOrgRow) => {
    setAdjusting({
      orgId: row.orgId,
      orgName: row.orgName,
      balance: row.balance,
      currency: row.currency,
    });
    setDialogOpen(true);
  }, []);

  const periodLabel = MONEY_PERIODS[period].label.toLowerCase();

  const columns = React.useMemo<ColumnDef<WalletOrgRow>[]>(
    () => [
      {
        id: "name",
        accessorKey: "orgName",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Organisation" />,
        cell: ({ row }) => {
          const org = row.original;
          return (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{org.orgName}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {org.isBusinessAssociate && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      BA
                    </Badge>
                  )}
                  {org.skipPayment && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                          Pays later
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-60">
                        This organisation books without paying up front, so a low balance
                        does not stop them. Money owed shows on the Collections tab.
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {!org.hasWallet && (
                    <span className="text-[11px] text-muted-foreground">No wallet yet</span>
                  )}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: "balance",
        accessorKey: "balance",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Balance" />,
        cell: ({ row }) => {
          const org = row.original;

          if (!org.hasWallet) {
            return <span className="text-sm text-muted-foreground">&mdash;</span>;
          }

          return (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-medium tabular-nums",
                org.isLow && "text-amber-700",
              )}
            >
              {org.isLow && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-60">
                    At or under {formatMoney(lowThreshold, currency)}. Their next booking may
                    be blocked for want of funds.
                  </TooltipContent>
                </Tooltip>
              )}
              {formatMoney(org.balance, org.currency)}
            </span>
          );
        },
      },
      {
        id: "toppedUp",
        accessorKey: "toppedUp",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Topped up" />,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {row.original.toppedUp > 0
              ? formatMoney(row.original.toppedUp, row.original.currency)
              : "—"}
          </span>
        ),
      },
      {
        id: "spent",
        accessorKey: "spent",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Spent" />,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {row.original.spent > 0
              ? formatMoney(row.original.spent, row.original.currency)
              : "—"}
          </span>
        ),
      },
      {
        id: "lastActivity",
        accessorKey: "lastActivity",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Last movement" />,
        cell: ({ row }) => {
          const last = row.original.lastActivity;
          return (
            <span className="text-sm text-muted-foreground">
              {last ? formatDate(last) : `Nothing in the ${periodLabel}`}
            </span>
          );
        },
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="text-xs">Actions</span>,
        cell: ({ row }) => {
          const org = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => openAdjust(org)}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Adjust
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-60">
                  Add or remove money by hand, for payments that did not come through
                  the app.
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" asChild>
                    <Link
                      href={`/arena-dashboard/wallets?tab=transactions&orgId=${org.orgId}`}
                    >
                      <Wallet className="h-3.5 w-3.5" />
                      History
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Every movement in and out for this organisation.</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [openAdjust, periodLabel, lowThreshold, currency],
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

  const hasFilters = balance !== "all" || query.length > 0;

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
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search organisations"
                className="h-8 w-56 pl-8"
                aria-label="Search organisations"
              />
            </div>

            <Select
              value={balance}
              onValueChange={(next) => updateParams({ balance: next === "all" ? null : next })}
            >
              <SelectTrigger className="h-8 w-44" aria-label="Filter by balance">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(BALANCE_FILTER_LABELS) as BalanceFilter[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {BALANCE_FILTER_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => {
                  setSearchValue("");
                  updateParams({ q: null, balance: null });
                }}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            )}

            <span className="ml-auto text-xs text-muted-foreground">
              Topped up and spent cover the {periodLabel}. Balance is current.
            </span>
          </div>
        }
        emptyState={
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? "No organisation matches those filters."
                : "No organisations yet."}
            </p>
          </div>
        }
      />

      <AdjustBalanceDialog target={adjusting} open={dialogOpen} onOpenChange={setDialogOpen} />
    </TooltipProvider>
  );
}
