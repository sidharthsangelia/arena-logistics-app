import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MAX_QUOTABLE_AGE_DAYS } from "@/lib/rateSweep/config";

/**
 * How old the quotable data is.
 *
 * The single most useful thing on the screen, so it is above the run history
 * rather than inside it. A table of green runs is not an answer to "can I quote
 * from this today": the runs could all be green and the last one five weeks ago.
 *
 * Colour is doing real work here and nothing decorative: amber means the grid
 * has aged past the point a quotation should be built from it. Everything else
 * on the page is neutral so that this stays the thing the eye lands on.
 */
export function FreshnessBanner({
  freshness,
}: {
  freshness: {
    lastGoodRunAt: string | null;
    ageDays: number | null;
    stale: boolean;
    totalSnapshots: number;
  };
}) {
  if (!freshness.lastGoodRunAt) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>No sweep has ever completed</AlertTitle>
        <AlertDescription>
          There is nothing stored to quote from. Run a sweep, or wait for the
          next scheduled one, before building a quotation sheet.
        </AlertDescription>
      </Alert>
    );
  }

  const when = new Date(freshness.lastGoodRunAt).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const age =
    freshness.ageDays === 0
      ? "today"
      : freshness.ageDays === 1
        ? "yesterday"
        : `${freshness.ageDays} days ago`;

  if (freshness.stale) {
    return (
      <Alert>
        <AlertTriangle className="size-4" />
        <AlertTitle>Rates are {age}, past the {MAX_QUOTABLE_AGE_DAYS}-day limit</AlertTitle>
        <AlertDescription>
          The last good sweep finished on {when}. The sweep runs every five days,
          so a gap this size means one was missed. Check the run history below
          before quoting anything from the stored grid.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <CheckCircle2 className="size-4" />
      <AlertTitle>Rates are current, last swept {age}</AlertTitle>
      <AlertDescription>
        {freshness.totalSnapshots.toLocaleString("en-IN")} vendor rates stored,
        newest from {when}. These are indicative and carry no markup. Bookings
        are always priced live.
      </AlertDescription>
    </Alert>
  );
}
