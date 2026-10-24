/**
 * utils/carrierStatus.test.ts
 *
 * deriveCarrierStatus decides when a customer is emailed "Delivered" off a
 * carrier's scans, with nobody checking first. The cases pinned here are the
 * ones that would send a wrong email or move a shipment ops parked:
 *
 *   - a first-mile "delivered" is the parcel reaching OUR hub, not the receiver
 *   - an admin line after delivery ("Shipment charges paid") must not hide it
 *   - problem scans alert, never move; a later delivery clears the alert
 *   - forward only, and never out of a parked status
 *   - nothing booked before the sync existed, or long dead, ever moves
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ShipmentStatus } from "@/generated/prisma";
import type { TrackingEvent } from "@/lib/tracking-adapters/core/tracking.types";
import {
  CARRIER_SYNC_BASE_HOURS,
  CARRIER_SYNC_STARTS_AT,
  CARRIER_SYNC_TIERS,
  carrierSyncSlotHour,
  deriveCarrierStatus,
  isCarrierSyncEligible,
  isDueForCarrierSync,
  shouldAdvance,
} from "@/lib/tracking/carrierStatus";

function scan(
  eventType: TrackingEvent["eventType"],
  timestamp: string,
  extra: Partial<TrackingEvent> = {},
): TrackingEvent {
  return {
    eventType,
    timestamp,
    status: eventType,
    description: "",
    location: "",
    ...extra,
  };
}

describe("deriveCarrierStatus", () => {
  it("takes the furthest happy-path scan, whatever order they arrive in", () => {
    const v = deriveCarrierStatus([
      scan("in_transit", "2026-10-02T10:00:00Z"),
      scan("delivered", "2026-10-04T10:00:00Z"),
      scan("booked", "2026-10-01T10:00:00Z"),
      scan("out_for_delivery", "2026-10-03T10:00:00Z"),
    ]);
    assert.equal(v.target, ShipmentStatus.DELIVERED);
    assert.equal(v.source?.timestamp, "2026-10-04T10:00:00Z");
    assert.equal(v.problem, null);
  });

  it("treats a pickup scan as in transit and a booking scan as nothing", () => {
    assert.equal(
      deriveCarrierStatus([scan("picked_up", "2026-10-01T10:00:00Z")]).target,
      ShipmentStatus.IN_TRANSIT,
    );
    assert.equal(
      deriveCarrierStatus([scan("booked", "2026-10-01T10:00:00Z")]).target,
      null,
    );
  });

  it("ignores the first-mile leg, whose 'delivered' means our hub", () => {
    const v = deriveCarrierStatus([
      scan("delivered", "2026-10-02T10:00:00Z", { leg: "first_mile" }),
      scan("booked", "2026-10-01T10:00:00Z", { leg: "main" }),
    ]);
    assert.equal(v.target, null);
  });

  it("keeps Delivered when an unclassified admin line follows it", () => {
    const v = deriveCarrierStatus([
      scan("unknown", "2026-10-05T10:00:00Z", { status: "Shipment charges paid" }),
      scan("delivered", "2026-10-04T10:00:00Z"),
    ]);
    assert.equal(v.target, ShipmentStatus.DELIVERED);
    assert.equal(v.problem, null);
  });

  it("reports a problem that is the latest word, without moving past it", () => {
    const v = deriveCarrierStatus([
      scan("in_transit", "2026-10-02T10:00:00Z"),
      scan("attempted", "2026-10-03T10:00:00Z"),
    ]);
    assert.equal(v.target, ShipmentStatus.IN_TRANSIT);
    assert.equal(v.problem?.eventType, "attempted");
  });

  it("drops a problem the parcel has since moved past", () => {
    const v = deriveCarrierStatus([
      scan("exception", "2026-10-02T10:00:00Z"),
      scan("in_transit", "2026-10-03T10:00:00Z"),
    ]);
    assert.equal(v.problem, null);
  });

  it("never reports a problem on a delivered parcel", () => {
    const v = deriveCarrierStatus([
      scan("delivered", "2026-10-02T10:00:00Z"),
      scan("returned", "2026-10-03T10:00:00Z"),
    ]);
    assert.equal(v.problem, null);
  });
});

describe("shouldAdvance", () => {
  it("moves forward only", () => {
    assert.equal(shouldAdvance(ShipmentStatus.BOOKED, ShipmentStatus.DELIVERED), true);
    assert.equal(shouldAdvance(ShipmentStatus.DELIVERED, ShipmentStatus.IN_TRANSIT), false);
    assert.equal(shouldAdvance(ShipmentStatus.IN_TRANSIT, ShipmentStatus.IN_TRANSIT), false);
    assert.equal(shouldAdvance(ShipmentStatus.BOOKED, null), false);
  });

  it("never moves a shipment ops parked", () => {
    for (const parked of [
      ShipmentStatus.ON_HOLD,
      ShipmentStatus.CANCELLED,
      ShipmentStatus.CUSTOMS_HOLD,
      ShipmentStatus.DOCUMENTS_PENDING,
    ]) {
      assert.equal(shouldAdvance(parked, ShipmentStatus.DELIVERED), false, parked);
    }
  });
});

describe("isCarrierSyncEligible", () => {
  const day = 24 * 60 * 60 * 1000;
  const start = CARRIER_SYNC_STARTS_AT.getTime();

  it("leaves anything booked before the start date alone", () => {
    const now = new Date(start + 2 * day);
    assert.equal(isCarrierSyncEligible(new Date(start - 1), new Date(start - 1), now), false);
    assert.equal(isCarrierSyncEligible(new Date(start), new Date(start), now), true);
  });

  it("stops checking a shipment 30 days after booking", () => {
    const booked = new Date(start + day);
    assert.equal(isCarrierSyncEligible(booked, booked, new Date(booked.getTime() + 29 * day)), true);
    assert.equal(isCarrierSyncEligible(booked, booked, new Date(booked.getTime() + 31 * day)), false);
  });

  it("falls back to the creation date when bookedAt is missing", () => {
    const now = new Date(start + 2 * day);
    assert.equal(isCarrierSyncEligible(null, new Date(start + day), now), true);
    assert.equal(isCarrierSyncEligible(null, new Date(start - day), now), false);
  });
});

describe("the sync job's age tiers", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date("2026-11-20T06:45:00Z"); // 12:15 IST
  const bookedDaysAgo = (d: number) => new Date(now.getTime() - d * day);
  const slots = [0, 4, 8, 12, 16, 20];
  const dueSlots = (status: ShipmentStatus, ageDays: number) =>
    slots.filter((h) =>
      isDueForCarrierSync(status, bookedDaysAgo(ageDays), bookedDaysAgo(ageDays), h, now),
    );

  it("every tier is a multiple of the job's base interval", () => {
    // A tier of, say, 6h would silently run every 4h or 12h instead.
    for (const tier of CARRIER_SYNC_TIERS) {
      assert.equal(tier.everyHours % CARRIER_SYNC_BASE_HOURS, 0, String(tier.everyHours));
    }
  });

  it("checks every 4h in week one, 8h in week two, 12h after", () => {
    assert.deepEqual(dueSlots(ShipmentStatus.IN_TRANSIT, 3), [0, 4, 8, 12, 16, 20]);
    assert.deepEqual(dueSlots(ShipmentStatus.IN_TRANSIT, 9), [0, 8, 16]);
    assert.deepEqual(dueSlots(ShipmentStatus.IN_TRANSIT, 17), [0, 12]);
  });

  it("stops after 21 days", () => {
    assert.deepEqual(dueSlots(ShipmentStatus.IN_TRANSIT, 22), []);
  });

  it("always checks Out for delivery, until the cut-off", () => {
    assert.deepEqual(dueSlots(ShipmentStatus.OUT_FOR_DELIVERY, 17), slots);
    assert.deepEqual(dueSlots(ShipmentStatus.OUT_FOR_DELIVERY, 22), []);
  });

  it("maps a run to its IST slot, late starts included", () => {
    assert.equal(carrierSyncSlotHour(new Date("2026-11-20T18:45:00Z")), 0); // 00:15 IST
    assert.equal(carrierSyncSlotHour(new Date("2026-11-20T06:45:00Z")), 12); // 12:15 IST
    assert.equal(carrierSyncSlotHour(new Date("2026-11-20T09:20:00Z")), 12); // 14:50 IST, late
  });
});
