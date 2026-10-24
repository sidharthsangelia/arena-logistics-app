"use client";

/**
 * SHIPMENT HISTORY TIMELINE
 * -----------------------------------------------------------------------------
 * One newest-first list on the shipment detail pages: our own status changes
 * and the carrier's scans, interleaved, each scan tagged with where it came
 * from. Used by the customer page and both ops pages; `variant` decides how
 * much of the audit detail shows.
 *
 * Status moves from the scans, but not here: this component cannot write while
 * the page renders. When the server saw scans ahead of the saved status it
 * passes `needsSync`, and this asks syncShipmentStatusAction once on mount,
 * then re-renders the page if the status moved. Refresh does the same after
 * re-asking the carrier.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/format";
import { formatEnumLabel } from "@/utils/helpers";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import type { ShipmentStatus } from "@/generated/prisma";
import {
  refreshShipmentTrackingAction,
  syncShipmentStatusAction,
} from "@/actions/tracking/tracking.actions";
import type { LiveTracking } from "@/lib/tracking/liveTracking.types";
import type { TrackingEvent } from "@/lib/tracking-adapters/core/tracking.types";

export interface HistoryEntry {
  id: string;
  fromStatus: ShipmentStatus | null;
  toStatus: ShipmentStatus;
  note: string | null;
  /** ISO string; Dates do not cross the server/client boundary intact. */
  createdAt: string;
  changedByType: string;
}

type Row =
  | { kind: "status"; at: string; entry: HistoryEntry }
  | { kind: "scan"; at: string; scan: TrackingEvent; index: number };

export function ShipmentHistoryTimeline({
  shipmentNumber,
  history,
  initial,
  needsSync,
  variant,
}: {
  shipmentNumber: string;
  history: HistoryEntry[];
  initial: LiveTracking;
  needsSync: boolean;
  variant: "customer" | "ops";
}) {
  const router = useRouter();
  const [live, setLive] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const synced = useRef(false);

  useEffect(() => {
    if (!needsSync || synced.current) return;
    synced.current = true;
    syncShipmentStatusAction({ shipmentNumber }).then((res) => {
      if (res.changed) router.refresh();
    });
  }, [needsSync, shipmentNumber, router]);

  function refresh() {
    setError(null);
    startTransition(async () => {
      const res = await refreshShipmentTrackingAction({ shipmentNumber });
      if (res.data) setLive(res.data);
      if (!res.success) setError(res.error ?? "Could not refresh tracking.");
      if (res.statusChanged) router.refresh();
    });
  }

  const rows: Row[] = [
    ...history.map((entry): Row => ({
      kind: "status",
      at: entry.createdAt,
      entry,
    })),
    ...live.events.map((scan, index): Row => ({
      kind: "scan",
      at: scan.timestamp,
      scan,
      index,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  // "Current" marks the newest of OUR rows; a later carrier scan above it is
  // not a status.
  const firstStatusId =
    rows.find((r): r is Extract<Row, { kind: "status" }> => r.kind === "status")
      ?.entry.id ?? null;
  const showLegTags =
    new Set(live.events.map((e) => e.legLabel).filter(Boolean)).size > 1;
  const legErrors =
    variant === "ops" || live.events.length > 0
      ? live.legs.filter((l) => l.error)
      : [];

  return (
    <div className="space-y-4">
      {live.state !== "no_waybill" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CarrierLine live={live} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={pending}
          >
            <RefreshCw className={cn(pending && "animate-spin")} />
            {pending ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {legErrors.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {legErrors.map((leg) => (
            <li key={`${leg.kind}-${leg.awb}`}>
              {leg.label}
              {leg.awb ? ` (${leg.awb})` : ""}: {leg.error}
            </li>
          ))}
        </ul>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No events recorded yet.</p>
      ) : (
        // Scrolls inside itself: an export can carry 20+ carrier scans, and
        // letting them all stack would stretch the whole page. The cap is a
        // max, so a short history still sits at its natural height.
        <div className="max-h-112 overflow-y-auto overscroll-contain pr-2">
          <div className="relative">
            {/* One vertical hairline threading the events together */}
            <div className="absolute bottom-3 left-0.75 top-2 w-px bg-border" />
            <ol>
              {rows.map((row) =>
                row.kind === "status" ? (
                  <StatusRow
                    key={`s-${row.entry.id}`}
                    entry={row.entry}
                    isCurrent={row.entry.id === firstStatusId}
                    variant={variant}
                  />
                ) : (
                  <ScanRow
                    key={`c-${row.index}`}
                    scan={row.scan}
                    isLatest={row.index === 0}
                    tag={
                      showLegTags ? (row.scan.legLabel ?? "Carrier") : "Carrier"
                    }
                  />
                ),
              )}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function CarrierLine({ live }: { live: LiveTracking }) {
  if (live.state === "unavailable") {
    return (
      <p className="text-xs text-muted-foreground">
        Carrier tracking unavailable right now.
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      {live.events.length === 0
        ? "No carrier scans yet. "
        : "Carrier scans included. "}
      <UpdatedAgo iso={live.fetchedAt} />
    </p>
  );
}

function StatusRow({
  entry,
  isCurrent,
  variant,
}: {
  entry: HistoryEntry;
  isCurrent: boolean;
  variant: "customer" | "ops";
}) {
  const cfg = STATUS_CONFIG[entry.toStatus];
  const label = cfg?.label ?? formatEnumLabel(entry.toStatus);
  return (
    <li className="relative pb-5 pl-5 last:pb-0">
      <span
        className={cn(
          "absolute left-0 top-1.5 h-1.75 w-1.75 rounded-full ring-2 ring-background",
          cfg?.dotClassName ?? "bg-muted-foreground/30",
        )}
      />
      <p
        className={cn("text-sm text-foreground", isCurrent && "font-semibold")}
      >
        {variant === "ops" &&
          entry.fromStatus &&
          entry.fromStatus !== entry.toStatus && (
            <span className="font-normal text-muted-foreground">
              {STATUS_CONFIG[entry.fromStatus]?.label ?? entry.fromStatus}{" "}
              →{" "}
            </span>
          )}
        {label}
        {isCurrent && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            Current
          </span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground/70">
        {formatDateTime(entry.createdAt)}
        {variant === "ops" && ` · by ${entry.changedByType.toLowerCase()}`}
      </p>
      {entry.note && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {entry.note}
        </p>
      )}
    </li>
  );
}

function ScanRow({
  scan,
  isLatest,
  tag,
}: {
  scan: TrackingEvent;
  isLatest: boolean;
  tag: string;
}) {
  return (
    <li className="relative pb-5 pl-5 last:pb-0">
      <span
        className={cn(
          "absolute left-0.5 top-2 h-0.75 w-0.75 rounded-full ring-2 ring-background",
          isLatest ? "bg-foreground" : "bg-muted-foreground/50",
        )}
      />
      <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-foreground">
        <span className={cn(isLatest && "font-medium")}>{scan.status}</span>
        <span className="rounded border px-1 py-px text-[10px] font-medium leading-none text-muted-foreground">
          {tag}
        </span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground/70">
        {[scan.location, formatDateTime(scan.timestamp)]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </li>
  );
}

/**
 * "Updated 5 min ago", ticking once a minute. Server and client render a few
 * hundred milliseconds apart, so the text can legitimately differ at a minute
 * boundary; hydration is told to accept that.
 */
function UpdatedAgo({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span suppressHydrationWarning>Updated {relativeTime(iso, now)}.</span>
  );
}

function relativeTime(iso: string, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDateTime(iso);
}
