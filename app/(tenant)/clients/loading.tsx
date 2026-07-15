import { Skeleton } from "@/components/ui/skeleton";
import ClientsTableSkeleton from "@/components/clients/ClientTableSkeleton";

export default function ClientsLoading() {
  return (
    <>
      {/* Toolbar skeleton — heading is real (rendered by ClientsToolbar outside Suspense),
          so we only skeleton the right-hand actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Real heading — matches ClientsToolbar's static block exactly */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All Clients</h1>
          <p className="text-sm text-muted-foreground">
            Manage customer records and contact information.
          </p>
        </div>

        {/* Skeleton for search + action buttons only */}
        <div className="flex items-center gap-2">
          
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