import { Skeleton } from "@/components/ui/skeleton";

/**
 * Tracking fetches nothing until the user submits an AWB, so the real page is
 * ready the moment its chunk lands. Header and empty state are static copy and
 * are rendered for real here — only the search row is skeletoned, because it is
 * interactive and pretending otherwise would invite a click that goes nowhere.
 */
export default function TrackLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Track Shipment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter an AWB number to see real-time delivery updates.
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-24 shrink-0 rounded-md" />
      </div>
    </div>
  );
}
