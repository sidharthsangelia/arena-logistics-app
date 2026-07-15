"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import ClientRowActions from "@/components/clients/ClientRow";
import { formatDate } from "@/utils/format";
import { DataTableColumnHeader } from "@/components/data-table/DataTableColumnHeader";
import { ClientRow } from "@/queries/clients";
 

// Columns a user is allowed to hide via the "View" menu. Identity
// (companyName) and the row action column are always visible, so they're
// intentionally left out of this list.
export const CLIENT_TOGGLEABLE_COLUMNS: { id: string; label: string }[] = [
  { id: "orgName", label: "Business Associate" },
  { id: "contactName", label: "Contact" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "location", label: "Location" },
  { id: "createdAt", label: "Created" },
];

export function getClientColumns(): ColumnDef<ClientRow>[] {
  return [
    {
      accessorKey: "companyName",
      id: "companyName",
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Client" />,
      cell: ({ row }) => (
        <Link
          href={`/arena-dashboard/clients/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.companyName}
        </Link>
      ),
    },
    {
      id: "orgName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Business Associate" />
      ),
      cell: ({ row }) => (
        <Link
          href={`/arena-dashboard/business-associates/${row.original.org.id}`}
          className="block max-w-50 truncate text-muted-foreground hover:underline"
        >
          {row.original.org.name}
        </Link>
      ),
    },
    {
      accessorKey: "contactName",
      id: "contactName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Contact" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.contactName ?? "—"}</span>
      ),
    },
    {
      id: "email",
      header: "Email",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.email ?? "—"}</span>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.phone ?? "—"}</span>
      ),
    },
    {
      id: "location",
      header: "Location",
      enableSorting: false,
      cell: ({ row }) => {
        const location = [row.original.city, row.original.country].filter(Boolean).join(", ");
        return <span className="text-muted-foreground">{location || "—"}</span>;
      },
    },
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      enableSorting: false,
      header: "",
      cell: ({ row }) => (
        <div data-stop-propagation>
          <ClientRowActions client={row.original} />
        </div>
      ),
    },
  ];
}