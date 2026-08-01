/**
 * utils/domesticCourierBooking.test.ts
 *
 * What we declare to a domestic courier, and what we refuse to declare.
 *
 * Two modules, one risk each:
 *
 *   1. The Shipmozo mapper. Weight crosses a unit boundary (kg → g) and the
 *      dimensions cross a cardinality one (many boxes → one L/W/H). Both fail
 *      silently: the order is accepted, the parcel is weighed at the hub, and
 *      the customer is surcharged weeks later. Every conversion here rounds UP
 *      for that reason, and these tests pin it.
 *   2. The request builder's refusals. Each one is a booking that must fail
 *      permanently rather than be retried four times and then quietly not
 *      exist. A missing phone number on the delivery address is the example
 *      that actually happens.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPushOrderPayload,
  buildWarehousePayload,
  toGrams,
} from "@/lib/booking-adapters/vendors/shipmozo/shipmozo.booking.mapper";
import type { CanonicalBookingRequest } from "@/lib/booking-adapters/core/types";
import { withPushOrderDefaults } from "@/lib/shipmozo/pushOrderDefaults";
import {
  DomesticBookingDataError,
  buildDomesticBookingRequest,
  readServiceSnapshot,
  resolveBookingVendorId,
} from "@/lib/booking/domesticCourier";
import { normalizeIndianMobile } from "@/lib/booking/phone";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRequest(
  overrides: Partial<CanonicalBookingRequest> = {},
): CanonicalBookingRequest {
  return {
    reference: "cm_shipment_1",
    displayReference: "ARN260130748291",
    orderDate: "2026-08-01",
    pickup: {
      contactName: "Adnan Khan",
      companyName: "Khan Exports",
      phone: "9876543210",
      email: "adnan@example.com",
      line1: "12 Nehru Place",
      line2: null,
      city: "New Delhi",
      state: "Delhi",
      postalCode: "110019",
    },
    delivery: {
      contactName: "Priya Nair",
      companyName: null,
      phone: "9123456780",
      email: null,
      line1: "44 MG Road",
      line2: "Near the metro",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
    },
    parcels: [
      { quantity: 1, weightKg: 2.4, lengthCm: 30, widthCm: 20, heightCm: 10 },
      { quantity: 2, weightKg: 1.1, lengthCm: 25, widthCm: 25, heightCm: 15 },
    ],
    totalActualWeightKg: 4.6,
    items: [
      { name: "Cotton shirts", quantity: 3, unitValue: 800, hsCode: "6205" },
      { name: "Silk scarf", quantity: 1, unitValue: 1200, hsCode: null },
    ],
    declaredValue: 3600,
    payment: { type: "PREPAID" },
    freightCharge: 742.5,
    service: {
      vendorId: "shipmozo",
      courierId: "17",
      productName: "Delhivery Surface",
    },
    ...overrides,
  };
}

/** The shape buildDomesticBookingRequest reads, minus Prisma's machinery. */
function makeShipmentRow(overrides: Record<string, unknown> = {}) {
  const address = {
    contactName: "Adnan Khan",
    companyName: null,
    contactPhone: "9876543210",
    contactEmail: "adnan@example.com",
    line1: "12 Nehru Place",
    line2: null,
    city: "New Delhi",
    state: "Delhi",
    postalCode: "110019",
  };

  return {
    id: "cm_shipment_1",
    shipmentNumber: "ARN260130748291",
    orgId: "org_1",
    mode: "DOMESTIC",
    status: "BOOKED",
    bookedAt: new Date("2026-08-01T09:30:00Z"),
    createdAt: new Date("2026-07-31T18:00:00Z"),
    codEnabled: false,
    codAmount: null,
    quotedTotal: 742.5,
    totalActualWeightKg: 4.6,
    selectedVendorId: "shipmozo",
    selectedProductName: "Delhivery Surface",
    chargesSnapshot: { vendorId: "shipmozo", courierId: "17" },
    domesticCourierVendorId: null,
    domesticCourierOrderId: null,
    domesticCourierWarehouseId: null,
    domesticCourierName: null,
    domesticCourierStatus: "PENDING",
    domesticAwbNumber: null,
    domesticTrackingUrl: null,
    domesticLabelDocumentId: null,
    org: { name: "Khan Exports" },
    pickupAddress: address,
    deliveryAddress: {
      ...address,
      contactName: "Priya Nair",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
    },
    packages: [
      {
        description: "Apparel carton",
        quantity: 1,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 10,
        weightKg: 4.6,
        declaredValue: 3600,
        contents: [
          {
            description: "Cotton shirts",
            quantity: 3,
            unitValue: 800,
            hsCode: "6205",
          },
        ],
      },
    ],
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asShipment = (row: Record<string, unknown>) => row as any;

// ---------------------------------------------------------------------------

describe("shipmozo push-order payload", () => {
  it("sends weight in grams, rounded up", () => {
    const payload = buildPushOrderPayload(makeRequest(), "wh_1");
    assert.equal(payload.weight, "4600");
  });

  it("never declares a zero or fractional gram weight", () => {
    // A 1g floor rather than 0: Shipmozo rejects a zero-weight order, and a
    // booking that cannot be pushed is worse than one that is 1g heavy.
    assert.equal(toGrams(0), 1);
    assert.equal(toGrams(-3), 1);
    assert.equal(toGrams(0.0004), 1);
    assert.equal(toGrams(1.0001), 1001);
  });

  it("sends the largest dimension of every box, never the first or the sum", () => {
    const payload = buildPushOrderPayload(makeRequest(), "wh_1");
    // Boxes are 30x20x10 and 25x25x15.
    assert.equal(payload.length, "30");
    assert.equal(payload.width, "25");
    assert.equal(payload.height, "15");
  });

  it("rounds fractional dimensions up", () => {
    const payload = buildPushOrderPayload(
      makeRequest({
        parcels: [
          { quantity: 1, weightKg: 1, lengthCm: 10.2, widthCm: 5.7, heightCm: 0.4 },
        ],
      }),
      "wh_1",
    );
    assert.equal(payload.length, "11");
    assert.equal(payload.width, "6");
    // A box cannot be declared as zero-height.
    assert.equal(payload.height, "1");
  });

  it("carries our shipment id as the order reference so webhooks match", () => {
    const payload = buildPushOrderPayload(makeRequest(), "wh_1");
    assert.equal(payload.order_id, "cm_shipment_1");
    assert.equal(payload.warehouse_id, "wh_1");
    assert.equal(payload.shipment_type, "FORWARD");
  });

  it("maps every content line, keeping HSN where there is one", () => {
    const payload = buildPushOrderPayload(makeRequest(), "wh_1");
    assert.deepEqual(payload.product_detail, [
      { name: "Cotton shirts", quantity: 3, unit_price: 800, hsn: "6205" },
      { name: "Silk scarf", quantity: 1, unit_price: 1200, hsn: undefined },
    ]);
  });

  it("substitutes one generic line rather than pushing an empty order", () => {
    const payload = buildPushOrderPayload(
      makeRequest({ items: [] }),
      "wh_1",
    );
    assert.deepEqual(payload.product_detail, [
      { name: "General Cargo", quantity: 1, unit_price: 3600 },
    ]);
  });

  it("omits cod_amount on a prepaid order", () => {
    const payload = buildPushOrderPayload(makeRequest(), "wh_1");
    assert.equal(payload.payment_type, "PREPAID");
    assert.equal(payload.cod_amount, undefined);
  });

  it("sends the COD amount the receiver owes, not the freight", () => {
    const payload = buildPushOrderPayload(
      makeRequest({
        payment: { type: "COD", codAmount: 3600 },
        freightCharge: 742.5,
      }),
      "wh_1",
    );
    assert.equal(payload.payment_type, "COD");
    assert.equal(payload.cod_amount, "3600");
    assert.equal(payload.shipping_charges, "742.5");
  });

  it("registers the pickup address as the warehouse, titled by shipment", () => {
    const warehouse = buildWarehousePayload(makeRequest());
    assert.equal(warehouse.address_title, "Pickup ARN260130748291");
    assert.equal(warehouse.pin_code, "110019");
    assert.equal(warehouse.phone, "9876543210");
  });
});

// ---------------------------------------------------------------------------

describe("domestic booking request builder", () => {
  it("builds a request from a booked shipment", () => {
    const request = buildDomesticBookingRequest(asShipment(makeShipmentRow()));

    assert.equal(request.reference, "cm_shipment_1");
    assert.equal(request.displayReference, "ARN260130748291");
    assert.equal(request.service.vendorId, "shipmozo");
    assert.equal(request.service.courierId, "17");
    assert.equal(request.payment.type, "PREPAID");
    assert.equal(request.totalActualWeightKg, 4.6);
    assert.equal(request.declaredValue, 2400); // 3 shirts × 800
  });

  it("dates the order from when it was booked, not from today", () => {
    // A retry a week later must not tell the courier the order is a week old.
    const request = buildDomesticBookingRequest(asShipment(makeShipmentRow()));
    assert.equal(request.orderDate, "2026-08-01");
  });

  it("carries COD through as the goods value the courier collects", () => {
    const request = buildDomesticBookingRequest(
      asShipment(makeShipmentRow({ codEnabled: true, codAmount: 5000 })),
    );
    assert.deepEqual(request.payment, { type: "COD", codAmount: 5000 });
  });

  it("refuses a delivery address with no phone number", () => {
    const row = makeShipmentRow();
    const deliveryAddress = {
      ...(row.deliveryAddress as object),
      contactPhone: "  ",
    };

    assert.throws(
      () =>
        buildDomesticBookingRequest(asShipment({ ...row, deliveryAddress })),
      (err: unknown) =>
        err instanceof DomesticBookingDataError &&
        /delivery address has no phone number/i.test(err.message),
    );
  });

  it("refuses a delivery address with no state", () => {
    const row = makeShipmentRow();
    const deliveryAddress = { ...(row.deliveryAddress as object), state: null };

    assert.throws(
      () =>
        buildDomesticBookingRequest(asShipment({ ...row, deliveryAddress })),
      DomesticBookingDataError,
    );
  });

  it("refuses a shipment with no packages", () => {
    assert.throws(
      () =>
        buildDomesticBookingRequest(asShipment(makeShipmentRow({ packages: [] }))),
      DomesticBookingDataError,
    );
  });

  it("refuses a weightless shipment", () => {
    const row = makeShipmentRow({
      totalActualWeightKg: null,
      packages: [
        {
          description: "Empty",
          quantity: 1,
          lengthCm: 10,
          widthCm: 10,
          heightCm: 10,
          weightKg: 0,
          declaredValue: 100,
          contents: [],
        },
      ],
    });

    assert.throws(
      () => buildDomesticBookingRequest(asShipment(row)),
      DomesticBookingDataError,
    );
  });

  it("falls back to the box weights when no total was stored", () => {
    const request = buildDomesticBookingRequest(
      asShipment(makeShipmentRow({ totalActualWeightKg: null })),
    );
    assert.equal(request.totalActualWeightKg, 4.6);
  });
});

// ---------------------------------------------------------------------------

describe("shipmozo push-order defaults", () => {
  // Shipmozo reads posted keys without checking they exist, so an omitted
  // optional is not "no value", it is a refused order:
  //   Shipmozo push-order error: Error {"error":"Undefined array key "discount""}
  // These tests exist so the next optional field we skip fails here instead.

  it("fills every product key Shipmozo reads, including discount", () => {
    const sent = withPushOrderDefaults(
      buildPushOrderPayload(makeRequest(), "wh_1"),
    );

    for (const product of sent.product_detail) {
      assert.deepEqual(Object.keys(product).sort(), [
        "discount",
        "hsn",
        "name",
        "product_category",
        "quantity",
        "sku_number",
        "unit_price",
      ]);
    }
  });

  it("fills every top-level key, even on a prepaid order with no COD", () => {
    const sent = withPushOrderDefaults(
      buildPushOrderPayload(makeRequest(), "wh_1"),
    );

    for (const key of [
      "consignee_alternate_phone",
      "consignee_email",
      "consignee_address_line_two",
      "cod_amount",
      "shipping_charges",
      "gst_ewaybill_number",
      "gstin_number",
    ]) {
      assert.ok(key in sent, `${key} must be present, Shipmozo reads it`);
      assert.notEqual(
        (sent as unknown as Record<string, unknown>)[key],
        undefined,
        `${key} must not be undefined`,
      );
    }
    assert.equal(sent.cod_amount, "");
  });

  it("never lets a default overwrite a real value", () => {
    const request = makeRequest({
      payment: { type: "COD", codAmount: 3600 },
      delivery: {
        ...makeRequest().delivery,
        email: "priya@example.com",
      },
    });
    const sent = withPushOrderDefaults(buildPushOrderPayload(request, "wh_1"));

    assert.equal(sent.cod_amount, "3600");
    assert.equal(sent.consignee_email, "priya@example.com");
    assert.equal(sent.consignee_address_line_two, "Near the metro");
    assert.equal(sent.product_detail[0].name, "Cotton shirts");
    assert.equal(sent.product_detail[0].hsn, "6205");
    assert.equal(sent.product_detail[0].quantity, 3);
    // The line with no HS code gets the empty default, not a missing key.
    assert.equal(sent.product_detail[1].hsn, "");
  });
});

// ---------------------------------------------------------------------------

describe("Indian mobile numbers", () => {
  it("rejects the nine-digit number that a courier refused in production", () => {
    // Shipment ARN260801972654. Nine digits passed the form's min(8) rule,
    // reached Shipmozo, and came back as the message "Error", five times.
    assert.equal(normalizeIndianMobile("995342200"), null);
  });

  it("accepts ten bare digits", () => {
    assert.equal(normalizeIndianMobile("9650831703"), "9650831703");
  });

  it("strips the decorations people actually type", () => {
    assert.equal(normalizeIndianMobile("+91 96508 31703"), "9650831703");
    assert.equal(normalizeIndianMobile("91-9650831703"), "9650831703");
    assert.equal(normalizeIndianMobile("09650831703"), "9650831703");
    assert.equal(normalizeIndianMobile("0091 9650831703"), "9650831703");
    assert.equal(normalizeIndianMobile("(965) 083-1703"), "9650831703");
  });

  it("rejects landlines and anything the wrong length", () => {
    // Couriers SMS the recipient, so a landline is not usable.
    assert.equal(normalizeIndianMobile("1123456789"), null);
    assert.equal(normalizeIndianMobile("5650831703"), null);
    assert.equal(normalizeIndianMobile("96508317031"), null);
    assert.equal(normalizeIndianMobile(""), null);
    assert.equal(normalizeIndianMobile(null), null);
    assert.equal(normalizeIndianMobile("not a phone"), null);
  });

  it("refuses to build a booking on an unusable delivery phone", () => {
    const row = makeShipmentRow();
    const deliveryAddress = {
      ...(row.deliveryAddress as object),
      contactPhone: "995342200",
    };

    assert.throws(
      () => buildDomesticBookingRequest(asShipment({ ...row, deliveryAddress })),
      (err: unknown) =>
        err instanceof DomesticBookingDataError &&
        /delivery phone number \(995342200\) is not a valid Indian mobile/i.test(
          err.message,
        ),
    );
  });

  it("sends the courier bare digits even when the address is decorated", () => {
    const row = makeShipmentRow();
    const deliveryAddress = {
      ...(row.deliveryAddress as object),
      contactPhone: "+91 99534 22001",
    };

    const request = buildDomesticBookingRequest(
      asShipment({ ...row, deliveryAddress }),
    );
    assert.equal(request.delivery.phone, "9953422001");
  });
});

// ---------------------------------------------------------------------------

describe("vendor resolution", () => {
  it("prefers the vendor that already holds the order", () => {
    const vendorId = resolveBookingVendorId(
      asShipment({
        domesticCourierVendorId: "shipmozo",
        selectedVendorId: "delhivery",
        chargesSnapshot: null,
      }),
    );
    assert.equal(vendorId, "shipmozo");
  });

  it("falls back to the vendor that quoted it", () => {
    const vendorId = resolveBookingVendorId(
      asShipment({
        domesticCourierVendorId: null,
        selectedVendorId: "delhivery",
        chargesSnapshot: null,
      }),
    );
    assert.equal(vendorId, "delhivery");
  });

  it("returns null rather than guessing when nothing is recorded", () => {
    const vendorId = resolveBookingVendorId(
      asShipment({
        domesticCourierVendorId: null,
        selectedVendorId: null,
        chargesSnapshot: null,
      }),
    );
    assert.equal(vendorId, null);
  });

  it("reads a malformed snapshot as empty instead of throwing", () => {
    assert.deepEqual(readServiceSnapshot(asShipment({ chargesSnapshot: "oops" })), {});
    assert.deepEqual(readServiceSnapshot(asShipment({ chargesSnapshot: [1, 2] })), {});
    assert.deepEqual(readServiceSnapshot(asShipment({ chargesSnapshot: null })), {});
  });
});
