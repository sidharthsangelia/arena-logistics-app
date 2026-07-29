// components/business-associates/BusinessAssociatesTable.tsx
//
// Partner firms only. Every row here is by definition a business associate, so
// there is no type column: it would read "Business associate" all the way down.
//
// What replaces it is the thing that makes an associate different from any other
// account, which is that they carry clients of their own. Clients and quotes get
// columns here; the Accounts list, which is mostly standard accounts with no
// clients at all, leads with shipments instead.
//
// Rows are AccountRow, the same shape the Accounts list renders, from the same
// query with the type locked. Two views, one definition of an organisation.

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import LinkPagination from "@/components/data-table/LinkPagination";
import OrgAvatar from "@/components/accounts/OrgAvatar";
import PlanBadge from "@/components/accounts/PlanBadge";
import type { AccountRow } from "@/queries/accounts";
import type { AccountFilters } from "@/lib/accounts/filters";
import { formatDate } from "@/lib/utils";

export const BUSINESS_ASSOCIATES_BASE_PATH =
  "/arena-dashboard/business-associates";

type Props = {
  rows: AccountRow[];
  filters: AccountFilters;
  page: number;
  pageCount: number;
  totalRows: number;
  /** Carried across pagination links. Type is omitted: this route implies it. */
  searchParams: Record<string, string | undefined>;
  /** Arena admins only. Adds the markup column. */
  canSeeMoney: boolean;
  hasFilters: boolean;
};

export default function BusinessAssociatesTable({
  rows,
  filters,
  page,
  pageCount,
  totalRows,
  searchParams,
  canSeeMoney,
  hasFilters,
}: Props) {
  const firstRow = totalRows === 0 ? 0 : (page - 1) * filters.pageSize + 1;
  const lastRow = Math.min(page * filters.pageSize, totalRows);

  // Organisation, plan, clients, quotes, joined, chevron.
  const columnCount = 6 + (canSeeMoney ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <TooltipProvider delayDuration={200}>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="text-xs uppercase tracking-wide">
                  Organisation
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wide">
                  Plan
                </TableHead>

                {canSeeMoney && (
                  <TableHead className="text-right text-xs uppercase tracking-wide">
                    <Tooltip>
                      <TooltipTrigger className="cursor-default">
                        Markup
                      </TooltipTrigger>
                      <TooltipContent>
                        Percentage added on top of carrier rates for this
                        organisation&apos;s quotes.
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                )}

                <TableHead className="text-right text-xs uppercase tracking-wide">
                  Clients
                </TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide">
                  Quotes
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wide">
                  Joined
                </TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columnCount}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    {hasFilters
                      ? "No business associates match these filters."
                      : "No business associates yet. Promote an account from the Accounts list to add one."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id} className="group">
                    <TableCell className="font-medium">
                      {/* One detail page per organisation, so this points at
                          /accounts rather than a second copy under this route. */}
                      <Link
                        href={`/arena-dashboard/accounts/${row.id}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <OrgAvatar
                          name={row.name}
                          logoUrl={row.logoUrl}
                          className="h-8 w-8"
                        />
                        <span className="flex flex-col">
                          <span>{row.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.slug}
                          </span>
                        </span>
                      </Link>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PlanBadge plan={row.plan} />
                        {row.skipPayment && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline">Skip payment</Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Shipments for this account bypass wallet and
                              payment checks.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>

                    {canSeeMoney && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.markupPercent === null
                          ? "—"
                          : `${row.markupPercent.toFixed(2)}%`}
                      </TableCell>
                    )}

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.clientCount}
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.quoteCount}
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </TableCell>

                    <TableCell>
                      <ChevronRight
                        className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

      <LinkPagination
        basePath={BUSINESS_ASSOCIATES_BASE_PATH}
        page={page}
        pageCount={pageCount}
        searchParams={searchParams}
        summary={
          totalRows === 0
            ? "No business associates"
            : `Showing ${firstRow} to ${lastRow} of ${totalRows} ${
                totalRows === 1 ? "business associate" : "business associates"
              }`
        }
      />
    </div>
  );
}
