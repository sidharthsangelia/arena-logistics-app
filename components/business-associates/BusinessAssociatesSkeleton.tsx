// components/business-associates/BusinessAssociatesSkeleton.tsx
//
// Shaped to BusinessAssociatesTable, including whether the markup column is
// there, so an admin and a member each get a skeleton the width of the table
// they are about to be shown.

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SKELETON_ROWS = 8;

export default function BusinessAssociatesSkeleton({
  canSeeMoney,
  rows = SKELETON_ROWS,
}: {
  canSeeMoney: boolean;
  rows?: number;
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
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
                  Markup
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
            {Array.from({ length: rows }).map((_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </TableCell>

                {canSeeMoney && (
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-4 w-14" />
                  </TableCell>
                )}

                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-8" />
                </TableCell>

                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-8" />
                </TableCell>

                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>

                <TableCell>
                  <Skeleton className="h-4 w-4" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
    </div>
  );
}
