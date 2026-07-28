import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Every skeleton here mirrors its real section 1:1 — same chrome, only the
// data-dependent bits are blocked out — so nothing reflows when real content
// lands.

export function TotalBadgeSkeleton() {
  return <Skeleton className="mt-1 h-6 w-20 rounded-full" />;
}

export function ShipmentStatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-12" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ShipmentsTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-full max-w-sm" />
          <Skeleton className="h-8 w-20" />
        </div>
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="rounded-md border">
        <div className="space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
