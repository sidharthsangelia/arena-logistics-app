"use client";

/**
 * components/rate-quotations/RateQuotationsTable.tsx
 *
 * Every rate card Arena has generated, newest first.
 *
 * ── WHY THIS IS NOT THE QUOTES TABLE ────────────────────────────────────────
 * A quote is one price for one shipment, with a status and a customer who can
 * accept it. A rate card is a grid of prices for a whole set of lanes, with no
 * workflow and often no customer yet. They share a page because a salesperson
 * looking for "what have we sent this account" wants both, and they share
 * nothing else — so they are two tables under two tabs rather than one table
 * with half its columns blank.
 *
 * ── THE AUDIENCE COLUMN IS THE POINT ────────────────────────────────────────
 * A customer card and an internal cost card are the same file format with
 * completely different consequences if forwarded. The audience is a coloured
 * badge in the second column, not something you learn by opening the file.
 */

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, FileSpreadsheet, Lock, ShieldOff } from "lucide-react";

import { DataTable } from "@/components/data-table/DataTable";
import { DataTableColumnHeader } from "@/components/data-table/DataTableColumnHeader";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";
import {
  DataTableEmptyState,
  DataTableErrorState,
  DataTableToolbar,
} from "@/components/data-table/DataTableToolbar";
import { Badge } from "@/components/ui/badge";
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
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDate } from "@/utils/format";
import {
  RATE_QUOTATION_AUDIENCE_FILTERS,
  RATE_QUOTATION_AUDIENCE_FILTER_LABELS,
  RATE_QUOTATION_LAYOUT_LABELS,
  formatFileSize,
  type RateQuotationAudienceFilter,
  type RateQuotationRow,
} from "@/lib/rateQuotations/config";

import { useRateQuotationsQuery } from "./useRateQuotationsQuery";

const COLUMN_COUNT = 9;

export default function RateQuotationsTable() {
  const t = useRateQuotationsQuery();

  const columns = React.useMemo<ColumnDef<RateQuotationRow>[]>(
    () => [
      {
        accessorKey: "cardNumber",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Card" />
        ),
        cell: ({ row }) => (
          <span className="text-sm font-medium tabular-nums">
            {row.original.cardNumber}
          </span>
        ),
      },
      {
        accessorKey: "audience",
        enableSorting: false,
        header: () => <span className="text-xs">Audience</span>,
        cell: ({ row }) =>
          row.original.audience === "INTERNAL" ? (
            <Badge variant="destructive" className="gap-1 font-normal">
              <Lock className="h-3 w-3" />
              Internal
            </Badge>
          ) : (
            <Badge variant="secondary" className="font-normal">
              Customer
            </Badge>
          ),
      },
      {
        accessorKey: "preparedFor",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Prepared for" />
        ),
        cell: ({ row }) => (
          <div className="max-w-[180px]">
            <span className="block truncate text-sm">
              {row.original.preparedFor ?? "Generic rate card"}
            </span>
            {row.original.clientName ? (
              <span className="block truncate text-[11px] text-muted-foreground">
                {row.original.clientName}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "coverage",
        enableSorting: false,
        header: () => <span className="text-xs">Coverage</span>,
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block cursor-default whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                {row.original.countryCount} × {row.original.weightCount}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {row.original.countryCount} countries at{" "}
              {row.original.weightCount} weight slabs:{" "}
              {row.original.countryCodes.join(", ")}
            </TooltipContent>
          </Tooltip>
        ),
      },
      {
        id: "layout",
        enableSorting: false,
        header: () => <span className="text-xs">Layout</span>,
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <span className="block text-sm">
              {RATE_QUOTATION_LAYOUT_LABELS[row.original.layout]}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {row.original.sheetCount} sheets, {row.original.carrierCount}{" "}
              carriers
            </span>
          </div>
        ),
      },
      {
        id: "markup",
        enableSorting: false,
        header: () => <span className="text-xs">Markup</span>,
        cell: ({ row }) => (
          <span className="block text-right text-sm tabular-nums">
            {row.original.audience === "CUSTOMER" ? (
              `${row.original.markupPercent}%`
            ) : (
              <span className="text-muted-foreground">Cost</span>
            )}
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
            {row.original.expired ? (
              <span className="text-[10px] text-destructive">Expired</span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Generated" />
        ),
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <span className="block text-sm text-muted-foreground">
              {formatDate(row.original.createdAt)}
            </span>
            {row.original.generatedByName ? (
              <span className="block max-w-[140px] truncate text-[11px] text-muted-foreground">
                {row.original.generatedByName}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "file",
        enableSorting: false,
        header: () => <span className="text-xs">File</span>,
        cell: ({ row }) =>
          row.original.fileUrl ? (
            <Link
              href={row.original.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm hover:underline"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="tabular-nums">
                {formatFileSize(row.original.fileSize)}
              </span>
            </Link>
          ) : (
            // Not a broken link. Internal cards are deliberately never stored,
            // and saying so is the difference between a policy and a bug.
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-default items-center gap-1.5 text-sm text-muted-foreground">
                  <ShieldOff className="h-3.5 w-3.5 shrink-0" />
                  Not stored
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {row.original.audience === "INTERNAL"
                  ? "Internal cost cards are never uploaded. A storage link is public, and this file is Arena's buying price."
                  : "The upload did not complete. The settings are recorded, so the card can be rebuilt."}
              </TooltipContent>
            </Tooltip>
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
      searchPlaceholder="Search card number, client, country code or who made it..."
      isFetching={t.isFetching && !t.isFirstLoad}
      resultLabel={
        t.data ? `${total.toLocaleString()} card${total !== 1 ? "s" : ""}` : null
      }
    >
      <Select
        value={t.audience}
        onValueChange={(value) =>
          t.setAudience(value as RateQuotationAudienceFilter)
        }
      >
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RATE_QUOTATION_AUDIENCE_FILTERS.map((value) => (
            <SelectItem key={value} value={value}>
              {RATE_QUOTATION_AUDIENCE_FILTER_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </DataTableToolbar>
  );

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
            message="Could not load rate cards. You may not have access, or the request failed."
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
          emptyText="No rate cards have been generated yet."
          filteredText="No rate cards match your filters."
          onReset={t.clearFilters}
        />
      }
    />
  );
}

/** Icon for the tab trigger, kept beside the table it belongs to. */
export const RateQuotationsTabIcon = FileSpreadsheet;
