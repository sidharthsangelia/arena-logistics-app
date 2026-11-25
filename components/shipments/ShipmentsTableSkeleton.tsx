"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { DataTable } from "@/components/data-table/DataTable";
import { DataTableFacetedFilter } from "@/components/data-table/DataTableFacetedFilter";
import { DataTableViewOptions } from "@/components/data-table/DataTableViewOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";

import {
  getShipmentColumns,
  SHIPMENT_TOGGLEABLE_COLUMNS,
  shipmentSearchPlaceholder,
} from "./Columns";

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}));

/**
 * The shipments table before its rows arrive. Same idea as ClientsTableSkeleton:
 * it renders the real DataTable with the real column definitions in first-load
 * mode, so the header labels, column widths, border, striping and pager are the
 * loaded table's own, and only the cells are placeholders (each column's
 * `meta.skeleton`).
 *
 * The toolbar is the real one too, inert, and reflects the URL: the search box
 * shows the current query and the Status filter the statuses already picked, so
 * nothing in it changes when the table arrives. Row count follows ?pageSize.
 *
 * The page size options come in as props because their home, queries/shipments,
 * is server-only.
 */
export function ShipmentsTableSkeleton({
  client = false,
  defaultPageSize,
  pageSizeOptions,
}: {
  client?: boolean;
  defaultPageSize: number;
  pageSizeOptions: readonly number[];
}) {
  const sp = useSearchParams();
  const columns = React.useMemo(() => getShipmentColumns(client), [client]);

  const pageSizeRaw = Number(sp.get("pageSize"));
  const pageSize = pageSizeOptions.includes(pageSizeRaw) ? pageSizeRaw : defaultPageSize;
  const pageRaw = Number(sp.get("page"));
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const query = sp.get("q") ?? "";
  const statuses = (sp.get("status") ?? "").split(",").filter((s) => s in STATUS_CONFIG);
  const sortField = sp.get("sort") ?? "createdAt";
  const sortDesc = sp.get("dir") !== "asc";

  return (
    <div inert aria-busy="true">
      <DataTable
        columns={columns}
        data={[]}
        isFirstLoad
        skeletonRows={pageSize}
        page={page}
        pageSize={pageSize}
        totalRows={0}
        pageCount={1}
        onPageChange={noop}
        onPageSizeChange={noop}
        sorting={[{ id: sortField, desc: sortDesc }]}
        onSortingChange={noop}
        columnVisibility={{}}
        onColumnVisibilityChange={noop}
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  readOnly
                  value={query}
                  placeholder={shipmentSearchPlaceholder(client)}
                  className="h-8 pl-8"
                />
              </div>
              <DataTableFacetedFilter
                title="Status"
                options={STATUS_OPTIONS}
                selected={statuses}
                onChange={noop}
              />
              {(statuses.length > 0 || query.length > 0) && (
                <Button variant="ghost" size="sm" className="h-8 px-2 lg:px-3">
                  Reset
                  <X className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
            <DataTableViewOptions
              columns={SHIPMENT_TOGGLEABLE_COLUMNS}
              columnVisibility={{}}
              onColumnVisibilityChange={noop}
            />
          </div>
        }
      />
    </div>
  );
}

function noop() {}
