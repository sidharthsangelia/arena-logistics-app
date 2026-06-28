"use client";

import { useState, useTransition } from "react";
import {
  MapPin,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  ArrowRight,
  Loader2,
  RotateCcw,
  Box,
  Navigation,
  Search,
  CalendarDays,
  Weight,
  Layers,
  Globe,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { trackShipmentAction } from "@/actions/tracking/tracking.actions";
import type {
  CanonicalTrackResult,
  TrackingEvent,
  TrackingEventType,
} from "@/lib/tracking-adapters/core/tracking.types";

// --- EVENT TYPE CONFIG -------------------------------------------------------

const EVENT_CONFIG: Record<
  TrackingEventType,
  {
    label: string;
    icon: React.ElementType;
    badgeVariant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  booked:           { label: "Booked",             icon: Box,          badgeVariant: "secondary"    },
  picked_up:        { label: "Picked Up",           icon: Package,      badgeVariant: "default"      },
  in_transit:       { label: "In Transit",          icon: Truck,        badgeVariant: "default"      },
  out_for_delivery: { label: "Out for Delivery",    icon: Navigation,   badgeVariant: "default"      },
  delivered:        { label: "Delivered",           icon: CheckCircle2, badgeVariant: "default"      },
  attempted:        { label: "Delivery Attempted",  icon: AlertCircle,  badgeVariant: "outline"      },
  exception:        { label: "Exception",           icon: AlertCircle,  badgeVariant: "destructive"  },
  returned:         { label: "Returned",            icon: RotateCcw,    badgeVariant: "destructive"  },
  unknown:          { label: "Update",              icon: Clock,        badgeVariant: "secondary"    },
};

// --- HELPERS -----------------------------------------------------------------

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatGroupDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// --- STATUS BADGE ------------------------------------------------------------

function StatusBadge({
  eventType,
  isDelivered,
}: {
  eventType: TrackingEventType;
  isDelivered: boolean;
}) {
  const config = EVENT_CONFIG[eventType];
  const Icon = config.icon;
  return (
    <Badge
      variant={isDelivered ? "default" : config.badgeVariant}
      className="gap-1.5 px-2.5 py-1 text-xs font-medium"
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

// --- SHIPMENT META CARD ------------------------------------------------------

function ShipmentMetaCard({ result }: { result: CanonicalTrackResult }) {
  const { shipmentInfo, latestEvent, isDelivered, vendorName } = result;

  const meta = [
    shipmentInfo.weight !== undefined && {
      icon: Weight,
      label: "Weight",
      value: `${shipmentInfo.weight} KG`,
    },
    shipmentInfo.numberOfPieces !== undefined && {
      icon: Layers,
      label: "Pieces",
      value: String(shipmentInfo.numberOfPieces),
    },
    shipmentInfo.shipDate && {
      icon: CalendarDays,
      label: "Shipped",
      value: formatShortDate(shipmentInfo.shipDate),
    },
    shipmentInfo.destination && {
      icon: Globe,
      label: "Destination",
      value: shipmentInfo.destination,
    },
  ].filter(Boolean) as { icon: React.ElementType; label: string; value: string }[];

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Tracking Number
            </p>
            <CardTitle className="text-xl font-mono tracking-wider">
              {shipmentInfo.awb}
            </CardTitle>
            <CardDescription>
              {shipmentInfo.service ?? vendorName}
            </CardDescription>
          </div>
          {latestEvent && (
            <StatusBadge
              eventType={latestEvent.eventType}
              isDelivered={isDelivered}
            />
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {meta.length > 0 && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {meta.map(({ icon: Icon, label, value }) => (
                <div key={label} className="space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    <p className="text-xs font-medium">{label}</p>
                  </div>
                  <p className="text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {latestEvent && (
          <>
            <Separator />
            {/* Latest event — location is the headline */}
            <div className="rounded-md border bg-muted/40 px-4 py-3 space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">
                Current status
              </p>
              <p className="text-sm font-semibold">{latestEvent.status}</p>
              {latestEvent.location && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium">{latestEvent.location}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {formatDateTime(latestEvent.timestamp)}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// --- TIMELINE EVENT ROW ------------------------------------------------------

function EventRow({
  event,
  isFirst,
  isLast,
}: {
  event: TrackingEvent;
  isFirst: boolean;
  isLast: boolean;
}) {
  const config = EVENT_CONFIG[event.eventType];
  const EventIcon = config.icon;

  return (
    <div className="flex gap-3">
      {/* Spine */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`
            h-7 w-7 rounded-full flex items-center justify-center border-2 mt-0.5
            ${isFirst
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground"
            }
          `}
        >
          <EventIcon className="h-3.5 w-3.5" />
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-border my-1" style={{ minHeight: 20 }} />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-5"}`}>
        {/* Location — big and prominent */}
        {event.location ? (
          <div className="flex items-start gap-1.5 mb-0.5">
            <MapPin className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${isFirst ? "text-foreground" : "text-muted-foreground"}`} />
            <p className={`text-sm font-semibold leading-snug ${isFirst ? "text-foreground" : "text-muted-foreground"}`}>
              {event.location}
            </p>
          </div>
        ) : null}

        {/* Status label */}
        <p className={`text-sm leading-snug ${event.location ? "text-muted-foreground" : `font-semibold ${isFirst ? "text-foreground" : "text-muted-foreground"}`}`}>
          {event.status}
        </p>

        {/* Description — only if meaningfully different from status */}
        {event.description &&
          event.description !== event.status &&
          event.description !== event.location && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {event.description}
            </p>
          )}

        {/* Time */}
        <p className="text-xs text-muted-foreground/60 mt-1">
          {formatTime(event.timestamp)}
        </p>
      </div>
    </div>
  );
}

// --- TRACKING TIMELINE -------------------------------------------------------

function TrackingTimeline({ events }: { events: TrackingEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="h-8 w-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          No tracking events available yet.
        </p>
      </div>
    );
  }

  // Group by calendar date
  type Group = { dateKey: string; label: string; items: (TrackingEvent & { globalIdx: number })[] };
  const grouped: Group[] = [];

  events.forEach((event, idx) => {
    const dateKey = new Date(event.timestamp).toDateString(); // stable grouping key
    const label = formatGroupDate(event.timestamp);
    const last = grouped[grouped.length - 1];
    if (last && last.dateKey === dateKey) {
      last.items.push({ ...event, globalIdx: idx });
    } else {
      grouped.push({ dateKey, label, items: [{ ...event, globalIdx: idx }] });
    }
  });

  const totalEvents = events.length;

  return (
    <div className="space-y-8">
      {grouped.map((group) => (
        <div key={group.dateKey}>
          {/* Date header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-border" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
              {group.label}
            </p>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Events */}
          <div>
            {group.items.map((event) => (
              <EventRow
                key={`${event.timestamp}-${event.globalIdx}`}
                event={event}
                isFirst={event.globalIdx === 0}
                isLast={event.globalIdx === totalEvents - 1}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- EMPTY STATE -------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full border-2 border-dashed border-border p-5 mb-4">
        <Search className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-medium mb-1">Track a shipment</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        Enter an AWB number above to see real-time delivery updates.
      </p>
    </div>
  );
}

// --- MAIN PAGE ---------------------------------------------------------------

export default function TrackPage() {
  const [awb, setAwb] = useState("");
  const [result, setResult] = useState<CanonicalTrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleTrack() {
    if (!awb.trim()) return;
    setError(null);

    startTransition(async () => {
      const res = await trackShipmentAction({ awb: awb.trim() });

      if (!res.success || !res.data?.result) {
        setResult(null);
        setError(
          res.validationError ??
            res.data?.error?.message ??
            "No tracking information found for this AWB."
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

  const showEmpty = !result && !error && !isPending;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Track Shipment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter an AWB number to get live delivery updates.
        </p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={awb}
            onChange={(e) => setAwb(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTrack()}
            placeholder="AWB / Tracking number"
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
        {(result || error) && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleReset}
            disabled={isPending}
            aria-label="Clear"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Loading skeleton */}
      {isPending && (
        <div className="space-y-4 animate-pulse">
          <div className="h-44 rounded-lg bg-muted" />
          <div className="h-96 rounded-lg bg-muted" />
        </div>
      )}

      {/* Error */}
      {!isPending && error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  Tracking failed
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isPending && showEmpty && <EmptyState />}

      {/* Results */}
      {!isPending && result && (
        <div className="space-y-4">
          <ShipmentMetaCard result={result} />

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Tracking History</CardTitle>
                <Badge variant="secondary" className="font-normal">
                  {result.events.length} event{result.events.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <CardDescription>via {result.vendorName}</CardDescription>
            </CardHeader>
            <CardContent>
              <TrackingTimeline events={result.events} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}