// app/arena-dashboard/business-associates/loading.tsx

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

export default function BusinessAssociatesLoading() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Toolbar skeleton ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Business Associates
          </h1>
          <Skeleton className="h-4 w-40" />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Skeleton className="h-9 w-full sm:w-64" />
          <Skeleton className="h-9 w-full sm:w-44" />
        </div>
      </div>

      {/* ── Table skeleton ─────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="rounded-lg border">
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
                  Status
                </TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide">
                  Markup
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
              {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                      <span className="flex flex-col gap-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <Skeleton className="h-5 w-28 rounded-full" />
                    </div>
                  </TableCell>

                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-4 w-12" />
                  </TableCell>

                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-4 w-8" />
                  </TableCell>

                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-4 w-8" />
                  </TableCell>

                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>

                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </div>
    </div>
  );
}
