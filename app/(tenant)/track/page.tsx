"use client";

import { useState, useTransition } from "react";
import {
  MapPin, Package, CheckCircle2, AlertCircle, Truck,
  ArrowRight, Loader2, RotateCcw, Box, Navigation,
  Search, CalendarDays, Weight, Layers, Globe, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { trackShipmentAction } from "@/actions/tracking/tracking.actions";
import type {
  CanonicalTrackResult,
  TrackingEvent,
  TrackingEventType,
} from "@/lib/tracking-adapters/core/tracking.types";

// ─── Event type configuration ─────────────────────────────────────────────────
// Color is used only in two places: (1) the status badge on the hero card,
// and (2) the dot for the latest event on the timeline. Everything else is
// neutral — Tailwind foreground/muted-foreground/border defaults only.

interface EventConfig {
  label:     string;
  icon:      React.ElementType;
  // Tailwind classes for the latest-event dot in the timeline
  dotClass:  string;
  // Tailwind classes for the status badge pill
  badgeClass: string;
}

const EVENT_CONFIG: Record<TrackingEventType, EventConfig> = {
  booked: {
    label:     "Booked",
    icon:      Box,
    dotClass:  "border-border bg-muted text-foreground",
    badgeClass:"bg-secondary text-secondary-foreground border-transparent",
  },
  picked_up: {
    label:     "Picked Up",
    icon:      Package,
    dotClass:  "border-blue-400 bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
    badgeClass:"bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  },
  in_transit: {
    label:     "In Transit",
    icon:      Truck,
    dotClass:  "border-sky-400 bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    badgeClass:"bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800",
  },
  out_for_delivery: {
    label:     "Out for Delivery",
    icon:      Navigation,
    dotClass:  "border-violet-400 bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
    badgeClass:"bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800",
  },
  delivered: {
    label:     "Delivered",
    icon:      CheckCircle2,
    dotClass:  "border-emerald-400 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    badgeClass:"bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  },
  attempted: {
    label:     "Delivery Attempted",
    icon:      AlertCircle,
    dotClass:  "border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    badgeClass:"bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  },
  exception: {
    label:     "Exception",
    icon:      AlertCircle,
    dotClass:  "border-red-400 bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    badgeClass:"bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  },
  returned: {
    label:     "Returned",
    icon:      RotateCcw,
    dotClass:  "border-red-400 bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    badgeClass:"bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  },
  unknown: {
    label:     "Update",
    icon:      Clock,
    dotClass:  "border-border bg-background text-muted-foreground",
    badgeClass:"bg-secondary text-secondary-foreground border-transparent",
  },
};

// ─── Progress stages ──────────────────────────────────────────────────────────
// Five canonical stages for an international air shipment.
// Exceptions / returns don't map cleanly here — the tracker shows progress
// up to the last known normal stage, with the alert badge doing the rest.

type NormalStage = "booked" | "picked_up" | "in_transit" | "out_for_delivery" | "delivered";

interface Stage {
  type:       NormalStage;
  shortLabel: string;
  icon:       React.ElementType;
}

const STAGES: Stage[] = [
  { type: "booked",           shortLabel: "Booked",    icon: Box         },
  { type: "picked_up",        shortLabel: "Collected", icon: Package     },
  { type: "in_transit",       shortLabel: "In Transit",icon: Truck       },
  { type: "out_for_delivery", shortLabel: "Dispatched",icon: Navigation  },
  { type: "delivered",        shortLabel: "Delivered", icon: CheckCircle2},
];

const STAGE_INDEX: Partial<Record<TrackingEventType, number>> = {
  booked: 0, picked_up: 1, in_transit: 2, out_for_delivery: 3, delivered: 4,
};

function getReachedStageIndex(events: CanonicalTrackResult["events"]): number {
  let max = -1;
  for (const e of events) {
    const idx = STAGE_INDEX[e.eventType];
    if (idx !== undefined && idx > max) max = idx;
  }
  return max;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit",
  });
}

function formatGroupLabel(iso: string): string {
  const d = new Date(iso);
  const today     = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString())     return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ─── ProgressTracker ─────────────────────────────────────────────────────────

function ProgressTracker({ result }: { result: CanonicalTrackResult }) {
  const reachedIdx = getReachedStageIndex(result.events);
  const latestType = result.latestEvent?.eventType;
  const isAlert    = latestType && ["exception", "returned", "attempted"].includes(latestType);

  return (
    <div className="flex items-start">
      {STAGES.map((stage, i) => {
        const Icon      = stage.icon;
        const completed = i <= reachedIdx;
        const isLast    = i === STAGES.length - 1;
        const lineActive= i < reachedIdx;

        return (
          <div key={stage.type} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center min-w-0">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center border-2 transition-colors shrink-0",
                  completed && !isAlert && "bg-foreground border-foreground text-background",
                  completed && isAlert  && "bg-amber-500 border-amber-500 text-white",
                  !completed            && "border-border bg-background text-muted-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className={cn(
                "text-[10px] mt-1.5 text-center leading-tight whitespace-nowrap",
                completed ? "font-semibold text-foreground" : "text-muted-foreground",
              )}>
                {stage.shortLabel}
              </p>
            </div>
            {!isLast && (
              <div className={cn(
                "h-0.5 flex-1 mx-1.5 mb-[22px] rounded-full transition-colors",
                lineActive ? "bg-foreground" : "bg-border",
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ eventType }: { eventType: TrackingEventType }) {
  const { icon: Icon, label, badgeClass } = EVENT_CONFIG[eventType];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border whitespace-nowrap",
        badgeClass,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ─── ShipmentHeroCard ────────────────────────────────────────────────────────

function ShipmentHeroCard({ result }: { result: CanonicalTrackResult }) {
  const { shipmentInfo, latestEvent, vendorName } = result;

  const metaItems = [
    shipmentInfo.weight !== undefined && {
      icon: Weight, label: "Weight",
      value: `${shipmentInfo.weight} kg`,
    },
    shipmentInfo.numberOfPieces !== undefined && {
      icon: Layers, label: "Pieces",
      value: String(shipmentInfo.numberOfPieces),
    },
    shipmentInfo.shipDate && {
      icon: CalendarDays, label: "Shipped",
      value: formatDate(shipmentInfo.shipDate),
    },
    shipmentInfo.destination && {
      icon: Globe, label: "Destination",
      value: shipmentInfo.destination,
    },
  ].filter(Boolean) as { icon: React.ElementType; label: string; value: string }[];

  return (
    <Card>
      <CardHeader className="pb-5">
        {/* AWB + badge row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Airway Bill
            </p>
            <p className="text-2xl font-bold font-mono tracking-wider">
              {shipmentInfo.awb}
            </p>
            <p className="text-sm text-muted-foreground">
              {shipmentInfo.service ?? vendorName}
            </p>
          </div>
          {latestEvent && (
            <StatusBadge eventType={latestEvent.eventType} />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-0">
        {/* 5-stage progress indicator */}
        <ProgressTracker result={result} />

        {/* Metadata grid */}
        {metaItems.length > 0 && (
          <>
            <Separator />
            <div className={cn(
              "grid gap-4",
              metaItems.length <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4",
            )}>
              {metaItems.map(({ icon: Icon, label, value }) => (
                <div key={label} className="space-y-0.5">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Icon className="h-3 w-3" />
                    {label}
                  </p>
                  <p className="text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Latest update — the most prominent read for ops/customer */}
        {latestEvent && (
          <>
            <Separator />
            <div className="rounded-lg border bg-muted/30 px-4 py-3.5 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Latest Update
              </p>
              <p className="text-base font-semibold leading-snug">
                {latestEvent.status}
              </p>
              {latestEvent.location && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm">{latestEvent.location}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {formatDate(latestEvent.timestamp)} · {formatTime(latestEvent.timestamp)}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── EventRow ─────────────────────────────────────────────────────────────────
// Typography contract:
//   status      → font-semibold text-sm (what happened — primary)
//   location    → text-sm (where — important secondary)
//   description → text-xs text-muted-foreground (supplementary detail)
//   timestamp   → text-xs text-muted-foreground (genuinely secondary — knowing
//                 it's 09:42 is less urgent than WHERE and WHAT)

interface EventRowProps {
  event:    TrackingEvent;
  isLatest: boolean; // globally the newest event — gets colored dot
  isLast:   boolean; // globally oldest event — no connector below
}

function EventRow({ event, isLatest, isLast }: EventRowProps) {
  const { icon: EventIcon, dotClass } = EVENT_CONFIG[event.eventType];

  const showDescription =
    event.description &&
    event.description !== event.status &&
    event.description !== event.location;

  return (
    <div className="flex gap-3">
      {/* Spine */}
      <div className="flex flex-col items-center shrink-0 pt-0.5">
        <div
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center border-2 shrink-0 transition-colors",
            isLatest
              ? dotClass
              : "border-border bg-background text-muted-foreground",
          )}
        >
          <EventIcon className="h-3.5 w-3.5" />
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-border mt-1" style={{ minHeight: 20 }} />
        )}
      </div>

      {/* Content */}
      <div className={cn("flex-1 min-w-0", isLast ? "pb-0" : "pb-5")}>
        {/* Status — primary */}
        <p className={cn(
          "text-sm font-semibold leading-snug",
          isLatest && "text-base",
        )}>
          {event.status}
        </p>

        {/* Location — secondary but concrete */}
        {event.location && (
          <div className="flex items-center gap-1 mt-1">
            <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
            <p className="text-sm">{event.location}</p>
          </div>
        )}

        {/* Description — genuinely supplementary */}
        {showDescription && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {event.description}
          </p>
        )}

        {/* Timestamp — small, at the bottom */}
        <p className="text-xs text-muted-foreground mt-1.5">
          {formatTime(event.timestamp)}
        </p>
      </div>
    </div>
  );
}

// ─── TrackingTimeline ────────────────────────────────────────────────────────
// Events arrive newest-first. Groups are rendered top-to-bottom (most recent
// date at the top). Within each group, events are also newest-first. Only
// the globally-first event (index 0) gets the colored dot.

interface GroupedEvent extends TrackingEvent {
  globalIdx: number;
}

interface EventGroup {
  dateKey: string;
  label:   string;
  events:  GroupedEvent[];
}

function TrackingTimeline({
  events,
  vendorName,
}: {
  events:     CanonicalTrackResult["events"];
  vendorName: string;
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <Package className="h-7 w-7 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">No events yet.</p>
      </div>
    );
  }

  // Build date groups
  const groups: EventGroup[] = [];
  events.forEach((event, idx) => {
    const dateKey = new Date(event.timestamp).toDateString();
    const last    = groups[groups.length - 1];
    if (last && last.dateKey === dateKey) {
      last.events.push({ ...event, globalIdx: idx });
    } else {
      groups.push({
        dateKey,
        label:  formatGroupLabel(event.timestamp),
        events: [{ ...event, globalIdx: idx }],
      });
    }
  });

  const total = events.length;

  return (
    <div className="space-y-6">
      {groups.map((group, gIdx) => (
        <div key={group.dateKey}>
          {/* Date divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1 bg-border" />
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
              {group.label}
            </p>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Events in group */}
          {group.events.map((event) => (
            <EventRow
              key={`${event.timestamp}-${event.globalIdx}`}
              event={event}
              isLatest={event.globalIdx === 0}
              isLast={event.globalIdx === total - 1}
            />
          ))}
        </div>
      ))}

      {/* Footer attribution */}
      <p className="text-xs text-muted-foreground text-center pt-1">
        Data via {vendorName}
      </p>
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="rounded-full border-2 border-dashed border-border p-5 mb-4">
        <Search className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-semibold mb-1">Enter an AWB number</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        Paste or type an airway bill number above to pull live delivery updates
        from the carrier.
      </p>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-label="Loading tracking data">
      {/* Hero card */}
      <Card>
        <CardHeader className="pb-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-7 w-44 rounded bg-muted" />
              <div className="h-4 w-28 rounded bg-muted" />
            </div>
            <div className="h-7 w-24 rounded-md bg-muted" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-0">
          {/* Progress bar */}
          <div className="flex items-start gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                {i < 4 && <div className="h-0.5 flex-1 mx-1.5 bg-muted" />}
              </div>
            ))}
          </div>
          <Separator />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-12 rounded bg-muted" />
                <div className="h-4 w-16 rounded bg-muted" />
              </div>
            ))}
          </div>
          <Separator />
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-5 w-48 rounded bg-muted" />
            <div className="h-4 w-36 rounded bg-muted" />
            <div className="h-3 w-28 rounded bg-muted" />
          </div>
        </CardContent>
      </Card>

      {/* Timeline card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="h-5 w-36 rounded bg-muted" />
        </CardHeader>
        <CardContent className="space-y-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-1.5 pt-0.5">
                <div className="h-4 w-48 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
                <div className="h-3 w-20 rounded bg-muted" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── TrackPage ───────────────────────────────────────────────────────────────

export default function TrackPage() {
  const [awb, setAwb]           = useState("");
  const [result, setResult]     = useState<CanonicalTrackResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [isPending, start]      = useTransition();

  function handleTrack() {
    const trimmed = awb.trim();
    if (!trimmed) return;
    setError(null);

    start(async () => {
      const res = await trackShipmentAction({ awb: trimmed });

      if (!res.success || !res.data?.result) {
        setResult(null);
        setError(
          res.validationError ??
          res.data?.error?.message ??
          "No tracking information found for this AWB number.",
        );
        return;
      }

      setResult(res.data.result);
    });
  }

  function handleReset() {
    setAwb("");
    setResult(null);
    setError(null);
  }

  const hasResult = !isPending && !!result;
  const hasError  = !isPending && !!error;
  const isEmpty   = !result && !error && !isPending;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Track Shipment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter an AWB number to see real-time delivery updates.
        </p>
      </div>

      {/* ── Search bar ───────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={awb}
            onChange={(e) => setAwb(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTrack()}
            placeholder="AWB / tracking number"
            className="pl-9 font-mono"
            disabled={isPending}
            aria-label="AWB number"
          />
        </div>
        <Button
          onClick={handleTrack}
          disabled={isPending || !awb.trim()}
          className="shrink-0"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Track
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </>
          )}
        </Button>
        {(result || error) && !isPending && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleReset}
            aria-label="Clear search"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* ── Loading ──────────────────────────────────────────────────── */}
      {isPending && <LoadingSkeleton />}

      {/* ── Error ────────────────────────────────────────────────────── */}
      {hasError && (
        <Card className="border-destructive/40">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">
                  Tracking failed
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {isEmpty && <EmptyState />}

      {/* ── Result ───────────────────────────────────────────────────── */}
      {hasResult && (
        <div className="space-y-4">
          {/* Hero card: AWB, status badge, 5-stage progress, metadata, latest update */}
          <ShipmentHeroCard result={result} />

          {/* Timeline card */}
          <Card>
            <CardHeader className="pb-0 pt-5 px-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Tracking History</p>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {result.events.length} event{result.events.length !== 1 ? "s" : ""}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-5 px-6 pb-6">
              <TrackingTimeline
                events={result.events}
                vendorName={result.vendorName}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}