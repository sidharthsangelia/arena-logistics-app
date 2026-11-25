/**
 * components/tracking/trackParts.tsx
 *
 * The static pieces of the tracking screen, shared by TrackShipmentView (client)
 * and the route loading states (server). No "use client" and no hooks on
 * purpose: a "use client" module cannot hand plain values or server-renderable
 * pieces to a loading.tsx, and these need to be byte-identical in both places
 * so nothing shifts when the real view mounts.
 */

import {
  Box, CalendarDays, CheckCircle2, Globe, Layers, Navigation, Package,
  Search, Truck, Weight,
} from "lucide-react";

import { cn } from "@/lib/utils";

export const TRACK_SEARCH_PLACEHOLDER = "ARN260130748291 or AWB number";

/** Page width and padding for every state of the tracking screen. */
export const TRACK_PAGE = "max-w-2xl mx-auto px-4 py-8 sm:px-6";

export function TrackHeader() {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight">Track Shipment</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Enter an Arena shipment number or a carrier AWB to see live updates.
      </p>
    </div>
  );
}

export function TrackEmptyState() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="rounded-full border-2 border-dashed border-border p-5 mb-4">
        <Search className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-semibold mb-1">Enter a shipment number or AWB</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        Use the Arena shipment number from your booking confirmation
        (ARN260130748291) or the carrier&apos;s airway bill number. Either one
        pulls the same live updates.
      </p>
    </div>
  );
}

// ─── Stage track ──────────────────────────────────────────────────────────────

export const STAGES = [
  { type: "booked",           shortLabel: "Booked",     icon: Box          },
  { type: "picked_up",        shortLabel: "Collected",  icon: Package      },
  { type: "in_transit",       shortLabel: "In Transit", icon: Truck        },
  { type: "out_for_delivery", shortLabel: "Dispatched", icon: Navigation   },
  { type: "delivered",        shortLabel: "Delivered",  icon: CheckCircle2 },
] as const;

/**
 * The five-stage progress row. `reachedIdx` -1 draws every stage as not yet
 * reached, which is what the loading state shows: the stages are fixed, only
 * how far the shipment got is unknown until the lookup returns.
 */
export function StageTrack({
  reachedIdx,
  isAlert = false,
}: {
  reachedIdx: number;
  isAlert?: boolean;
}) {
  return (
    <div className="flex items-start">
      {STAGES.map((stage, i) => {
        const Icon       = stage.icon;
        const completed  = i <= reachedIdx;
        const isLast     = i === STAGES.length - 1;
        const lineActive = i < reachedIdx;

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
                "h-0.5 flex-1 mx-1.5 mb-5.5 rounded-full transition-colors",
                lineActive ? "bg-foreground" : "bg-border",
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Metadata labels ──────────────────────────────────────────────────────────

/** Labels and icons of the hero card's metadata grid, in display order. */
export const META_FIELDS = {
  weight:      { icon: Weight,       label: "Weight"      },
  pieces:      { icon: Layers,       label: "Pieces"      },
  shipped:     { icon: CalendarDays, label: "Shipped"     },
  destination: { icon: Globe,        label: "Destination" },
} as const;

export const TRACKING_FOOTER = "Data via Arena Logistics";
