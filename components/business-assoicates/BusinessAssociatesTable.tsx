// components/business-assoicates/BusinessAssociatesTable.tsx
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
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Org } from "@/generated/prisma";
import OrgAvatar from "./OrgAvatar";
import PlanBadge from "./PlanBadge";
import BusinessAssociatesPagination from "./BusinessAssociatesPagination";
import { formatDate } from "@/lib/utils";

type OrgWithCounts = Org & {
  _count: { clients: number; quotes: number };
};

type Props = {
  orgs: OrgWithCounts[];
  page: number;
  total: number;
  pageSize: number;
  query: string;
  type: string;
};

export default function BusinessAssociatesTable({
  orgs,
  page,
  total,
  pageSize,
  query,
  type,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
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
                <TableHead className="text-xs uppercase tracking-wide">
                  <Tooltip>
                    <TooltipTrigger className="cursor-default">
                      Status
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Business Associate status grants access to the /clients
                      route and a reduced markup. Skip Payment bypasses wallet
                      checks on shipments.
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
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
              {orgs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {query || type !== "all"
                      ? "No business associates match your filters."
                      : "No business associates found."}
                  </TableCell>
                </TableRow>
              ) : (
                orgs.map((org) => (
                  <TableRow key={org.id} className="group">
                    <TableCell className="font-medium">
                      <Link
                        href={`/arena-dashboard/business-associates/${org.id}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <OrgAvatar
                          name={org.name}
                          logoUrl={org.logoUrl}
                          className="h-8 w-8"
                        />
                        <span className="flex flex-col">
                          <span>{org.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {org.slug}
                          </span>
                        </span>
                      </Link>
                    </TableCell>

                    <TableCell>
                      <PlanBadge plan={org.plan} />
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {org.isBusinessAssociate ? (
                          <Badge variant="secondary">
                            Business Associate
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            Standard
                          </Badge>
                        )}
                        {org.skipPayment && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline">Skip Payment</Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Shipments for this org bypass wallet/payment
                              checks.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-right text-muted-foreground">
                      {org.markupPercent.toNumber().toFixed(2)}%
                    </TableCell>

                    <TableCell className="text-right text-muted-foreground">
                      {org._count.clients}
                    </TableCell>

                    <TableCell className="text-right text-muted-foreground">
                      {org._count.quotes}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {formatDate(org.createdAt)}
                    </TableCell>

                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

      <BusinessAssociatesPagination
        page={page}
        totalPages={totalPages}
        searchParams={{
          q: query || undefined,
          type: type !== "all" ? type : undefined,
        }}
      />
    </div>
  );
}