/**
 * utils/speedopostBookingPayload.test.ts
 *
 * What SpeedoPost is told about a consignment that is about to move.
 *
 * The rate tests next door pin what a quote SAYS. These pin what a booking
 * DOES, and the difference is that everything here has already been paid for.
 * Four risks, one group each:
 *
 *   1. THE PROVIDER CODE. SpeedoPost reads a missing `serviceProviderCode` as
 *      permission to pick a courier itself, and reports success. The whole
 *      point of decision D2 (the exact courier the customer paid for, or
 *      nothing) fails silently if that field ever goes missing.
 *
 *   2. TWO DATE FORMATS IN ONE BOOKING. CreateOrder wants DD-MM-YYYY,
 *      CreatePickupRequest wants YYYY-MM-DD. A single formatter used for both
 *      breaks whichever call runs second.
 *
 *   3. THEIR CLOCK IS IST. CreatePickupRequest rejects a slot in the past, and
 *      a slot computed in UTC is in the past at their end for most of the
 *      Indian working day.
 *
 *   4. THE DECLARED CONSIGNMENT. Weight and dimensions decide what gets
 *      charged after a re-weigh at the hub, and the warehouse name is the only
 *      key SpeedoPost has for a pickup address.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EWAYBILL_THRESHOLD_INR,
  SpeedoPostBookingDataError,
  buildCreateOrderPayload,
  buildPickupPayload,
  buildWarehousePayload,
  formatOrderDate,
  pickupDateForOrder,
  speedoPostPickupSlot,
  speedoPostWarehouseName,
} from "@/lib/booking-adapters/vendors/speedopost/speedopost.booking.mapper";
import type { CanonicalBookingRequest } from "@/lib/booking-adapters/core/types";

// ---------------------------------------------------------------------------

function bookingRequest(
  overrides: Partial<CanonicalBookingRequest> = {},
): CanonicalBookingRequest {
  return {
    reference: "cmf0shipment0001",
    displayReference: "ARN260905000042",
    orderDate: "2026-09-01",
    pickup: {
      contactName: "Anil Kumar",
      companyName: "Kumar Exports",
      phone: "9876543210",
      email: "anil@example.com",
      line1: "12 Industrial Estate",
      line2: "Andheri East",
      city: "Mumbai",
      state: "Maharashtra",
      postalCode: "400069",
    },
    delivery: {
      contactName: "Ravi Sharma",
      companyName: null,
      phone: "9812345678",
      email: null,
      line1: "44 Nehru Place",
      line2: "Block B",
      city: "New Delhi",
      state: "Delhi",
      postalCode: "110019",
    },
    parcels: [
      { quantity: 2, weightKg: 12.4, lengthCm: 40, widthCm: 30.5, heightCm: 25 },
    ],
    totalActualWeightKg: 24.8,
    items: [
      { name: "Cotton shirts", quantity: 20, unitValue: 400, hsCode: "6205" },
    ],
    declaredValue: 8000,
    payment: { type: "PREPAID" },
    freightCharge: 1200,
    service: {
      vendorId: "speedopost",
      courierId: "3765884",
      productName: "Delhivery Freight",
    },
    ...overrides,
  };
}

const ORDER_ARGS = {
  warehouseName: "ARN260905000042",
  courierId: "3765884",
  orderType: "B2B" as const,
  clientCode: "ARENA",
  pickupDate: new Date("2026-09-05T00:00:00.000Z"),
};

// ---------------------------------------------------------------------------
// 1. The provider code
// ---------------------------------------------------------------------------

describe("SpeedoPost CreateOrder: the courier the customer paid for", () => {
  it("sends the exact provider code", () => {
    const payload = buildCreateOrderPayload({
      request: bookingRequest(),
      ...ORDER_ARGS,
    });
    assert.equal(payload.serviceProviderCode, "3765884");
    assert.equal(payload.orderType, "B2B");
  });

  it("refuses to build a payload with no provider code", () => {
    // SpeedoPost's own words: "If provided, system assigns this exact service
    // provider; otherwise a random one is assigned." Omitting the field is not
    // a validation error at their end, it is a parcel on a courier nobody chose
    // at a price nobody quoted, reported as a success.
    assert.throws(
      () =>
        buildCreateOrderPayload({
          request: bookingRequest(),
          ...ORDER_ARGS,
          courierId: "   ",
        }),
      SpeedoPostBookingDataError,
    );
  });

  it("refuses to book without the client code they require", () => {
    assert.throws(
      () =>
        buildCreateOrderPayload({
          request: bookingRequest(),
          ...ORDER_ARGS,
          clientCode: "",
        }),
      /SPEEDOPOST_CLIENT_CODE/,
    );
  });

  it("sends the e-way bill number, digits only", () => {
    // The wizard collects it above the GST threshold and it goes to SpeedoPost
    // as a field on the order. A customer copying it off a printed challan
    // pastes it with spaces, and the courier must get the bare number.
    const payload = buildCreateOrderPayload({
      request: bookingRequest({
        declaredValue: 80_000,
        eWayBillNumber: "1234 5678 9012",
      }),
      ...ORDER_ARGS,
    });
    assert.equal(payload.ewaybill, "123456789012");
  });

  it("refuses a high-value consignment with no e-way bill number recorded", () => {
    // Their rule, enforced at their end above Rs 50,000. Refused here so the
    // message names the rule instead of arriving as whatever they call it, and
    // before anything has been created rather than after. It should not fire on
    // a booking made through the wizard, which asks for the number at the same
    // threshold; it fires on a row that predates the field.
    assert.throws(
      () =>
        buildCreateOrderPayload({
          request: bookingRequest({
            declaredValue: EWAYBILL_THRESHOLD_INR + 1,
            eWayBillNumber: null,
          }),
          ...ORDER_ARGS,
        }),
      /e-way bill/,
    );

    // The threshold is "exceeding", so a shipment exactly at the line needs
    // nothing and still books.
    assert.doesNotThrow(() =>
      buildCreateOrderPayload({
        request: bookingRequest({
          declaredValue: EWAYBILL_THRESHOLD_INR,
          eWayBillNumber: null,
        }),
        ...ORDER_ARGS,
      }),
    );
  });

  it("sends no e-way bill field when there is no number", () => {
    const payload = buildCreateOrderPayload({
      request: bookingRequest(),
      ...ORDER_ARGS,
    });
    assert.equal(payload.ewaybill, undefined);
  });
});

// ---------------------------------------------------------------------------
// 2. The two date formats
// ---------------------------------------------------------------------------

describe("SpeedoPost dates", () => {
  it("sends DD-MM-YYYY on the order and YYYY-MM-DD on the pickup", () => {
    // The single most likely bug in this integration: one shared date helper
    // applied to both endpoints, which works on whichever call is written first
    // and fails on the other.
    const slot = { date: "2026-09-05", time: "17:00:00" };

    const order = buildCreateOrderPayload({
      request: bookingRequest(),
      ...ORDER_ARGS,
      pickupDate: pickupDateForOrder(slot),
    });
    const pickup = buildPickupPayload({
      request: bookingRequest(),
      warehouseName: ORDER_ARGS.warehouseName,
      courierId: ORDER_ARGS.courierId,
      slot,
    });

    assert.equal(order.pickupDate, "05-09-2026");
    assert.equal(pickup.pickupDate, "2026-09-05");
    assert.notEqual(order.pickupDate, pickup.pickupDate);
  });

  it("formats a single-digit day and month with their leading zeros", () => {
    assert.equal(formatOrderDate(new Date("2026-01-07T00:00:00.000Z")), "07-01-2026");
  });
});

// ---------------------------------------------------------------------------
// 3. The IST pickup slot
// ---------------------------------------------------------------------------

describe("speedoPostPickupSlot", () => {
  it("asks for a collection today when the booking lands in the morning", () => {
    // 06:00 UTC is 11:30 IST.
    const slot = speedoPostPickupSlot(new Date("2026-09-05T06:00:00.000Z"));
    assert.equal(slot.sameDay, true);
    assert.equal(slot.date, "2026-09-05");
    assert.equal(slot.time, "17:00:00");
  });

  it("rolls to the next morning once the afternoon cutoff passes", () => {
    // 12:00 UTC is 17:30 IST, so a 17:00 slot today is already gone.
    const slot = speedoPostPickupSlot(new Date("2026-09-05T12:00:00.000Z"));
    assert.equal(slot.sameDay, false);
    assert.equal(slot.date, "2026-09-06");
    assert.equal(slot.time, "11:00:00");
  });

  it("reads the date in IST, not UTC", () => {
    // 20:00 UTC on the 5th is 01:30 IST on the SIXTH. A slot computed in UTC
    // would say the 5th, which is a date in the past at their end and exactly
    // the refusal captured in their own documentation.
    const slot = speedoPostPickupSlot(new Date("2026-09-05T20:00:00.000Z"));
    assert.equal(slot.date, "2026-09-06");
  });

  it("never asks for a date behind the IST day it was computed on", () => {
    // Swept across a full day at ten-minute steps, because the failure this
    // guards is a boundary one and only shows up in a few hours of the day.
    const start = Date.parse("2026-09-05T00:00:00.000Z");
    for (let minutes = 0; minutes < 24 * 60; minutes += 10) {
      const now = new Date(start + minutes * 60_000);
      const slot = speedoPostPickupSlot(now);
      const istToday = new Date(now.getTime() + (5 * 60 + 30) * 60_000)
        .toISOString()
        .slice(0, 10);
      assert.ok(
        slot.date >= istToday,
        `slot ${slot.date} is behind the IST day ${istToday}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The declared consignment
// ---------------------------------------------------------------------------

describe("SpeedoPost booking payloads", () => {
  it("declares the same weight the quote was priced on", () => {
    // Their weight field is KG, unlike Shipmozo's grams, so nothing converts.
    // Rounding to the gram rather than the kilogram is what keeps the booking
    // describing the consignment that was actually quoted.
    const payload = buildCreateOrderPayload({
      request: bookingRequest(),
      ...ORDER_ARGS,
    });
    assert.equal(payload.weight, 24.8);
    assert.equal(payload.dimensions[0].weight, 12.4);
  });

  it("never declares a box smaller than it is", () => {
    // Under-declaring is what gets a shipment re-measured at the hub and the
    // customer surcharged weeks later, so every figure rounds UP.
    const payload = buildCreateOrderPayload({
      request: bookingRequest({
        parcels: [
          { quantity: 1, weightKg: 0.4, lengthCm: 10.2, widthCm: 9.1, heightCm: 0.5 },
        ],
        totalActualWeightKg: 0.4,
      }),
      ...ORDER_ARGS,
    });

    assert.deepEqual(payload.dimensions, [
      { length: 11, width: 10, height: 1, weight: 0.4, count: 1 },
    ]);
  });

  it("counts every box, not every box group", () => {
    const payload = buildCreateOrderPayload({
      request: bookingRequest({
        parcels: [
          { quantity: 2, weightKg: 5, lengthCm: 20, widthCm: 20, heightCm: 20 },
          { quantity: 3, weightKg: 1, lengthCm: 10, widthCm: 10, heightCm: 10 },
        ],
        totalActualWeightKg: 13,
      }),
      ...ORDER_ARGS,
    });

    assert.equal(payload.totalQuantity, 5);
    assert.equal(payload.dimensions.length, 2);
  });

  it("sends COD as the goods value the receiver pays, not the freight", () => {
    const payload = buildCreateOrderPayload({
      request: bookingRequest({
        payment: { type: "COD", codAmount: 8000 },
        freightCharge: 1200,
      }),
      ...ORDER_ARGS,
    });

    assert.equal(payload.paymentType, "COD");
    assert.equal(payload.codAmount, 8000);
  });

  it("sends no COD amount on a prepaid order", () => {
    const payload = buildCreateOrderPayload({
      request: bookingRequest(),
      ...ORDER_ARGS,
    });
    assert.equal(payload.paymentType, "PP");
    assert.equal(payload.codAmount, undefined);
  });

  it("leaves the tax fields empty rather than inventing them", () => {
    // These are OUR invoice's figures and the invoice does not exist yet. A
    // computed stand-in would put a number on the carrier's manifest that
    // reconciles against nothing.
    const payload = buildCreateOrderPayload({
      request: bookingRequest(),
      ...ORDER_ARGS,
    });
    assert.equal(payload.sgstAmount, null);
    assert.equal(payload.cgstAmount, null);
    assert.equal(payload.igstAmount, null);
    assert.equal(payload.totalTaxValue, null);
  });

  it("keeps the second address line, which a driver needs", () => {
    const payload = buildCreateOrderPayload({
      request: bookingRequest(),
      ...ORDER_ARGS,
    });
    assert.equal(payload.receiverAddress, "44 Nehru Place, Block B");

    const warehouse = buildWarehousePayload(bookingRequest());
    assert.equal(warehouse.address, "12 Industrial Estate, Andheri East");
  });

  it("names the warehouse after the shipment, because the name is the key", () => {
    // SpeedoPost addresses a warehouse by NAME on both CreateOrder and
    // CreatePickupRequest, publishes no way to list them, and the namespace is
    // the whole account. A name derived from anything a customer types would
    // eventually collide across two tenants and ship one customer's parcel from
    // another customer's dock.
    const name = speedoPostWarehouseName(bookingRequest());
    assert.equal(name, "ARN260905000042");
    assert.equal(buildWarehousePayload(bookingRequest()).warehouseName, name);

    // Deterministic, which is what lets a retry after a lost CreateWarehouse
    // response address the one that already exists.
    assert.equal(name, speedoPostWarehouseName(bookingRequest()));
  });

  it("strips characters out of the warehouse name rather than sending them", () => {
    const name = speedoPostWarehouseName(
      bookingRequest({ displayReference: "ARN 26/09 #42" }),
    );
    assert.match(name, /^[A-Z0-9-]+$/);
  });

  it("asks the pickup for the whole consignment, not one box", () => {
    const pickup = buildPickupPayload({
      request: bookingRequest(),
      warehouseName: "ARN260905000042",
      courierId: "3765884",
      slot: { date: "2026-09-05", time: "17:00:00" },
    });

    assert.equal(pickup.expectedPacketCount, 2);
    assert.equal(pickup.expectedWeight, 24.8);
    assert.equal(pickup.serviceProviderCode, "3765884");
    assert.equal(pickup.warehouseName, "ARN260905000042");
  });
});
