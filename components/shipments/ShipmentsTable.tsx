"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
 
import { ShipmentStatus } from "@/generated/prisma";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import type { ShipmentRow, ShipmentSortField } from "@/queries/shipments";
import { getShipmentColumns, SHIPMENT_TOGGLEABLE_COLUMNS } from "./Columns";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableFacetedFilter } from "@/components/data-table/DataTableFacetedFilter";
import { DataTableViewOptions } from "@/components/data-table/DataTableViewOptions";



const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}));

const SEARCH_DEBOUNCE_MS = 350;

interface ShipmentsTableProps {
  data: ShipmentRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  pageCount: number;
  sortField: ShipmentSortField;
  sortDir: "asc" | "desc";
  statuses: string[];
  query: string;
  statusCounts: Partial<Record<ShipmentStatus, number>>;
  client?: boolean;
}

export function ShipmentsTable({
  data,
  page,
  pageSize,
  totalRows,
  pageCount,
  sortField,
  sortDir,
  statuses,
  query,
  statusCounts,
  client = false,
}: ShipmentsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const [searchValue, setSearchValue] = React.useState(query);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const columns = React.useMemo(() => getShipmentColumns(client), [client]);

  // Keep the input in sync if the user navigates back/forward.
  React.useEffect(() => {
    setSearchValue(query);
  }, [query]);

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

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ q: value || null });
    }, SEARCH_DEBOUNCE_MS);
  };

  const sorting: SortingState = [{ id: sortField, desc: sortDir === "desc" }];

  const handleSortingChange = (next: SortingState) => {
    const first = next[0];
    if (!first) {
      updateParams({ sort: null, dir: null });
      return;
    }
    updateParams({ sort: first.id, dir: first.desc ? "desc" : "asc" });
  };

  const hasActiveFilters = statuses.length > 0 || query.length > 0;

  return (
    <DataTable
      columns={columns}
      data={data}
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search shipment #, org, client, city…"
                className="h-8 pl-8"
              />
            </div>

            <DataTableFacetedFilter
              title="Status"
              options={STATUS_OPTIONS.map((option) => ({
                ...option,
                count: statusCounts[option.value as ShipmentStatus],
              }))}
              selected={statuses}
              onChange={(values) =>
                updateParams({ status: values.length ? values.join(",") : null })
              }
            />

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 lg:px-3"
                onClick={() => {
                  setSearchValue("");
                  updateParams({ q: null, status: null });
                }}
              >
                Reset
                <X className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>

          <DataTableViewOptions
            columns={SHIPMENT_TOGGLEABLE_COLUMNS}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
          />
        </div>
      }
      emptyState={
        <div className="flex flex-col items-center gap-1 py-6 text-center">
          <p className="text-sm font-medium text-foreground">
            {hasActiveFilters ? "No shipments match your filters" : "No shipments yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {hasActiveFilters
              ? "Try a different search term or status."
              : "Tenant bookings will appear here once submitted."}
          </p>
        </div>
      }
    />
  );
}