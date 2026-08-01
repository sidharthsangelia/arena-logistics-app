/**
 * utils/shipmozoTracking.test.ts
 *
 * Shipmozo's tracking feed is free text, and the same words mean different
 * things depending on which booking they arrive for. Two failures are expensive
 * enough to be worth pinning down:
 *
 *   - "Undelivered — RTO initiated" contains the word "delivered". Read
 *     carelessly it emails a customer that their parcel arrived, on the very
 *     day it did the opposite.
 *   - A domestic "Delivered" is a real delivery; the identical line on an
 *     international booking means the parcel reached OUR hub. One map treating
 *     both alike would announce deliveries for shipments that have not flown.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ShipmentStatus } from "@/generated/prisma";
import {
  furthestShipmentStatus,
  isAutoAdvanceable,
  mapShipmozoStatusToShipment,
  shipmentStatusRank,
} from "@/lib/shipmozo/domesticStatusMap";
import { looksLikeShipmentNumber } from "@/lib/tracking/queryShape";
import {
  furthestFirstMileStage,
  mapShipmozoStatusToFirstMile,
} from "@/lib/shipmozo/firstMileStatusMap";
import { FirstMileStatus } from "@/generated/prisma";
import {
  isShipmozoOrderCancelled,
  mapShipmozoEventType,
  readScanLocation,
  readScanStatus,
  readShipmozoCarrier,
  readShipmozoScans,
} from "@/lib/shipmozo/trackShape";

// The scan history from Shipmozo's own documented tracking payload, newest
// first exactly as they send it.
const DELIVERED_FEED = [
  "Delivered to consignee",
  "Out for delivery",
  "Shipment Received at Facility",
  "Shipment picked up",
  "Out for Pickup",
  "Pickup scheduled",
];

describe("reading Shipmozo's two tracking shapes", () => {
  // Verbatim from Shipmozo's documented webhook payload.
  const WEBHOOK_BODY = {
    order_id: "xxxxxxxxxxx",
    refrence_id: "xxxx",
    awb_number: "xxxxxxxxxxx",
    carrier: "Delhivery",
    expected_delivery_date: "2025-07-15 18:29:59",
    shipment_type: "Forward",
    current_status: "Delivered",
    status_time: "2025-07-15 09:12:16",
    status_feed: {
      scan: [
        {
          date: "2025-07-14 09:12:16",
          status: "Delivered to consignee",
          location: "Mumbai_KurlaWest_R (Maharashtra)",
        },
        {
          date: "2025-07-14 06:08:36",
          status: "Out for delivery",
          location: "Mumbai_KurlaWest_R (Maharashtra)",
        },
      ],
    },
  };

  // Verbatim from a live GET /track-order against a real Arena booking. Note
  // `scan_detail` where the webhook says `status_feed.scan`, and an
  // `order_status` the webhook does not send at all.
  const API_BODY = {
    order_id: "56629AP422035319090",
    refrence_id: "cmsak52d3000rl80kswre7lua",
    awb_number: "153456560805730",
    rto_awb_number: "",
    courier: "XpressBees 2KG",
    order_status: "CANCELLED",
    expected_delivery_date: null,
    current_status: "Pickup Pending",
    status_time: "",
    scan_detail: [],
  };

  it("reads the webhook's scan feed", () => {
    const scans = readShipmozoScans(WEBHOOK_BODY);
    assert.equal(scans.length, 2);
    assert.equal(readScanStatus(scans[0]), "Delivered to consignee");
    assert.equal(readScanLocation(scans[0]), "Mumbai_KurlaWest_R (Maharashtra)");
  });

  it("reads the API's scan_detail, which the webhook shape alone would miss", () => {
    assert.deepEqual(readShipmozoScans(API_BODY), []);
    assert.equal(
      readShipmozoScans({ ...API_BODY, scan_detail: [{ status: "Shipment picked up" }] })
        .length,
      1,
    );
  });

  it("finds the carrier under either name", () => {
    assert.equal(readShipmozoCarrier(WEBHOOK_BODY), "Delhivery");
    assert.equal(readShipmozoCarrier(API_BODY), "XpressBees 2KG");
    assert.equal(readShipmozoCarrier({ carrier: "  " }), undefined);
  });

  it("spots a cancelled order behind a movement status that says otherwise", () => {
    // The live body above reports "Pickup Pending" on a CANCELLED order. Read
    // off current_status alone, a customer would be told to expect a pickup.
    assert.equal(isShipmozoOrderCancelled(API_BODY.order_status), true);
    assert.equal(isShipmozoOrderCancelled("READY_TO_SHIP"), false);
    assert.equal(isShipmozoOrderCancelled(undefined), false);
  });
});

describe("mapShipmozoEventType", () => {
  it("categorises the happy path", () => {
    assert.equal(mapShipmozoEventType("Delivered to consignee"), "delivered");
    assert.equal(mapShipmozoEventType("Out for delivery"), "out_for_delivery");
    assert.equal(mapShipmozoEventType("Shipment picked up"), "picked_up");
    assert.equal(
      mapShipmozoEventType("Shipment Received at Facility"),
      "in_transit",
    );
    assert.equal(mapShipmozoEventType("Pickup scheduled"), "booked");
  });

  it("does not paint a return or a failed attempt as a delivery", () => {
    assert.equal(mapShipmozoEventType("RTO Delivered"), "returned");
    assert.equal(mapShipmozoEventType("Return to origin"), "returned");
    assert.equal(mapShipmozoEventType("Undelivered"), "attempted");
    assert.equal(
      mapShipmozoEventType("Undelivered - Consignee not available"),
      "attempted",
    );
    assert.equal(mapShipmozoEventType("Cancelled"), "exception");
  });
});

describe("mapShipmozoStatusToShipment", () => {
  it("maps the documented happy path", () => {
    assert.equal(
      mapShipmozoStatusToShipment("Delivered to consignee"),
      ShipmentStatus.DELIVERED,
    );
    assert.equal(
      mapShipmozoStatusToShipment("Out for delivery"),
      ShipmentStatus.OUT_FOR_DELIVERY,
    );
    assert.equal(
      mapShipmozoStatusToShipment("Shipment Received at Facility"),
      ShipmentStatus.IN_TRANSIT,
    );
    assert.equal(
      mapShipmozoStatusToShipment("Shipment picked up"),
      ShipmentStatus.IN_TRANSIT,
    );
    assert.equal(
      mapShipmozoStatusToShipment("Pickup scheduled"),
      ShipmentStatus.BOOKED,
    );
    assert.equal(
      mapShipmozoStatusToShipment("Out for Pickup"),
      ShipmentStatus.BOOKED,
    );
  });

  it("never reads a return or a failed attempt as a delivery", () => {
    const notDeliveries = [
      "Undelivered",
      "Undelivered - Consignee not available",
      "RTO Delivered",
      "RTO Initiated",
      "Return to origin",
      "Not delivered",
      "Delivery attempt failed",
      "Cancelled",
      "Exception",
    ];
    for (const status of notDeliveries) {
      assert.equal(mapShipmozoStatusToShipment(status), null, status);
    }
  });

  it("ignores blank and unknown lines rather than guessing", () => {
    assert.equal(mapShipmozoStatusToShipment(""), null);
    assert.equal(mapShipmozoStatusToShipment(undefined), null);
    assert.equal(mapShipmozoStatusToShipment("Data received"), null);
  });
});

describe("furthestShipmentStatus", () => {
  it("takes the furthest stage the scan history proves", () => {
    assert.equal(
      furthestShipmentStatus("Delivered", DELIVERED_FEED),
      ShipmentStatus.DELIVERED,
    );
  });

  it("reads the history even when the headline status is unrecognised", () => {
    assert.equal(
      furthestShipmentStatus("Some new Shipmozo wording", DELIVERED_FEED),
      ShipmentStatus.DELIVERED,
    );
  });

  it("does not let an early scan drag a later one backwards", () => {
    // Shipmozo re-sends the whole history on every post, so BOOKED lines are
    // present long after the parcel has moved on.
    assert.equal(
      furthestShipmentStatus("Out for delivery", [
        "Out for delivery",
        "Shipment picked up",
        "Pickup scheduled",
      ]),
      ShipmentStatus.OUT_FOR_DELIVERY,
    );
  });

  it("returns null when a whole feed is RTO", () => {
    assert.equal(
      furthestShipmentStatus("RTO Delivered", [
        "RTO Delivered",
        "RTO In Transit",
        "RTO Initiated",
      ]),
      null,
    );
  });
});

describe("forward-only guards", () => {
  it("ranks the happy path in journey order", () => {
    const order = [
      ShipmentStatus.BOOKED,
      ShipmentStatus.PROCESSING,
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.OUT_FOR_DELIVERY,
      ShipmentStatus.DELIVERED,
    ];
    for (let i = 1; i < order.length; i++) {
      assert.ok(
        shipmentStatusRank(order[i]) > shipmentStatusRank(order[i - 1]),
        `${order[i]} should rank above ${order[i - 1]}`,
      );
    }
  });

  it("refuses to auto-advance a shipment a person parked off the path", () => {
    for (const status of [
      ShipmentStatus.ON_HOLD,
      ShipmentStatus.CANCELLED,
      ShipmentStatus.CUSTOMS_HOLD,
      ShipmentStatus.DOCUMENTS_PENDING,
      ShipmentStatus.DRAFT,
      ShipmentStatus.PENDING_PAYMENT,
    ]) {
      assert.equal(isAutoAdvanceable(status), false, status);
    }
  });
});

describe("mapShipmozoStatusToFirstMile", () => {
  it("reads a hub arrival off the words that prove one", () => {
    assert.equal(
      mapShipmozoStatusToFirstMile("Delivered"),
      FirstMileStatus.ARRIVED_AT_HUB,
    );
    assert.equal(
      mapShipmozoStatusToFirstMile("Shipment Received at Facility"),
      FirstMileStatus.ARRIVED_AT_HUB,
    );
    assert.equal(
      mapShipmozoStatusToFirstMile("Shipment picked up"),
      FirstMileStatus.PICKED_UP,
    );
    assert.equal(
      mapShipmozoStatusToFirstMile("Pickup scheduled"),
      FirstMileStatus.SCHEDULED,
    );
  });

  it("does not read a return as a hub arrival", () => {
    // ARRIVED_AT_HUB is what makes a pay-on-arrival booking collectable, so a
    // parcel coming BACK must never reach it: the customer would be billed for
    // the parcel arriving somewhere it never got to.
    for (const status of [
      "Undelivered",
      "Undelivered - Consignee not available",
      "RTO Delivered",
      "RTO Initiated",
      "Return to origin",
      "Pickup failed",
      "Cancelled",
    ]) {
      assert.equal(mapShipmozoStatusToFirstMile(status), null, status);
    }
  });

  it("ignores an RTO line buried in an otherwise normal feed", () => {
    assert.equal(
      furthestFirstMileStage("RTO Initiated", [
        "RTO Initiated",
        "Shipment picked up",
        "Pickup scheduled",
      ]),
      FirstMileStatus.PICKED_UP,
    );
  });
});

describe("looksLikeShipmentNumber", () => {
  it("recognises both formats we have ever issued", () => {
    assert.equal(looksLikeShipmentNumber("ARN260130748291"), true);
    assert.equal(looksLikeShipmentNumber("arn260130748291"), true);
    assert.equal(looksLikeShipmentNumber("  ARN260130748291  "), true);
    assert.equal(looksLikeShipmentNumber("SHP-2026-00042"), true);
  });

  it("does not claim a carrier AWB as one of ours", () => {
    // These must fall through to the vendor fan-out, not to "not found".
    const awbs = [
      "1234567890",
      "176-12345678",
      "SG123456789IN",
      "AWB0012345",
      "",
      "ARN",
    ];
    for (const awb of awbs) {
      assert.equal(looksLikeShipmentNumber(awb), false, awb);
    }
  });
});
