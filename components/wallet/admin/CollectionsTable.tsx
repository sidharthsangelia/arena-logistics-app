"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Ban, HandCoins, Search, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableColumnHeader } from "@/components/data-table/DataTableColumnHeader";
import { writeOffCollectionAction } from "@/actions/wallet/paymentCollection.action";
import type { CollectionFilter, CollectionSortField } from "@/lib/wallet/adminConfig";
import type { CollectionRow } from "@/lib/wallet/adminLedger";
import {
  AGING_TONE_CLASS,
  COLLECTION_STATUS_CONFIG,
  agingTone,
} from "@/lib/wallet/collections";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/format";

import { RecordPaymentSheet } from "./RecordPaymentSheet";

/**
 * Bookings that shipped before paying, and where each one stands.
 *
 * A work queue, not a report. It defaults to everything still owing money, sorted
 * oldest first, because the oldest debt is the one most likely to go bad. Age is
 * coloured for the same reason.
 */

const SEARCH_DEBOUNCE_MS = 350;

const FILTER_LABELS: Record<CollectionFilter, string> = {
  outstanding: "Still owed",
  pending: "Nothing paid yet",
  part_paid: "Part paid",
  collected: "Fully paid",
  written_off: "Written off",
  all: "Everything",
};

interface CollectionsTableProps {
  rows: CollectionRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  pageCount: number;
  sortField: CollectionSortField;
  sortDir: "asc" | "desc";
  filter: CollectionFilter;
  query: string;
  totalOwed: number;
  totalCollected: number;
  currency: string;
  isArenaAdmin: boolean;
}

export function CollectionsTable({
  rows,
  page,
  pageSize,
  totalRows,
  pageCount,
  sortField,
  sortDir,
  filter,
  query,
  totalOwed,
  totalCollected,
  currency,
  isArenaAdmin,
}: CollectionsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const [searchValue, setSearchValue] = React.useState(query);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [active, setActive] = React.useState<CollectionRow | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [writeOffTarget, setWriteOffTarget] = React.useState<CollectionRow | null>(null);
  const [writeOffReason, setWriteOffReason] = React.useState("");

  // Adjusted during render, not in an effect. See OrgBalancesTable for the note.
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

  const openSheet = React.useCallback((row: CollectionRow) => {
    setActive(row);
    setSheetOpen(true);
  }, []);

  const confirmWriteOff = () => {
    if (!writeOffTarget) return;

    startTransition(async () => {
      const result = await writeOffCollectionAction({
        shipmentId: writeOffTarget.shipmentId,
        reason: writeOffReason.trim(),
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(result.message);
      setWriteOffTarget(null);
      setWriteOffReason("");
      router.refresh();
    });
  };

  const columns = React.useMemo<ColumnDef<CollectionRow>[]>(
    () => [
      {
        id: "shipment",
        enableSorting: false,
        header: () => <span className="text-xs">Booking</span>,
        cell: ({ row }) => {
          const shipmentStatus = STATUS_CONFIG[row.original.shipmentStatus];
          return (
            <div className="min-w-0">
              <p className="font-mono text-sm font-medium">{row.original.shipmentNumber}</p>
              <Badge
                variant="outline"
                className={cn("mt-1 h-4 px-1.5 text-[10px]", shipmentStatus?.className)}
              >
                {shipmentStatus?.label ?? row.original.shipmentStatus}
              </Badge>
            </div>
          );
        },
      },
      {
        id: "org",
        accessorKey: "orgName",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Who owes it" />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.original.orgName}</p>
            {row.original.clientName && (
              <p className="truncate text-xs text-muted-foreground">
                for {row.original.clientName}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "owed",
        accessorKey: "owed",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Still owed" />,
        cell: ({ row }) => {
          const collection = row.original;
          return (
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  collection.owed > 0 ? "text-amber-700" : "text-muted-foreground",
                )}
              >
                {formatMoney(collection.owed, collection.currency)}
              </p>
              {collection.collected > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatMoney(collection.collected, collection.currency)} of{" "}
                  {formatMoney(collection.quotedTotal ?? 0, collection.currency)} paid
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: "bookedAt",
        accessorKey: "ageDays",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Waiting" />,
        cell: ({ row }) => {
          const days = row.original.ageDays;
          return (
            <span
              className={cn("text-sm whitespace-nowrap", AGING_TONE_CLASS[agingTone(days)])}
            >
              {days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`}
            </span>
          );
        },
      },
      {
        id: "status",
        enableSorting: false,
        header: () => <span className="text-xs">Payment</span>,
        cell: ({ row }) => {
          const config = COLLECTION_STATUS_CONFIG[row.original.collectionStatus];
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={cn("cursor-help", config.chip)}>
                  {config.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{config.hint}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="text-xs">Actions</span>,
        cell: ({ row }) => {
          const collection = row.original;
          const canWriteOff =
            isArenaAdmin &&
            (collection.collectionStatus === "PENDING" ||
              collection.collectionStatus === "PART_PAID");

          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                size="sm"
                variant={collection.owed > 0 ? "outline" : "ghost"}
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => openSheet(collection)}
              >
                <HandCoins className="h-3.5 w-3.5" />
                {collection.owed > 0 ? "Record payment" : "View payments"}
              </Button>

              {canWriteOff && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      aria-label="Write off this balance"
                      onClick={() => {
                        setWriteOffTarget(collection);
                        setWriteOffReason("");
                      }}
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-60">
                    Give up on this money. It stops counting as owed, and the reason is
                    saved on the booking.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        },
      },
    ],
    [openSheet, isArenaAdmin],
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

  const hasFilters = filter !== "outstanding" || query.length > 0;

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
                placeholder="Shipment number, organisation, client"
                className="h-8 w-64 pl-8"
                aria-label="Search collections"
              />
            </div>

            <Select
              value={filter}
              onValueChange={(next) =>
                updateParams({ filter: next === "outstanding" ? null : next })
              }
            >
              <SelectTrigger className="h-8 w-44" aria-label="Filter by payment state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FILTER_LABELS) as CollectionFilter[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {FILTER_LABELS[key]}
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
                  updateParams({ q: null, filter: null });
                }}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            )}

            <div className="ml-auto flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                Owed{" "}
                <span className="font-medium tabular-nums text-amber-700">
                  {formatMoney(totalOwed, currency)}
                </span>
              </span>
              <span className="text-muted-foreground">
                Collected{" "}
                <span className="font-medium tabular-nums text-emerald-700">
                  {formatMoney(totalCollected, currency)}
                </span>
              </span>
            </div>
          </div>
        }
        emptyState={
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <HandCoins className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {filter === "outstanding" && !query
                ? "Nothing is waiting to be collected."
                : "Nothing matches those filters."}
            </p>
            {filter === "outstanding" && !query && (
              <p className="text-xs text-muted-foreground">
                Every booking that shipped without paying has been settled.
              </p>
            )}
          </div>
        }
      />

      <RecordPaymentSheet
        row={active}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        isArenaAdmin={isArenaAdmin}
      />

      <AlertDialog
        open={writeOffTarget !== null}
        onOpenChange={(open) => {
          if (!open) setWriteOffTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Write off {writeOffTarget ? formatMoney(writeOffTarget.owed, writeOffTarget.currency) : ""}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This says you have given up on collecting the rest of{" "}
              {writeOffTarget?.shipmentNumber} from {writeOffTarget?.orgName}. It stops
              counting as money owed. If a payment does turn up later, you can still
              record it and this will reopen.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="writeoff-reason">Reason</Label>
            <Textarea
              id="writeoff-reason"
              rows={2}
              placeholder="Client stopped responding after three months of follow-up"
              value={writeOffReason}
              onChange={(e) => setWriteOffReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Saved to the booking&apos;s notes with your name and the date.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Keep chasing it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // The dialog closes on click by default, which would unmount the
                // reason field mid-submit and drop the transition.
                event.preventDefault();
                confirmWriteOff();
              }}
              disabled={isPending || writeOffReason.trim().length < 5}
            >
              {isPending ? "Writing off..." : "Write it off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
