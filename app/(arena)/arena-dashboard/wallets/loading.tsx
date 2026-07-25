import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Instant fallback for the wallets screen. Only the visible tab's query runs on
// the real page, so a single table-shaped skeleton covers every tab without
// guessing which one is open.
export default function ArenaWalletsLoading() {
  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 px-6 py-8">
      {/* Header + period select */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>

      {/* Tabs nav */}
      <div className="flex gap-1 border-b pb-px">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32 rounded-md" />
        ))}
      </div>

      {/* Summary tiles + table */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border">
        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="ml-auto h-9 w-24" />
        </div>
        {/* Rows */}
        <div className="space-y-3 p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
