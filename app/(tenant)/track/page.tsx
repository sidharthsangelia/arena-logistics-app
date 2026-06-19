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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
 
import { trackShipmentAction } from "@/actions/tracking/tracking.actions";
import type { CanonicalTrackResult, TrackingEvent, TrackingEventType } from "@/lib/tracking-adapters/core/tracking.types";

// --- EVENT TYPE CONFIG -------------------------------------------------------

const EVENT_CONFIG: Record<
  TrackingEventType,
  { label: string; icon: React.ElementType; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }
> = {
  booked:           { label: "Booked",            icon: Box,          color: "text-slate-500",  badgeVariant: "secondary" },
  picked_up:        { label: "Picked Up",          icon: Package,      color: "text-blue-500",   badgeVariant: "default" },
  in_transit:       { label: "In Transit",         icon: Truck,        color: "text-amber-500",  badgeVariant: "default" },
  out_for_delivery: { label: "Out for Delivery",   icon: Navigation,   color: "text-indigo-500", badgeVariant: "default" },
  delivered:        { label: "Delivered",          icon: CheckCircle2, color: "text-green-500",  badgeVariant: "default" },
  attempted:        { label: "Delivery Attempted", icon: AlertCircle,  color: "text-orange-500", badgeVariant: "outline" },
  exception:        { label: "Exception",          icon: AlertCircle,  color: "text-red-500",    badgeVariant: "destructive" },
  returned:         { label: "Returned",           icon: RotateCcw,    color: "text-rose-500",   badgeVariant: "destructive" },
  unknown:          { label: "Update",             icon: Clock,        color: "text-slate-400",  badgeVariant: "secondary" },
};

// --- SUB-COMPONENTS ----------------------------------------------------------

function ShipmentMetaCard({ result }: { result: CanonicalTrackResult }) {
  const { shipmentInfo, latestEvent, isDelivered, vendorName } = result;
  const config = latestEvent ? EVENT_CONFIG[latestEvent.eventType] : EVENT_CONFIG.unknown;
  const StatusIcon = config.icon;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900">
              AWB {shipmentInfo.awb}
            </CardTitle>
            <CardDescription className="mt-0.5">
              {shipmentInfo.service ?? vendorName}
              {shipmentInfo.destination && (
                <> &rarr; {shipmentInfo.destination}</>
              )}
            </CardDescription>
          </div>
          <Badge
            variant={isDelivered ? "default" : "secondary"}
            className={isDelivered ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {latestEvent ? config.label : "No data"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 text-sm">
          {shipmentInfo.weight !== undefined && (
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide font-medium mb-0.5">Weight</p>
              <p className="text-slate-800 font-medium">{shipmentInfo.weight} KG</p>
            </div>
          )}
          {shipmentInfo.numberOfPieces !== undefined && (
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide font-medium mb-0.5">Pieces</p>
              <p className="text-slate-800 font-medium">{shipmentInfo.numberOfPieces}</p>
            </div>
          )}
          {shipmentInfo.shipDate && (
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide font-medium mb-0.5">Ship Date</p>
              <p className="text-slate-800 font-medium">
                {new Date(shipmentInfo.shipDate).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          )}
          {latestEvent?.location && (
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide font-medium mb-0.5">Last Location</p>
              <p className="text-slate-800 font-medium">{latestEvent.location}</p>
            </div>
          )}
        </div>

        {latestEvent && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2 bg-slate-50 ${config.color}`}>
                <StatusIcon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">{latestEvent.status}</p>
                <p className="text-xs text-slate-400">
                  {new Date(latestEvent.timestamp).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {latestEvent.location ? ` · ${latestEvent.location}` : ""}
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TrackingTimeline({ events }: { events: TrackingEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        No tracking events available.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {events.map((event, idx) => {
        const config = EVENT_CONFIG[event.eventType];
        const EventIcon = config.icon;
        const isLast = idx === events.length - 1;
        const isFirst = idx === 0;

        return (
          <div key={`${event.timestamp}-${idx}`} className="flex gap-4">
            {/* Timeline spine */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  mt-1 h-7 w-7 rounded-full flex items-center justify-center shrink-0 border-2
                  ${isFirst
                    ? "border-amber-500 bg-amber-50 " + config.color
                    : "border-slate-200 bg-white text-slate-400"
                  }
                `}
              >
                <EventIcon className="h-3.5 w-3.5" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-slate-100 my-1" />}
            </div>

            {/* Event content */}
            <div className={`pb-5 flex-1 min-w-0 ${isLast ? "pb-0" : ""}`}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <p
                  className={`text-sm font-medium leading-snug ${
                    isFirst ? "text-slate-900" : "text-slate-600"
                  }`}
                >
                  {event.status}
                </p>
                {event.location && (
                  <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {event.location}
                  </span>
                )}
              </div>
              {event.description !== event.status && (
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  {event.description}
                </p>
              )}
              <p className="text-xs text-slate-300 mt-1">
                {new Date(event.timestamp).toLocaleString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        );
      })}
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

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Track Shipment
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Enter your AWB number for live tracking updates.
        </p>
      </div>

      {/* Search card */}
      <Card className="shadow-sm mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 " />
            <CardTitle className="text-base">Enter Tracking Number</CardTitle>
          </div>
          <CardDescription>
            Supports Aramex and Skart AWB numbers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="awb">AWB / Tracking Number</Label>
            <div className="flex gap-2">
              <Input
                id="awb"
                value={awb}
                onChange={(e) => setAwb(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTrack()}
                placeholder="e.g. 37207354542"
                className="flex-1"
                disabled={isPending}
              />
              <Button
                onClick={handleTrack}
                disabled={isPending || !awb.trim()}
                className="shrink-0   text-white"
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
                  variant="outline"
                  onClick={handleReset}
                  disabled={isPending}
                  className="shrink-0"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <Card className="shadow-sm border-red-100 bg-red-50">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">
                  Tracking failed
                </p>
                <p className="text-sm text-red-500 mt-0.5">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <ShipmentMetaCard result={result} />

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tracking History</CardTitle>
              <CardDescription>
                {result.events.length} event
                {result.events.length !== 1 ? "s" : ""} · via {result.vendorName}
              </CardDescription>
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