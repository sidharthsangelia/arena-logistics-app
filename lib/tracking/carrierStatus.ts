import { ShipmentStatus } from "@/generated/prisma";
import type { TrackingEvent } from "@/lib/tracking-adapters/core/tracking.types";
import {
  isAutoAdvanceable,
  shipmentStatusRank,
} from "@/lib/shipmozo/domesticStatusMap";

/**
 * lib/tracking/carrierStatus.ts
 *
 * What a carrier's scans say our shipment status should be. Pure, so it is
 * tested directly and shared by every path that moves a status from tracking:
 * the detail-page view, its Refresh button and the 4-hourly sync job.
 *
 * Only the happy path moves a status. Problem scans (exception, failed
 * attempt, return) never do: they are surfaced to ops, who decide. Same rule
 * the Shipmozo webhook follows, and the same forward-only rank.
 */

const PROGRESS: Partial<Record<TrackingEvent["eventType"], ShipmentStatus>> = {
  // Collected from the sender is already moving, as far as the customer's
  // journey rail is concerned; there is no separate "picked up" status.
  picked_up: ShipmentStatus.IN_TRANSIT,
  in_transit: ShipmentStatus.IN_TRANSIT,
  out_for_delivery: ShipmentStatus.OUT_FOR_DELIVERY,
  delivered: ShipmentStatus.DELIVERED,
};

const PROBLEMS = new Set<TrackingEvent["eventType"]>([
  "exception",
  "attempted",
  "returned",
]);

export interface CarrierStatusVerdict {
  /** The furthest status the scans support, or null when none do. */
  target: ShipmentStatus | null;
  /** The scan that supports `target`, for the history note. */
  source: TrackingEvent | null;
  /**
   * The newest classified scan, when it is a problem the parcel has not since
   * moved past. Null once a later progress scan or a delivery supersedes it.
   */
  problem: TrackingEvent | null;
}

/**
 * Read the scans of the leg that IS the shipment.
 *
 * A first-mile scan describes the door to hub courier, not the shipment, so it
 * never moves the main status. Events with no leg come from a single-vendor
 * lookup and are the main leg by definition.
 */
export function deriveCarrierStatus(events: TrackingEvent[]): CarrierStatusVerdict {
  const main = events
    .filter((e) => !e.leg || e.leg === "main")
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  let target: ShipmentStatus | null = null;
  let source: TrackingEvent | null = null;
  for (const e of main) {
    const mapped = PROGRESS[e.eventType];
    if (!mapped) continue;
    if (!target || shipmentStatusRank(mapped) > shipmentStatusRank(target)) {
      target = mapped;
      source = e;
    }
  }

  const latestClassified = main.find((e) => e.eventType !== "unknown") ?? null;
  const problem =
    latestClassified &&
    PROBLEMS.has(latestClassified.eventType) &&
    target !== ShipmentStatus.DELIVERED
      ? latestClassified
      : null;

  return { target, source, problem };
}

/**
 * Would these scans move a shipment that is currently at `current`?
 * False for a status ops parked off the happy path, and for anything that is
 * not strictly ahead of where it already is.
 */
export function shouldAdvance(
  current: ShipmentStatus,
  target: ShipmentStatus | null,
): target is ShipmentStatus {
  if (!target || !isAutoAdvanceable(current)) return false;
  return shipmentStatusRank(target) > shipmentStatusRank(current);
}

/**
 * Shipments booked before this never move automatically: they predate the
 * sync, and many are trials or dead bookings nobody closed. Their scans still
 * show on the detail page; their status stays with ops. 25 Oct 2026, 00:00 IST.
 */
export const CARRIER_SYNC_STARTS_AT = new Date("2026-10-24T18:30:00.000Z");

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The outer limit for ANY automatic move, including a page view or Refresh.
 * Past it a shipment is display-only; an admin updates it by hand.
 */
export const CARRIER_SYNC_MAX_AGE_DAYS = 30;

/**
 * The 4-hourly job stops checking a shipment this long after booking. Air to
 * the USA takes up to ~15 days; the rest is buffer for customs holds and
 * delivery retries. One still undelivered past it is stuck or dead, and the
 * daily attention sweep has already flagged it to ops (STUCK_TOLERANCE_DAYS).
 * A page view or Refresh still moves it, up to CARRIER_SYNC_MAX_AGE_DAYS.
 */
export const CARRIER_SYNC_JOB_MAX_AGE_DAYS = 21;

/** How often the job wakes. Every tier below must be a multiple of it. */
export const CARRIER_SYNC_BASE_HOURS = 4;

/**
 * How often a shipment is checked by the job, by age since booking. A fresh
 * shipment moves fast and its first scans are what customers wait for; an
 * older one is mostly sitting in customs or a hub, so it is asked less often.
 *
 * ADJUSTABLE, with one rule: everyHours must be a multiple of
 * CARRIER_SYNC_BASE_HOURS (4, 8, 12, 24). A tier is served by joining only
 * some of the job's runs, picked from the run's IST hour, which is what lets
 * this work with no "last checked" column. A test enforces the rule.
 */
export const CARRIER_SYNC_TIERS: ReadonlyArray<{
  fromDays: number;
  everyHours: number;
}> = [
  { fromDays: 0, everyHours: 4 },
  { fromDays: 7, everyHours: 8 },
  { fromDays: 14, everyHours: 12 },
];

/** The earliest booking date still in scope, as of `now`. */
export function carrierSyncWindowStart(
  now: Date = new Date(),
  maxAgeDays: number = CARRIER_SYNC_MAX_AGE_DAYS,
): Date {
  const ageLimit = new Date(now.getTime() - maxAgeDays * DAY_MS);
  return ageLimit > CARRIER_SYNC_STARTS_AT ? ageLimit : CARRIER_SYNC_STARTS_AT;
}

/**
 * The job slot a run belongs to: its IST hour rounded down to the base
 * interval (0, 4, 8, 12, 16, 20). Rounded so a run Inngest starts late still
 * counts as the slot it was scheduled for.
 */
export function carrierSyncSlotHour(now: Date): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Kolkata",
    }).format(now),
  );
  return hour - (hour % CARRIER_SYNC_BASE_HOURS);
}

/**
 * Does the job check this shipment on the run at `slotHour`?
 *
 * Out for delivery is always checked: it is hours from the Delivered email,
 * and only a handful of shipments are ever in that state at once.
 */
export function isDueForCarrierSync(
  status: ShipmentStatus,
  bookedAt: Date | null,
  createdAt: Date,
  slotHour: number,
  now: Date = new Date(),
): boolean {
  const ageDays = (now.getTime() - (bookedAt ?? createdAt).getTime()) / DAY_MS;
  if (ageDays > CARRIER_SYNC_JOB_MAX_AGE_DAYS) return false;
  if (status === ShipmentStatus.OUT_FOR_DELIVERY) return true;

  let every = CARRIER_SYNC_TIERS[0].everyHours;
  for (const tier of CARRIER_SYNC_TIERS) {
    if (ageDays >= tier.fromDays) every = tier.everyHours;
  }
  return slotHour % every === 0;
}

/**
 * May carrier scans move this shipment's status (and email, and alert ops)?
 * One rule for the job, the page view and Refresh. Older rows have no
 * bookedAt; their creation date stands in.
 */
export function isCarrierSyncEligible(
  bookedAt: Date | null,
  createdAt: Date,
  now: Date = new Date(),
): boolean {
  return (bookedAt ?? createdAt) >= carrierSyncWindowStart(now);
}

/** Statuses the sync job keeps checking. Everything else is finished or parked. */
export const SYNCABLE_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.BOOKED,
  ShipmentStatus.PROCESSING,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.OUT_FOR_DELIVERY,
];
