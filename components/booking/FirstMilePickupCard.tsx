import {
  Home,
  Warehouse,
  ArrowRight,
  ExternalLink,
  Check,
  ChevronDown,
} from "lucide-react";

import { FirstMileStatus } from "@/generated/prisma";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  FIRST_MILE_STAGES,
  FIRST_MILE_STAGE_ORDER,
  firstMileStageIndex,
} from "@/lib/booking/firstMileStatus";

// ---------------------------------------------------------------------------
// FirstMilePickupCard — the door → hub leg, shown on the tenant shipment page
// and the admin booking page. Read-only: ops advance the leg from the separate
// FirstMileStatusPanel. Render only when the shipment includes door pickup
// (pickupIncluded); this component assumes that has been checked.
//
// `chrome` decides whether it draws its own card. The ops pages sit in a column
// of cards and want one ("card", the default); the tenant shipment page is a
// flat, card-less document and wants the content alone ("plain").
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
  /** "card" draws the surrounding card; "plain" renders the content bare. */
  chrome?: "card" | "plain";
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
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1.5 truncate text-sm font-medium text-foreground">
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
    chrome = "card",
  } = props;

  const plain = chrome === "plain";
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
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1",
        plain ? "border-b pb-2.5" : "border-b bg-muted/20 px-5 py-3.5",
      )}
    >
      <h2
        className={cn(
          "flex min-w-0 items-baseline gap-2",
          plain
            ? "text-xs font-semibold uppercase tracking-widest text-muted-foreground"
            : "text-sm font-semibold text-foreground",
        )}
      >
        Door pickup
        {collapsible && (
          <span className="truncate text-xs font-normal normal-case tracking-normal text-muted-foreground group-open:hidden">
            {pickupFromLabel || "Pickup"} → {hubLabel ? `${hubLabel} hub` : "hub"}
          </span>
        )}
      </h2>
      <span className="flex items-center gap-2 text-xs">
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", cfg.dotClassName)}
        />
        <span className="font-medium text-foreground">{cfg.label}</span>
        {collapsible && (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
        )}
      </span>
    </div>
  );

  const body = (
    <div className={cn(plain ? "space-y-6 pt-6" : "px-5 pb-4 pt-4")}>
      {/* Route + what the current stage means */}
      <div className={cn(!plain && "space-y-2")}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-base">
          <span className="flex items-center gap-1.5 font-semibold tracking-tight text-foreground">
            <Home className="h-4 w-4 text-muted-foreground" />
            {pickupFromLabel || "Pickup"}
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          <span className="flex items-center gap-1.5 font-semibold tracking-tight text-foreground">
            <Warehouse className="h-4 w-4 text-muted-foreground" />
            {hubLabel ? `${hubLabel} hub` : "Carrier hub"}
          </span>
        </div>
        <p className={cn("text-sm text-muted-foreground", plain && "mt-1.5")}>
          {cfg.description}
        </p>
      </div>

      {/* Progress rail */}
      <div className={cn("relative", !plain && "mt-6 mb-5")}>
        <div className="absolute left-0 right-0 top-2.75 h-px bg-border" />
        <div
          className="absolute left-0 top-2.75 h-px bg-foreground/40 transition-all duration-500"
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
                className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
              >
                <div
                  className={cn(
                    "relative z-10 flex h-5.5 w-5.5 items-center justify-center rounded-full bg-background transition-colors duration-300",
                    isDone && "bg-foreground",
                    isActive && "ring-2 ring-inset ring-foreground",
                    !isDone && !isActive && "ring-1 ring-inset ring-border",
                  )}
                >
                  {isDone && <Check className="h-3 w-3 text-background" />}
                  {isActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                  )}
                </div>
                <span
                  className={cn(
                    "max-w-19 text-xs leading-tight",
                    isDone && "text-muted-foreground",
                    isActive && "font-medium text-foreground",
                    !isDone && !isActive && "text-muted-foreground/50",
                  )}
                >
                  {FIRST_MILE_STAGES[stage].label}
                </span>
                {stamp && (
                  <span className="text-xs text-muted-foreground/60">
                    {isScheduledFuture ? `for ${stamp}` : stamp}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Details */}
      <div
        className={cn(
          "grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4",
          plain ? "border-t pt-6" : "border-t pt-4",
        )}
      >
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
              <span className="font-normal text-muted-foreground">Awaiting</span>
            )
          }
        />
        <Detail label="Pickup charge" value={fmtMoney(charge, currency)} />
        <Detail
          label="Scheduled"
          value={
            fmtDate(scheduledAt) ?? (
              <span className="font-normal text-muted-foreground">Not set</span>
            )
          }
        />
      </div>

      {updatedAt && (
        <p className={cn("text-xs text-muted-foreground/70", !plain && "mt-4")}>
          Pickup leg last updated {fmtDate(updatedAt)}
        </p>
      )}
    </div>
  );

  if (collapsible) {
    const details = (
      <details className="group">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {header}
        </summary>
        {body}
      </details>
    );

    return plain ? (
      <section>{details}</section>
    ) : (
      <Card className={cn("gap-0 overflow-hidden border-l-4 py-0", cfg.accentClassName)}>
        {details}
      </Card>
    );
  }

  return plain ? (
    <section>
      {header}
      {body}
    </section>
  ) : (
    <Card className={cn("gap-0 overflow-hidden border-l-4 py-0", cfg.accentClassName)}>
      {header}
      {body}
    </Card>
  );
}
