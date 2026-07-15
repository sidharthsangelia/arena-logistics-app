"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { formatDate, formatMoney, formatTime, formatWeight } from "@/utils/format";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import type { ShipmentRow } from "@/queries/shipments";
import { DataTableColumnHeader } from "@/components/data-table/DataTableColumnHeader";

// Columns a user is allowed to hide via the "View" menu. Keep the identity
// (shipmentNumber), status, and the row action pinned/always-visible.
export const SHIPMENT_TOGGLEABLE_COLUMNS: { id: string; label: string }[] = [
  { id: "org", label: "BA / Client" },
  { id: "route", label: "Route" },
  { id: "carrier", label: "Carrier" },
  { id: "packages", label: "Packages" },
  { id: "totalActualWeightKg", label: "Weight" },
  { id: "quotedTotal", label: "Freight" },
  { id: "bookedAt", label: "Booked" },
];

export function getShipmentColumns(): ColumnDef<ShipmentRow>[] {
  return [
    {
      accessorKey: "shipmentNumber",
      id: "shipmentNumber",
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Shipment" />,
      cell: ({ row }) => (
        <Link href={`/arena-dashboard/bookings/${row.original.id}`} className="block">
          <p className="font-mono text-xs font-semibold text-foreground hover:underline">
            {row.original.shipmentNumber}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {formatDate(row.original.createdAt)}
          </p>
        </Link>
      ),
    },
    {
      id: "org",
      header: "BA / Client",
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="text-xs font-medium text-foreground">{row.original.org.name}</p>
          {row.original.client && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              for {row.original.client.companyName}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "route",
      header: "Route",
      enableSorting: false,
      cell: ({ row }) => {
        const origin = [row.original.pickupAddress.city, row.original.pickupAddress.country]
          .filter(Boolean)
          .join(", ");
        const dest = [row.original.deliveryAddress.city, row.original.deliveryAddress.country]
          .filter(Boolean)
          .join(", ");
        return (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-medium text-foreground">{origin || "—"}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">{dest || "—"}</span>
          </div>
        );
      },
    },
    {
      id: "carrier",
      header: "Carrier",
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="text-xs text-foreground">{row.original.selectedVendorName ?? "—"}</p>
          {row.original.selectedProductName && (
            <p className="mt-0.5 max-w-[130px] truncate text-[10px] text-muted-foreground">
              {row.original.selectedProductName}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "packages",
      header: () => <div className="text-center">Pkgs</div>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-center text-xs tabular-nums text-foreground">
          {row.original._count.packages}
        </div>
      ),
    },
    {
      accessorKey: "totalActualWeightKg",
      id: "totalActualWeightKg",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Weight" />,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums text-foreground">
          {formatWeight(row.original.totalActualWeightKg)}
        </span>
      ),
    },
    {
      accessorKey: "quotedTotal",
      id: "quotedTotal",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Freight" />,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums text-foreground">
          {row.original.quotedTotal
            ? formatMoney(row.original.quotedTotal, row.original.currency)
            : "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      id: "status",
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status] ?? {
          label: row.original.status,
          className: "bg-secondary text-secondary-foreground border-border",
        };
        return (
          <Badge variant="outline" className={`text-[11px] font-medium ${cfg.className}`}>
            {cfg.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "bookedAt",
      id: "bookedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Booked At" />,
      cell: ({ row }) => {
        const bookedAt = row.original.bookedAt;
        return (
          <div className="whitespace-nowrap text-xs text-muted-foreground">
            {bookedAt ? (
              <>
                <p>{formatDate(bookedAt)}</p>
                <p className="text-[10px]">{formatTime(bookedAt)}</p>
              </>
            ) : (
              "—"
            )}
          </div>
        );
      },
    },
  ];
}