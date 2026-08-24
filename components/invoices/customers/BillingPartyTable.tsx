"use client";

/**
 * Everyone Arena bills, in one table.
 *
 * These rows are BillingParty records: the address book behind manual
 * invoicing. Most were typed into the invoice form's picker; the rest were
 * adopted from a signed-up org or a business associate's client, which copies
 * their details once and keeps a link (see adoptCustomerAction).
 *
 * The money on a row is summed from that customer's invoices at request time,
 * not stored. A party has no balance of its own — what it owes is the sum of
 * what has been raised to it, and a cached copy of that would be wrong the
 * first time an invoice was marked paid.
 *
 * react-query with a 15s staleTime and kept-previous-data, matching the invoice
 * feed, so filtering something already looked at is instant and paging never
 * flashes an empty table.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Building2, Link2, Plus, Search, User, Users, X } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDate } from "@/utils/format";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableColumnHeader } from "@/components/data-table/DataTableColumnHeader";
import { InvoicesTableSkeleton } from "@/components/invoices/InvoicesTableSkeleton";
import { BillingPartyKind } from "@/generated/prisma";
import {
  BILLING_PARTY_FILTERS,
  BILLING_PARTY_FILTER_LABEL,
  DEFAULT_BILLING_PARTY_PAGE_SIZE,
  coerceBillingPartySortField,
  formatMoney,
  type BillingPartyFilter,
  type BillingPartyListParams,
  type BillingPartyPage,
  type BillingPartyRow,
} from "@/lib/invoices/manual/config";
import { listBillingPartiesAction } from "@/actions/invoices/manualInvoices.action";
import { BillingPartyDialog } from "@/components/invoices/manual/BillingPartyDialog";
import { BillingPartySummaryCards } from "./BillingPartySummaryCards";

const CUSTOMERS_PATH = "/arena-dashboard/invoices/customers";

type KindFilter = "ALL" | BillingPartyKind;

export function BillingPartyTable({
  initialData,
}: {
  initialData?: BillingPartyPage;
}) {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSizeRaw] = React.useState<number>(
    DEFAULT_BILLING_PARTY_PAGE_SIZE,
  );
  const [sorting, setSortingRaw] = React.useState<SortingState>([
    { id: "legalName", desc: false },
  ]);
  const [filter, setFilterRaw] = React.useState<BillingPartyFilter>("ALL");
  const [kind, setKindRaw] = React.useState<KindFilter>("ALL");
  const [searchInput, setSearchInput] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const search = useDebounce(searchInput.trim(), 350);

  const sortField = coerceBillingPartySortField(sorting[0]?.id);
  const sortDir: "asc" | "desc" = sorting[0]?.desc === false ? "asc" : "desc";

  const params: BillingPartyListParams = {
    page,
    pageSize,
    sortField,
    sortDir,
    filter,
    kind: kind === "ALL" ? null : kind,
    search: search || undefined,
  };

  // The server rendered exactly this view, so it seeds the cache. The moment
  // anything is filtered, sorted or paged the key changes and those rows would
  // be the wrong result set.
  const isDefaultView =
    page === 1 &&
    pageSize === DEFAULT_BILLING_PARTY_PAGE_SIZE &&
    filter === "ALL" &&
    kind === "ALL" &&
    search === "" &&
    sortField === "legalName" &&
    sortDir === "asc";

  const query = useQuery({
    queryKey: ["billing-parties", params],
    queryFn: () => listBillingPartiesAction(params),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    initialData: isDefaultView ? initialData : undefined,
  });

  // Anything that changes the result set returns to page one, so you are never
  // stranded on a page number the new set does not have.
  const setFilter = (next: BillingPartyFilter) => {
    setFilterRaw(next);
    setPage(1);
  };
  const setKind = (next: KindFilter) => {
    setKindRaw(next);
    setPage(1);
  };
  const setSorting = (next: SortingState) => {
    setSortingRaw(next);
    setPage(1);
  };
  const setPageSize = (next: number) => {
    setPageSizeRaw(next);
    setPage(1);
  };
  const onSearch = (next: string) => {
    setSearchInput(next);
    setPage(1);
  };

  const reset = () => {
    setSearchInput("");
    setFilterRaw("ALL");
    setKindRaw("ALL");
    setPage(1);
  };

  const filtered =
    filter !== "ALL" || kind !== "ALL" || searchInput.trim().length > 0;

  const data = query.data;

  return (
    <div className="space-y-5">
      <BillingPartySummaryCards
        summary={data?.summary}
        isLoading={query.isLoading}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Name, GSTIN, code, email, city"
            className="h-9 pl-8"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => onSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <Select
          value={filter}
          onValueChange={(v) => setFilter(v as BillingPartyFilter)}
        >
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BILLING_PARTY_FILTERS.map((f) => (
              <SelectItem key={f} value={f}>
                {BILLING_PARTY_FILTER_LABEL[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={kind} onValueChange={(v) => setKind(v as KindFilter)}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Anyone</SelectItem>
            <SelectItem value={BillingPartyKind.BUSINESS}>
              Businesses
            </SelectItem>
            <SelectItem value={BillingPartyKind.INDIVIDUAL}>
              Individuals
            </SelectItem>
          </SelectContent>
        </Select>

        {filtered ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear
          </Button>
        ) : null}

        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New customer
        </Button>
      </div>

      {query.isLoading ? (
        <InvoicesTableSkeleton columns={7} rows={pageSize} />
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

      <BillingPartyDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(party) => {
          setCreating(false);
          // Straight to the new customer rather than back to the list. Somebody
          // who just created one is about to fill in the rest of their details
          // or raise them an invoice, and both start from that page.
          router.push(`${CUSTOMERS_PATH}/${party.id}`);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const columns: ColumnDef<BillingPartyRow>[] = [
  {
    accessorKey: "legalName",
    id: "legalName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Customer" />
    ),
    cell: ({ row }) => {
      const party = row.original;
      const individual = party.kind === BillingPartyKind.INDIVIDUAL;
      return (
        <Link
          href={`${CUSTOMERS_PATH}/${party.id}`}
          className="group block max-w-[280px]"
        >
          <span className="flex items-center gap-1.5">
            {individual ? (
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-sm font-medium group-hover:underline">
              {party.legalName}
            </span>
          </span>
          {/* The trading name is what people call them; the customer code is
              what the accountant calls them. Either is worth a second line,
              neither is worth two. */}
          {party.tradeName || party.customerCode ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {party.tradeName ?? party.customerCode}
            </span>
          ) : null}
        </Link>
      );
    },
  },
  {
    id: "identity",
    header: "GSTIN",
    enableSorting: false,
    cell: ({ row }) => {
      const party = row.original;
      // "Unregistered" is a real fact about a company and changes what its
      // invoice prints. Against a person's name it would be reporting the
      // absence of something never expected, so they get their contact instead.
      if (party.kind === BillingPartyKind.INDIVIDUAL) {
        return (
          <span className="text-xs text-muted-foreground">
            {party.email ?? party.phone ?? "Individual"}
          </span>
        );
      }
      return party.gstin ? (
        <span className="font-mono text-xs tabular-nums">{party.gstin}</span>
      ) : (
        <span className="text-xs text-muted-foreground">Unregistered</span>
      );
    },
  },
  {
    id: "place",
    header: "Where",
    enableSorting: false,
    cell: ({ row }) => {
      const place = [row.original.city, row.original.state]
        .filter(Boolean)
        .join(", ");
      return (
        <span className="text-xs text-muted-foreground">{place || "—"}</span>
      );
    },
  },
  {
    id: "link",
    header: "Account",
    enableSorting: false,
    cell: ({ row }) => {
      const party = row.original;
      if (!party.linkKind) {
        return <span className="text-xs text-muted-foreground">Off platform</span>;
      }
      return (
        <span className="flex max-w-[170px] items-center gap-1.5">
          <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs">
            {party.linkName ?? (party.linkKind === "ORG" ? "Account" : "Client")}
          </span>
        </span>
      );
    },
  },
  {
    id: "invoiceCount",
    accessorKey: "invoiceCount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Invoices" />
    ),
    cell: ({ row }) => {
      const party = row.original;
      if (party.invoiceCount === 0) {
        return <span className="text-xs text-muted-foreground">None yet</span>;
      }
      return (
        <div className="text-xs">
          <span className="tabular-nums">{party.issuedCount} issued</span>
          {party.draftCount > 0 ? (
            <span className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums">
              {party.draftCount} draft{party.draftCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      );
    },
  },
  {
    id: "billed",
    header: () => <div className="text-right">Billed</div>,
    enableSorting: false,
    cell: ({ row }) => {
      const party = row.original;
      if (party.invoiceCount === 0) {
        return <div className="text-right text-xs text-muted-foreground">—</div>;
      }
      return (
        <div className="text-right">
          <span className="text-xs tabular-nums">
            {formatMoney(party.billedAmount, party.currency)}
          </span>
          {/* Adding rupees to dollars produces a number that is wrong in a way
              nobody notices, so a mixed customer reports one currency and says
              the figure is partial. */}
          {party.mixedCurrency ? (
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {party.currency} only
            </span>
          ) : null}
        </div>
      );
    },
  },
  {
    id: "outstanding",
    header: () => <div className="text-right">Outstanding</div>,
    enableSorting: false,
    cell: ({ row }) => {
      const party = row.original;
      if (party.outstandingAmount <= 0) {
        return (
          <div className="text-right text-xs text-muted-foreground">
            {party.invoiceCount === 0 ? "—" : "Settled"}
          </div>
        );
      }
      return (
        <div className="text-right">
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              party.overdueCount > 0 && "text-red-600 dark:text-red-400",
            )}
          >
            {formatMoney(party.outstandingAmount, party.currency)}
          </span>
          {party.overdueCount > 0 ? (
            <Badge
              variant="outline"
              className="mt-0.5 ml-auto block w-fit border-red-500/20 bg-red-500/10 text-[10px] text-red-700 dark:text-red-400"
            >
              {party.overdueCount} overdue
            </Badge>
          ) : null}
        </div>
      );
    },
  },
  {
    // Not sortable: this is the newest issue date among a customer's invoices,
    // and no column holds it. Offering the header as a sort would order the
    // list by something other than what it displays.
    id: "lastInvoiced",
    header: "Last invoiced",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {row.original.lastInvoicedAt
          ? formatDate(row.original.lastInvoicedAt)
          : "—"}
      </span>
    ),
  },
];

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
          No customers match these filters.
        </p>
        <Button variant="outline" size="sm" onClick={onReset}>
          Clear filters
        </Button>
      </div>
    );
  }

  return (
    <div className="py-12 text-center">
      <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
      <p className="mt-3 text-sm font-medium">No customers yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Anyone you raise an invoice to lands here, whether you type them in or
        pick them from the accounts already on the platform.
      </p>
    </div>
  );
}
