// lib/accounts/columnLayout.ts
//
// How wide each column of the Accounts table is, and at which breakpoint it
// stops being shown.
//
// Pure module with no imports so both the client table and the server-rendered
// skeleton can read it. That matters more here than it looks: a skeleton whose
// columns are a different width from the table it stands in for produces a
// visible jolt the moment the data lands, which is exactly the sluggishness the
// skeleton was added to hide.
//
// THE RULE THE WIDTHS FOLLOW
// The table is laid out `table-fixed` and never scrolls sideways, so the columns
// have to give way instead. They drop in order of how much they describe the
// account rather than identify it:
//
//   below xl   contact, wallet          long strings, first to squeeze
//   below lg   signup status, markup
//   below md   type, joined
//   always     account, shipments, actions
//
// Percentages are of the table, and they are allowed not to sum to 100 at every
// breakpoint. Once columns are hidden the browser distributes what is left
// proportionally, which is the behaviour we want.

type ColumnLayout = {
  /** Applied to the <th>: width plus responsive visibility. */
  head: string;
  /** Applied to every <td>: the same visibility, plus alignment and truncation. */
  cell: string;
};

export const ACCOUNT_COLUMN_LAYOUT = {
  account: {
    head: "w-[34%] sm:w-[30%] lg:w-[22%]",
    cell: "font-medium",
  },
  contact: {
    head: "hidden w-[20%] xl:table-cell",
    cell: "hidden xl:table-cell text-sm text-muted-foreground",
  },
  type: {
    head: "hidden w-[14%] md:table-cell",
    cell: "hidden md:table-cell",
  },
  health: {
    head: "hidden w-[16%] lg:table-cell",
    cell: "hidden lg:table-cell",
  },
  shipments: {
    head: "w-[12%] text-right sm:w-[10%]",
    cell: "text-right tabular-nums text-muted-foreground",
  },
  markup: {
    head: "hidden w-[9%] text-right lg:table-cell",
    cell: "hidden lg:table-cell text-right tabular-nums text-muted-foreground",
  },
  wallet: {
    head: "hidden w-[12%] text-right xl:table-cell",
    cell: "hidden xl:table-cell text-right tabular-nums text-muted-foreground",
  },
  joined: {
    head: "hidden w-[13%] md:table-cell",
    cell: "hidden md:table-cell text-muted-foreground",
  },
  actions: {
    head: "w-12",
    cell: "text-right",
  },
} as const satisfies Record<string, ColumnLayout>;

export type AccountColumnId = keyof typeof ACCOUNT_COLUMN_LAYOUT;

/**
 * The columns in render order, for a given viewer. The skeleton walks this so it
 * renders the same number of cells, in the same order, at the same widths as the
 * table it precedes.
 */
export function accountColumnOrder(canSeeMoney: boolean): AccountColumnId[] {
  return [
    "account",
    "contact",
    "type",
    "health",
    "shipments",
    ...(canSeeMoney ? (["markup", "wallet"] as const) : []),
    "joined",
    "actions",
  ];
}
