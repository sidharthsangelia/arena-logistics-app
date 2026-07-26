import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Placeholder for a DataTable that has no data to show yet: the route-level
 * loading.tsx, and the very first fetch of a table.
 *
 * It is deliberately never used for a refetch. Once rows exist, react-query's
 * keepPreviousData holds them on screen and DataTable dims them with its own
 * overlay, so filtering an already-loaded list never blanks out.
 */
export function DataTableSkeleton({
  columns = 6,
  rows = 8,
  withToolbar = false,
  withPagination = true,
}: {
  columns?: number;
  rows?: number;
  withToolbar?: boolean;
  withPagination?: boolean;
}) {
  return (
    <div className="space-y-4">
      {withToolbar && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-9 w-full sm:w-72" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-[150px]" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              {Array.from({ length: columns }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-3.5 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, r) => (
              <TableRow key={r} className={r % 2 !== 0 ? "bg-muted/10" : undefined}>
                {Array.from({ length: columns }).map((_, c) => (
                  <TableCell key={c}>
                    {/* Varied widths so the placeholder reads as text, not as bars. */}
                    <Skeleton
                      className="h-4"
                      style={{ width: `${50 + ((r + c * 3) % 5) * 11}%` }}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {withPagination && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-4 w-40" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-20" />
            <div className="flex gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-8" />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
