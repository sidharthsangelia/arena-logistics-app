import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
};

export default function BusinessAssociatesTable({
  orgs,
  page,
  total,
  pageSize,
  query,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs uppercase tracking-wide">Organisation</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Slug</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Plan</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Clients</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Quotes</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Joined</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {orgs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No business associates found.
                </TableCell>
              </TableRow>
            ) : (
              orgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/arena-dashboard/business-associates/${org.id}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <OrgAvatar name={org.name} logoUrl={org.logoUrl} className="h-8 w-8" />
                      {org.name}
                    </Link>
                  </TableCell>

                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {org.slug}
                  </TableCell>

                  <TableCell>
                    <PlanBadge plan={org.plan} />
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <BusinessAssociatesPagination page={page} totalPages={totalPages} query={query} />
    </div>
  );
}