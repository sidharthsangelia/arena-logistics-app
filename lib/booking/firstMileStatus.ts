import { FirstMileStatus } from "@/generated/prisma";

/**
 * lib/booking/firstMileStatus.ts
 *
 * Single source of truth for the door → hub (first-mile) leg's small lifecycle.
 * Kept free of `server-only` so the ops edit panel (client), the tenant + admin
 * pages (server), and the notification/email paths can all agree on the exact
 * set of stages, their order, labels and which ones notify the customer.
 *
 * The main ShipmentStatus lifecycle covers everything from the hub onward, so
 * this leg deliberately stops at ARRIVED_AT_HUB.
 */

export interface FirstMileStageConfig {
  /** Short label for badges + selects. */
  label: string;
  /** Tenant-facing one-liner shown under the stage. */
  description: string;
  /** Colour is only ever a functional cue here: waiting vs moving vs done. */
  className: string;
  dotClassName: string;
}

// Declared in journey order — index in this record IS the stage's position on
// the rail, which firstMileStageIndex relies on.
export const FIRST_MILE_STAGES: Record<FirstMileStatus, FirstMileStageConfig> = {
  SCHEDULED: {
    label: "Pickup scheduled",
    description: "A local courier is booked to collect the parcel from the door.",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
    dotClassName: "bg-amber-500",
  },
  PICKED_UP: {
    label: "Picked up",
    description: "The courier has collected the parcel and is heading to the hub.",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
    dotClassName: "bg-blue-500",
  },
  IN_TRANSIT_TO_HUB: {
    label: "In transit to hub",
    description: "The parcel is on its way to the carrier hub.",
    className:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800",
    dotClassName: "bg-sky-500",
  },
  ARRIVED_AT_HUB: {
    label: "Arrived at hub",
    description:
      "The parcel has reached the carrier hub. The international leg takes over from here.",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
    dotClassName: "bg-emerald-500",
  },
};

/** Stages in journey order — drives the progress rail and the ops select. */
export const FIRST_MILE_STAGE_ORDER: FirstMileStatus[] = [
  FirstMileStatus.SCHEDULED,
  FirstMileStatus.PICKED_UP,
  FirstMileStatus.IN_TRANSIT_TO_HUB,
  FirstMileStatus.ARRIVED_AT_HUB,
];

/** 0-based position of a stage on the rail; -1 if somehow unknown. */
export function firstMileStageIndex(status: FirstMileStatus): number {
  return FIRST_MILE_STAGE_ORDER.indexOf(status);
}

/**
 * The stages that send the customer an email + inbox notification. Pickup and
 * hub arrival are the two the sender actually cares about; the in-between
 * transit move is noise for a leg this short.
 */
export const FIRST_MILE_EMAIL_MILESTONES: ReadonlySet<FirstMileStatus> = new Set([
  FirstMileStatus.PICKED_UP,
  FirstMileStatus.ARRIVED_AT_HUB,
]);

export function isFirstMileEmailMilestone(status: FirstMileStatus): boolean {
  return FIRST_MILE_EMAIL_MILESTONES.has(status);
}

// ---------------------------------------------------------------------------
// Ops action contract — kept here (not in the "use server" action file, which
// may only export async functions) so the panel and the action share one shape.
// ---------------------------------------------------------------------------

export interface UpdateFirstMileInput {
  shipmentId: string;
  status: FirstMileStatus;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  /** yyyy-mm-dd from the date input, or "" / null to clear. */
  pickupScheduledAt?: string | null;
}

export type UpdateFirstMileResult =
  | { success: true; emailed: boolean }
  | { success: false; message: string };
