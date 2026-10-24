import "server-only";

import { Skeleton } from "@/components/ui/skeleton";
import type { ShipmentStatus } from "@/generated/prisma";
import { getShipmentLiveTracking } from "@/lib/services/shipmentLiveTracking.service";
import {
  deriveCarrierStatus,
  isCarrierSyncEligible,
  shouldAdvance,
} from "@/lib/tracking/carrierStatus";
import type { TrackingScope } from "@/lib/tracking/shipmentResolve";
import {
  ShipmentHistoryTimeline,
  type HistoryEntry,
} from "./ShipmentHistoryTimeline";

/**
 * The History block on a shipment detail page: our status changes merged with
 * the carrier's scans.
 *
 * Render it inside its own <Suspense fallback={<ShipmentHistorySkeleton />}>,
 * under a static heading the page owns. The carrier call (cached 15 min, 10s
 * deadline; see shipmentLiveTracking.service.ts) holds up only this block.
 *
 * `scope` must come from the page's own authorisation: the tenant page passes
 * the org it already scoped the shipment to, the ops pages pass arena.
 */
export async function ShipmentHistory({
  shipmentNumber,
  scope,
  currentStatus,
  bookedAt,
  createdAt,
  history,
}: {
  shipmentNumber: string;
  scope: TrackingScope;
  currentStatus: ShipmentStatus;
  /** With createdAt, decides whether scans may move this shipment at all. */
  bookedAt: Date | null;
  createdAt: Date;
  history: Array<{
    id: string;
    fromStatus: ShipmentStatus | null;
    toStatus: ShipmentStatus;
    note: string | null;
    createdAt: Date;
    changedByType: string;
  }>;
}) {
  const live = await getShipmentLiveTracking(shipmentNumber, scope);

  // Rendering cannot write, so the panel is told to ask for the sync. Only
  // when the scans would actually move the status or raise an alert; on every
  // other view no action fires at all.
  const verdict =
    live.state === "ok" && isCarrierSyncEligible(bookedAt, createdAt)
      ? deriveCarrierStatus(live.events)
      : null;
  const needsSync =
    !!verdict &&
    (shouldAdvance(currentStatus, verdict.target) || !!verdict.problem);

  const entries: HistoryEntry[] = history.map((h) => ({
    id: h.id,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    note: h.note,
    createdAt: h.createdAt.toISOString(),
    changedByType: h.changedByType,
  }));

  return (
    <ShipmentHistoryTimeline
      // A refresh or sync re-renders the page; a new fetch time or a new
      // history row remounts the panel on the fresh answer.
      key={`${live.fetchedAt}:${entries.length}`}
      shipmentNumber={shipmentNumber}
      history={entries}
      initial={live}
      needsSync={needsSync}
      variant={scope.kind === "arena" ? "ops" : "customer"}
    />
  );
}

/** Mirrors the resting layout: carrier line + Refresh, then timeline rows. */
export function ShipmentHistorySkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-7 w-22" />
      </div>
      <div className="space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="mt-1 h-1.75 w-1.75 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
