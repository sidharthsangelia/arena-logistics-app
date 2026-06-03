import { Skeleton } from "@/components/ui/skeleton";
import ClientsTableSkeleton from "@/components/clients/ClientTableSkeleton";

export default function ClientsLoading() {
  return (
    <>
      {/* Toolbar skeleton — mirrors ClientsToolbar layout */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-[280px] rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>

      {/* Table skeleton */}
      <ClientsTableSkeleton />
    </>
  );
}