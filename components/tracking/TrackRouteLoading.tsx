import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { TRACK_PAGE, TrackEmptyState, TrackHeader } from "./trackParts";

/**
 * Route-level fallback for /track and /arena-dashboard/track. Tracking reads
 * nothing until a number is submitted, so this only covers the view's chunk
 * arriving, and the page it stands in for is the empty state.
 *
 * Header and empty state are the real components (trackParts.tsx), so the copy
 * cannot drift. Only the search input, where the form mounts, is a skeleton.
 * The Track button renders as the real page first shows it: disabled, because
 * the box is empty.
 */
export function TrackRouteLoading() {
  return (
    <div className={TRACK_PAGE} aria-busy="true">
      <TrackHeader />

      <div className="flex gap-2 mb-6">
        <Skeleton className="h-8 flex-1 rounded-lg" />
        <Button disabled tabIndex={-1} aria-hidden className="shrink-0">
          Track
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>

      <TrackEmptyState />
    </div>
  );
}
