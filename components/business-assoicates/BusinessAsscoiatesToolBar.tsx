import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import BusinessAssociatesSearch from "./BusinessAssociatesSearch";
 

export default function BusinessAssociatesToolbar() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Always visible — no client hooks, no data dependency */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business Associates</h1>
        <p className="text-sm text-muted-foreground">
          Organisations operating on the platform across all plans.
        </p>
      </div>

      {/* Only this section suspends — useSearchParams lives inside BusinessAssociatesSearch */}
      <Suspense fallback={<Skeleton className="h-9 w-full rounded-md sm:w-[280px]" />}>
        <BusinessAssociatesSearch />
      </Suspense>
    </div>
  );
}