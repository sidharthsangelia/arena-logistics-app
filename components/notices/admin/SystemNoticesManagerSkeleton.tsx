import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The waiting shape for SystemNoticesManager. Same toolbar (title, subtitle and a
 * "New notice" button) sitting above the same seven-column table, so when the real
 * rows land nothing shifts. Rendered inside the banner-mode Suspense boundary, which
 * keeps the header and mode switch above it on screen while only this area settles.
 */
export function SystemNoticesManagerSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-17.5">Live</TableHead>
              <TableHead className="min-w-70">Notice</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead>Window</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {Array.from({ length: rows }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-5 w-9 rounded-full" />
                </TableCell>

                <TableCell className="max-w-105">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3.5 w-full max-w-88" />
                    <Skeleton className="h-3.5 w-3/4 max-w-72" />
                  </div>
                </TableCell>

                <TableCell>
                  <Skeleton className="h-5 w-16 rounded-md" />
                </TableCell>

                <TableCell>
                  <Skeleton className="h-5 w-14 rounded-md" />
                </TableCell>

                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>

                <TableCell>
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Skeleton className="h-7 w-7 rounded-md" />
                    <Skeleton className="h-7 w-7 rounded-md" />
                    <Skeleton className="h-7 w-7 rounded-md" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
