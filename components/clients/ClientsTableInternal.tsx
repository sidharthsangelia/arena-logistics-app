"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ClientRow, ClientSortField } from "@/queries/clients";
import { CLIENT_TOGGLEABLE_COLUMNS, getClientColumns } from "@/app/(arena)/arena-dashboard/clients/Columns";
import { DataTable } from "../shipments/data-table/DataTable";
import { DataTableFacetedFilter } from "../shipments/data-table/DataTableFacetedFilter";
import { DataTableViewOptions } from "../shipments/data-table/DataTableViewOptions";


interface OrgOption {
  id: string;
  name: string;
}

interface Props {
  clients: ClientRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  pageCount: number;
  sortField: ClientSortField;
  sortDir: "asc" | "desc";
  orgIds: string[];
  orgOptions: OrgOption[];
  query: string;
}

// "Created" is available but hidden by default to keep the table visually
// identical to before unless someone opts in via the View menu.
const DEFAULT_VISIBILITY: VisibilityState = { createdAt: false };

export default function ClientsTableInternal({
  clients,
  page,
  pageSize,
  totalRows,
  pageCount,
  sortField,
  sortDir,
  orgIds,
  orgOptions,
  query,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(DEFAULT_VISIBILITY);

  const columns = React.useMemo(() => getClientColumns(), []);

  const updateParams = React.useCallback(
    (updates: Record<string, string | null>, options?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      });
      if (options?.resetPage !== false) next.delete("page");

      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams]
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

  const orgFacetOptions = orgOptions.map((org) => ({ value: org.id, label: org.name }));
  const hasActiveFilters = orgIds.length > 0;

  return (
    <DataTable
      columns={columns}
      data={clients}
      page={page}
      pageSize={pageSize}
      totalRows={totalRows}
      pageCount={pageCount}
      onPageChange={(p) => updateParams({ page: String(p) }, { resetPage: false })}
      onPageSizeChange={(size) => updateParams({ pageSize: String(size) })}
      sorting={sorting}
      onSortingChange={handleSortingChange}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
      isLoading={isPending}
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <DataTableFacetedFilter
              title="Business Associate"
              options={orgFacetOptions}
              selected={orgIds}
              onChange={(values) => updateParams({ org: values.length ? values.join(",") : null })}
            />
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 lg:px-3"
                onClick={() => updateParams({ org: null })}
              >
                Reset
                <X className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>

          <DataTableViewOptions
            columns={CLIENT_TOGGLEABLE_COLUMNS}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
          />
        </div>
      }
      emptyState={
        <div className="flex flex-col items-center gap-1 py-6 text-center">
          <p className="text-sm font-medium text-foreground">
            {query || hasActiveFilters ? "No clients match your filters" : "No clients yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {query || hasActiveFilters
              ? "Try a different search term or Business Associate."
              : "Clients created by your tenants will appear here."}
          </p>
        </div>
      }
    />
  );
}