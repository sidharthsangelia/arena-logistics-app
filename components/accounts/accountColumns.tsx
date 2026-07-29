"use client";

// components/accounts/accountColumns.tsx
//
// Column definitions for the Accounts table.
//
// What each column renders. How wide it is and when it hides live next door in
// lib/accounts/columnLayout.ts, which the skeleton reads too, so the placeholder
// and the real thing cannot end up different widths.
//
// The layout classes reach the DOM through `meta`: headerClassName onto the
// <th>, cellClassName onto every <td>, applied once by AccountsTable rather
// than repeated in each cell.

import Link from "next/link";
import type { ColumnDef, RowData } from "@tanstack/react-table";

import OrgAvatar from "@/components/accounts/OrgAvatar";
import AccountTypeBadge from "@/components/accounts/AccountTypeBadge";
import SignupHealth from "@/components/accounts/SignupHealth";
import AccountRowActions from "@/components/accounts/AccountRowActions";
import AccountsSortableHeader from "@/components/accounts/AccountsSortableHeader";
import type { AccountRow } from "@/queries/accounts";
import {
  ACCOUNTS_BASE_PATH,
  type AccountFilters,
} from "@/lib/accounts/filters";
import { ACCOUNT_COLUMN_LAYOUT } from "@/lib/accounts/columnLayout";
import { formatDate, formatInr } from "@/lib/utils";

// TanStack ships ColumnMeta as an empty interface precisely so applications can
// widen it. The type parameters have to be restated to match the original
// declaration even though neither is used here.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Applied to the <th>. Carries the width and the responsive visibility. */
    headerClassName?: string;
    /** Applied to every <td> in the column. */
    cellClassName?: string;
  }
}

type Options = {
  filters: AccountFilters;
  /** Arena admins only. Adds the markup and wallet columns. */
  canSeeMoney: boolean;
  /** Arena admins only. Adds the per-row promote and demote menu. */
  canManage: boolean;
};

export function getAccountColumns({
  filters,
  canSeeMoney,
  canManage,
}: Options): ColumnDef<AccountRow>[] {
  const columns: ColumnDef<AccountRow>[] = [
    {
      id: "account",
      meta: {
        headerClassName: ACCOUNT_COLUMN_LAYOUT.account.head,
        cellClassName: ACCOUNT_COLUMN_LAYOUT.account.cell,
      },
      header: () => (
        <AccountsSortableHeader title="Account" field="name" filters={filters} />
      ),
      cell: ({ row }) => (
        // min-w-0 on the flex child is what lets the name truncate. Without it a
        // flex item refuses to shrink below its content and pushes the table wide.
        <Link
          href={`${ACCOUNTS_BASE_PATH}/${row.original.id}`}
          className="flex items-center gap-3 hover:underline"
          title={row.original.name}
        >
          <OrgAvatar
            name={row.original.name}
            logoUrl={row.original.logoUrl}
            className="h-8 w-8 shrink-0"
          />
          <span className="min-w-0 truncate">{row.original.name}</span>
        </Link>
      ),
    },
    {
      id: "contact",
      meta: {
        headerClassName: ACCOUNT_COLUMN_LAYOUT.contact.head,
        cellClassName: ACCOUNT_COLUMN_LAYOUT.contact.cell,
      },
      header: () => "Contact",
      cell: ({ row }) => {
        const { contactName, email } = row.original;

        if (!contactName && !email) {
          return <span className="text-xs">Not provided</span>;
        }

        return (
          <span className="flex min-w-0 flex-col">
            {contactName && (
              <span className="truncate text-foreground" title={contactName}>
                {contactName}
              </span>
            )}
            {email && (
              <span className="truncate text-xs" title={email}>
                {email}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: "type",
      meta: {
        headerClassName: ACCOUNT_COLUMN_LAYOUT.type.head,
        cellClassName: ACCOUNT_COLUMN_LAYOUT.type.cell,
      },
      header: () => "Type",
      cell: ({ row }) => (
        <AccountTypeBadge
          isBusinessAssociate={row.original.isBusinessAssociate}
          skipPayment={row.original.skipPayment}
        />
      ),
    },
    {
      id: "health",
      meta: {
        headerClassName: ACCOUNT_COLUMN_LAYOUT.health.head,
        cellClassName: ACCOUNT_COLUMN_LAYOUT.health.cell,
      },
      header: () => "Signup status",
      cell: ({ row }) => (
        <SignupHealth
          profileCompletedAt={row.original.profileCompletedAt}
          verifiedKycCount={row.original.verifiedKycCount}
          shipmentCount={row.original.shipmentCount}
        />
      ),
    },
    {
      id: "shipments",
      meta: {
        headerClassName: ACCOUNT_COLUMN_LAYOUT.shipments.head,
        cellClassName: ACCOUNT_COLUMN_LAYOUT.shipments.cell,
      },
      header: () => (
        <AccountsSortableHeader
          title="Shipments"
          field="shipments"
          filters={filters}
          align="right"
        />
      ),
      cell: ({ row }) => row.original.shipmentCount,
    },
  ];

  if (canSeeMoney) {
    columns.push(
      {
        id: "markup",
        meta: {
          headerClassName: ACCOUNT_COLUMN_LAYOUT.markup.head,
          cellClassName: ACCOUNT_COLUMN_LAYOUT.markup.cell,
        },
        header: () => "Markup",
        cell: ({ row }) =>
          row.original.markupPercent === null
            ? null
            : `${row.original.markupPercent.toFixed(2)}%`,
      },
      {
        id: "wallet",
        meta: {
          headerClassName: ACCOUNT_COLUMN_LAYOUT.wallet.head,
          cellClassName: ACCOUNT_COLUMN_LAYOUT.wallet.cell,
        },
        header: () => "Wallet",
        cell: ({ row }) =>
          row.original.walletBalance === null
            ? null
            : formatInr(row.original.walletBalance),
      },
    );
  }

  columns.push({
    id: "joined",
    meta: {
      headerClassName: ACCOUNT_COLUMN_LAYOUT.joined.head,
      cellClassName: ACCOUNT_COLUMN_LAYOUT.joined.cell,
    },
    header: () => (
      <AccountsSortableHeader title="Joined" field="joined" filters={filters} />
    ),
    cell: ({ row }) => formatDate(row.original.createdAt),
  });

  columns.push({
    id: "actions",
    meta: {
      headerClassName: ACCOUNT_COLUMN_LAYOUT.actions.head,
      cellClassName: ACCOUNT_COLUMN_LAYOUT.actions.cell,
    },
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) =>
      canManage ? (
        <AccountRowActions
          orgId={row.original.id}
          orgName={row.original.name}
          isBusinessAssociate={row.original.isBusinessAssociate}
          markupPercent={row.original.markupPercent}
        />
      ) : null,
  });

  return columns;
}
