// components/accounts/AccountsSkeletons.tsx
//
// Fallbacks for the two Suspense boundaries on the Accounts list.
//
// These are shaped to the real thing, not to a generic grey block: the same
// columns, the same widths, the same breakpoints, the same row height. When the
// data lands it lands in place and nothing jumps. A skeleton that is the wrong
// shape is worse than no skeleton, because the reflow is the part people notice.
//
// The widths and the responsive classes come from lib/accounts/columnLayout.ts,
// the same module AccountsTable builds its columns from, so this cannot fall out
// of step with the table as columns are added or reordered. `canSeeMoney` is
// taken for the same reason: a member gets the seven column table, so a member
// gets the seven column skeleton.

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_COLUMN_LAYOUT,
  accountColumnOrder,
  type AccountColumnId,
} from "@/lib/accounts/columnLayout";

/** Enough rows to fill the fold without pretending to know the real count. */
const SKELETON_ROWS = 8;

export function AccountsSummarySkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-4 w-36" />
    </div>
  );
}

export function AccountsTableSkeleton({
  canSeeMoney,
  rows = SKELETON_ROWS,
}: {
  canSeeMoney: boolean;
  rows?: number;
}) {
  const columns = accountColumnOrder(canSeeMoney);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table
          className="table-fixed"
          containerClassName="overflow-x-clip rounded-lg"
        >
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {columns.map((column) => (
                <TableHead
                  key={column}
                  className={cn(
                    "text-xs uppercase tracking-wide",
                    ACCOUNT_COLUMN_LAYOUT[column].head,
                  )}
                >
                  {COLUMN_HEADINGS[column]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {Array.from({ length: rows }).map((_, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell
                    key={column}
                    className={cn("overflow-hidden", ACCOUNT_COLUMN_LAYOUT[column].cell)}
                  >
                    <CellPlaceholder column={column} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
    </div>
  );
}

// Real headings rather than grey bars. They are known before the data is, so
// showing them means the table only has to fill in, never redraw.
const COLUMN_HEADINGS: Record<AccountColumnId, string> = {
  account: "Account",
  contact: "Contact",
  type: "Type",
  health: "Signup status",
  shipments: "Shipments",
  markup: "Markup",
  wallet: "Wallet",
  joined: "Joined",
  actions: "",
};

/** Each placeholder mimics the shape of the cell it stands in for. */
function CellPlaceholder({ column }: { column: AccountColumnId }) {
  switch (column) {
    case "account":
      return (
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-full max-w-32" />
        </div>
      );
    case "contact":
      return (
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-full max-w-28" />
          <Skeleton className="h-3 w-full max-w-40" />
        </div>
      );
    case "type":
      return <Skeleton className="h-5 w-32 rounded-full" />;
    case "health":
      return (
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      );
    case "shipments":
      return <Skeleton className="ml-auto h-4 w-8" />;
    case "markup":
      return <Skeleton className="ml-auto h-4 w-14" />;
    case "wallet":
      return <Skeleton className="ml-auto h-4 w-20" />;
    case "joined":
      return <Skeleton className="h-4 w-24" />;
    case "actions":
      return <Skeleton className="ml-auto h-8 w-8 rounded-md" />;
  }
}
