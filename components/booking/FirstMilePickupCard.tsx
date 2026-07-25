import {
  Home,
  Warehouse,
  ArrowRight,
  Truck,
  ExternalLink,
  CheckCircle2,
  CircleDot,
  Circle,
  ChevronDown,
} from "lucide-react";

import { FirstMileStatus } from "@/generated/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  FIRST_MILE_STAGES,
  FIRST_MILE_STAGE_ORDER,
  firstMileStageIndex,
} from "@/lib/booking/firstMileStatus";

// ---------------------------------------------------------------------------
// FirstMilePickupCard — the door → hub leg, shown identically on the tenant
// shipment page and the admin booking page. Read-only: ops advance the leg from
// the separate FirstMileStatusPanel. Render only when the shipment includes
// door pickup (pickupIncluded); this component assumes that has been checked.
// ---------------------------------------------------------------------------

export interface FirstMilePickupCardProps {
  status: FirstMileStatus;
  hubLabel: string | null;
  courierName: string | null;
  charge: number | null;
  currency: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  pickupFromLabel: string | null; // e.g. "New Delhi 110077"
  scheduledAt: Date | null;
  pickedUpAt: Date | null;
  hubArrivedAt: Date | null;
  updatedAt: Date | null;
  /**
   * Collapse the body behind the header, opting into a native <details>. Used on
   * the ops page once the leg is finished (arrived at hub) so the completed
   * pickup stops taking up space it no longer earns. Defaults to always-open.
   */
  collapsible?: boolean;
}

function fmtDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtMoney(amount: number | null, currency: string): string | null {
  if (amount == null || amount <= 0) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 truncate text-sm font-medium text-foreground">
        {value}
      </div>
    </div>
  );
}

export function FirstMilePickupCard(props: FirstMilePickupCardProps) {
  const {
    status,
    hubLabel,
    courierName,
    charge,
    currency,
    trackingNumber,
    trackingUrl,
    pickupFromLabel,
    scheduledAt,
    pickedUpAt,
    hubArrivedAt,
    updatedAt,
    collapsible = false,
  } = props;

  const cfg = FIRST_MILE_STAGES[status];
  const activeIdx = firstMileStageIndex(status);
  const lastIdx = FIRST_MILE_STAGE_ORDER.length - 1;

  // Per-stage completion timestamps for the rail. IN_TRANSIT_TO_HUB has no
  // dedicated stamp, so it shows none.
  const stampFor: Partial<Record<FirstMileStatus, Date | null>> = {
    [FirstMileStatus.SCHEDULED]: scheduledAt,
    [FirstMileStatus.PICKED_UP]: pickedUpAt,
    [FirstMileStatus.ARRIVED_AT_HUB]: hubArrivedAt,
  };

  const filledPct =
    activeIdx <= 0 ? 0 : (Math.min(activeIdx, lastIdx) / lastIdx) * 100;

  // Header row — shared between the open card and the collapsible summary. When
  // collapsed it doubles as the <summary>, so it carries the route and chevron.
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">
          Door pickup
        </span>
        {collapsible ? (
          <span className="truncate text-xs text-muted-foreground group-open:hidden">
            {pickupFromLabel || "Pickup"} → {hubLabel ? `${hubLabel} hub` : "hub"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            First mile · door to hub
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn("inline-flex h-2 w-2 rounded-full", cfg.dotClassName)}
        />
        <Badge
          variant="outline"
          className={cn("text-xs font-semibold px-2.5 py-0.5", cfg.className)}
        >
          {cfg.label}
        </Badge>
        {collapsible && (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
        )}
      </div>
    </div>
  );

  const body = (
    <>
      {/* Route pill */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 pt-4 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Home className="h-4 w-4 text-muted-foreground" />
          {pickupFromLabel || "Pickup"}
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Warehouse className="h-4 w-4 text-muted-foreground" />
          {hubLabel ? `${hubLabel} hub` : "Carrier hub"}
        </span>
      </div>

      <p className="px-5 pt-2 text-xs text-muted-foreground">
        {cfg.description}
      </p>

      {/* Progress rail */}
      <div className="px-5 pb-4 pt-5">
        <div className="relative">
          <div className="absolute left-0 right-0 top-[13px] h-px bg-border" />
          <div
            className="absolute left-0 top-[13px] h-px bg-foreground/30 transition-all duration-500"
            style={{ width: `${filledPct}%` }}
          />
          <div className="relative flex justify-between">
            {FIRST_MILE_STAGE_ORDER.map((stage, idx) => {
              const isLast = idx === lastIdx;
              const isDone = idx < activeIdx || (idx === activeIdx && isLast);
              const isActive = idx === activeIdx && !isLast;
              const stamp = fmtDate(stampFor[stage] ?? null);
              const isScheduledFuture =
                stage === FirstMileStatus.SCHEDULED && idx === activeIdx;

              return (
                <div
                  key={stage}
                  className="flex flex-1 flex-col items-center gap-2 text-center"
                >
                  <div
                    className={cn(
                      "relative z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 transition-all duration-300",
                      isDone && "border-foreground bg-foreground",
                      isActive &&
                        "border-foreground bg-background shadow-sm ring-4 ring-foreground/10",
                      !isDone && !isActive && "border-border bg-background",
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-background" />
                    ) : isActive ? (
                      <CircleDot className="h-3.5 w-3.5 text-foreground" />
                    ) : (
                      <Circle className="h-3 w-3 text-muted-foreground/30" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "max-w-[70px] text-[10px] font-medium leading-tight",
                      isDone && "text-foreground",
                      isActive && "font-semibold text-foreground",
                      !isDone && !isActive && "text-muted-foreground/50",
                    )}
                  >
                    {FIRST_MILE_STAGES[stage].label}
                  </span>
                  {stamp && (
                    <span className="text-[9px] text-muted-foreground/60">
                      {isScheduledFuture ? `for ${stamp}` : stamp}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-t px-5 py-4 sm:grid-cols-4">
        <Detail label="Courier" value={courierName} />
        <Detail
          label="Tracking"
          value={
            trackingNumber ? (
              trackingUrl ? (
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono hover:underline"
                >
                  {trackingNumber}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <span className="font-mono">{trackingNumber}</span>
              )
            ) : (
              <span className="text-muted-foreground">Awaiting</span>
            )
          }
        />
        <Detail label="Pickup charge" value={fmtMoney(charge, currency)} />
        <Detail
          label="Scheduled"
          value={fmtDate(scheduledAt) ?? (
            <span className="text-muted-foreground">Not set</span>
          )}
        />
      </div>

      {updatedAt && (
        <p className="border-t px-5 py-2 text-[10px] text-muted-foreground/70">
          Pickup leg last updated {fmtDate(updatedAt)}
        </p>
      )}
    </>
  );

  if (collapsible) {
    return (
      <Card
        className={cn(
          "gap-0 overflow-hidden border-l-4 py-0",
          cfg.accentClassName,
        )}
      >
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 flex-1">{header}</div>
          </summary>
          <div className="border-t">{body}</div>
        </details>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden border-l-4", cfg.accentClassName)}>
      <div className="border-b">{header}</div>
      {body}
    </Card>
  );
}
