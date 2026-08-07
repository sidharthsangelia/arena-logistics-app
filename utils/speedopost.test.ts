/**
 * utils/speedopost.test.ts
 *
 * The SpeedoPost readings that cost money if they are wrong.
 *
 * Three risks, and one test group each:
 *
 *   1. THE TAX SPLIT. SpeedoPost returns two different shapes from the same
 *      endpoint and only one of them carries GST. Whatever comes out of here
 *      lands on a customer's tax invoice, so a guessed 18% is a number nobody
 *      can reconcile against the carrier. These pin that we report what they
 *      sent and nothing more.
 *
 *   2. STATUS WORDS. "Undelivered" contains "delivered". So does "RTO
 *      Delivered". Read carelessly, either one emails a customer that their
 *      parcel arrived on the day it did the opposite. Same rule and same reason
 *      as utils/shipmozoTracking.test.ts, which pins the Shipmozo half.
 *
 *   3. PRODUCT NAMES. lib/booking/domesticCourierResolve.ts recovers a courier
 *      id by re-quoting a lane and matching the STORED product name against the
 *      fresh one. A name that is not deterministic breaks that lookup silently,
 *      and the shipment then cannot be booked on the service it was sold as.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  inferSpeedoPostSegment,
  speedoPostServiceName,
} from "@/lib/speedopost/courierCatalogue";
import {
  buildSpeedoPostRatePayloads,
  dedupeSpeedoPostQuotes,
  mapSpeedoPostOption,
  mapSpeedoPostSegment,
} from "@/lib/speedopost/rateShape";
import {
  mapSpeedoPostEventType,
  readScanDescription,
  readScanLocation,
  toIsoFromIst,
} from "@/lib/speedopost/trackShape";
import type { CanonicalRateRequest } from "@/lib/rate-adapters/core/types";
import type { SpeedoPostRateOption } from "@/lib/speedopost/types";

const VENDOR = { vendorId: "speedopost", vendorName: "SpeedoPost" };

// ---------------------------------------------------------------------------
// 1. Product names
// ---------------------------------------------------------------------------

describe("speedoPostServiceName", () => {
  it("cleans the provider labels their own documentation shows", () => {
    // Every raw name in vendor-api-docs/speedopost.json, in the segment it was
    // documented under.
    assert.equal(speedoPostServiceName("DELHIVERYB2C_VK", "B2C"), "Delhivery");
    assert.equal(
      speedoPostServiceName("DELHIVERYB2B_VK", "B2B"),
      "Delhivery Freight",
    );
    assert.equal(speedoPostServiceName("GATI B2B", "B2B"), "Gati Freight");
    assert.equal(speedoPostServiceName("Oxyzen B2B", "B2B"), "Oxyzen Freight");
    assert.equal(
      speedoPostServiceName("DELHIVERY_DENSE", "B2C"),
      "Delhivery Dense",
    );
    assert.equal(speedoPostServiceName("MOVINB2B", "B2B"), "MOVIN Freight");
    assert.equal(
      speedoPostServiceName("CLASSIC_STRIPES_B2B", "B2B"),
      "Classic Stripes Freight",
    );
    assert.equal(
      speedoPostServiceName("DP World Surface", "B2B"),
      "DP World Surface Freight",
    );
    assert.equal(speedoPostServiceName("NEXDROP", "B2C"), "NexDrop");
  });

  it("cleans the provider labels LIVE traffic actually returns", () => {
    // Captured from admin.speedopost.com, Gurgaon to Kolkata, 10 kg. Several of
    // these shapes do not appear anywhere in their documentation.
    assert.equal(speedoPostServiceName("Shadowfax", "B2C"), "Shadowfax");
    assert.equal(speedoPostServiceName("Ekart Surface", "B2C"), "Ekart Surface");
    assert.equal(speedoPostServiceName("GATI", "B2B"), "Gati Freight");
    assert.equal(speedoPostServiceName("Parivahan", "B2B"), "Parivahan Freight");
    assert.equal(speedoPostServiceName("FRETEX B2B", "B2B"), "Fretex Freight");
    assert.equal(speedoPostServiceName("MOVIN AIR", "B2B"), "MOVIN Air Freight");
    assert.equal(
      speedoPostServiceName("New_First_Line", "B2B"),
      "New First Line Freight",
    );
  });

  it("keeps slab codes in caps, not sentence case", () => {
    // "6cft" reads as a typo. These are cubic-feet slabs on the Delhivery B2B
    // lanes and they are the only thing separating two real products.
    assert.equal(
      speedoPostServiceName("DELHIVERY B2B 6CFT", "B2B"),
      "Delhivery 6CFT Freight",
    );
    assert.equal(
      speedoPostServiceName("DELHIVERY_B2B_10CFT", "B2B"),
      "Delhivery 10CFT Freight",
    );
  });

  it("strips a segment tag their documentation never showed", () => {
    // "B2BC". Matched by shape, so the next variant needs no code change.
    assert.equal(
      speedoPostServiceName("DELHIVERY B2BC 10CFT", "B2B"),
      "Delhivery 10CFT Freight",
    );
  });

  it("strips the origin-hub codes off the Blue Dart lanes", () => {
    // Live returns Bluedart_PNK and Bluedart_DEL as separate providers. The
    // suffix is a hub, not a service the customer is choosing between.
    assert.equal(speedoPostServiceName("Bluedart_PNK", "B2B"), "Blue Dart Freight");
    assert.equal(speedoPostServiceName("Bluedart_DEL", "B2B"), "Blue Dart Freight");
  });

  it("keeps a provider distinguishable across the two segments", () => {
    // Both networks carry Delhivery under different provider codes. Identical
    // names would make the two quotes indistinguishable to the booking flow's
    // name matching, which is how a customer ends up on the wrong service.
    assert.notEqual(
      speedoPostServiceName("DELHIVERYB2C_VK", "B2C"),
      speedoPostServiceName("DELHIVERYB2B_VK", "B2B"),
    );
  });

  it("shows a provider it has never seen rather than hiding it", () => {
    // The catalogue is display polish, never a filter. An unknown provider must
    // still appear as a purchasable option.
    assert.equal(
      speedoPostServiceName("SOME_NEW_COURIER_B2C", "B2C"),
      "Some New Courier",
    );
    assert.equal(speedoPostServiceName("", "B2C"), "Courier");
    assert.equal(speedoPostServiceName(null, "B2B"), "Courier Freight");
  });

  it("is deterministic, because the booking flow re-quotes and matches on it", () => {
    const once = speedoPostServiceName("CLASSIC_STRIPES_B2B", "B2B");
    const twice = speedoPostServiceName("CLASSIC_STRIPES_B2B", "B2B");
    assert.equal(once, twice);
  });

  it("never appends Freight twice", () => {
    assert.equal(
      speedoPostServiceName("SOMETHING FREIGHT B2B", "B2B"),
      "Something Freight",
    );
  });

  it("reads the segment off a raw name for the tracking path", () => {
    // Tracking gets a provider name with no segment field beside it.
    assert.equal(inferSpeedoPostSegment("GATI B2B"), "B2B");
    assert.equal(inferSpeedoPostSegment("DELHIVERYB2C_VK"), "B2C");
    assert.equal(inferSpeedoPostSegment("NEXDROP"), "B2C");
    assert.equal(inferSpeedoPostSegment(null), "B2C");
  });
});

// ---------------------------------------------------------------------------
// 2. Rates
// ---------------------------------------------------------------------------

function rateRequest(
  overrides: Partial<CanonicalRateRequest["shipment"]> = {},
): CanonicalRateRequest {
  return {
    origin: { city: "Delhi", pincode: "110037", countryCode: "IN" },
    destination: { city: "Mumbai", pincode: "400001", countryCode: "IN" },
    shipment: {
      weight: 10,
      quantity: 1,
      dimensions: { length: 30, width: 20, height: 10, unit: "cm" },
      ...overrides,
    },
  };
}

describe("buildSpeedoPostRatePayloads", () => {
  it("prices both networks from one search", () => {
    const calls = buildSpeedoPostRatePayloads(rateRequest());
    assert.deepEqual(
      calls.map((c) => c.orderType),
      ["B2C", "B2B"],
    );
    // Same consignment, both times. Only the segment differs.
    assert.deepEqual(calls[0].payload.dimensions, calls[1].payload.dimensions);
    assert.equal(calls[0].payload.weight, calls[1].payload.weight);
  });

  it("sends weight in kilograms, not grams", () => {
    // Shipmozo wants grams and SpeedoPost wants kilograms. Copying the wrong
    // adapter here quotes a 10 kg parcel as 10,000 kg or as 10 g.
    const [{ payload }] = buildSpeedoPostRatePayloads(rateRequest());
    assert.equal(payload.weight, 10);
  });

  it("rounds box dimensions UP", () => {
    // A box declared smaller than it is gets re-measured at the hub and the
    // customer is surcharged weeks after they were quoted.
    const [{ payload }] = buildSpeedoPostRatePayloads(
      rateRequest({
        packages: [
          { quantity: 2, weightKg: 5, lengthCm: 30.2, widthCm: 20.7, heightCm: 10.1 },
        ],
      }),
    );
    assert.deepEqual(payload.dimensions, [
      { length: 31, width: 21, height: 11, count: 2 },
    ]);
    // Total ACTUAL weight: 5 kg per box across 2 boxes.
    assert.equal(payload.weight, 10);
  });

  it("prices cash on delivery as cash on delivery", () => {
    const [{ payload }] = buildSpeedoPostRatePayloads(
      rateRequest({ paymentType: "COD", codAmount: 4500 }),
    );
    assert.equal(payload.paymentMode, "COD");
    assert.equal(payload.codAmount, 4500);
  });

  it("falls back to the declared value when COD carries no amount", () => {
    const [{ payload }] = buildSpeedoPostRatePayloads(
      rateRequest({ paymentType: "COD", declaredValue: 7000 }),
    );
    assert.equal(payload.codAmount, 7000);
  });

  it("defaults to prepaid with no COD amount", () => {
    const [{ payload }] = buildSpeedoPostRatePayloads(rateRequest());
    assert.equal(payload.paymentMode, "PP");
    assert.equal(payload.codAmount, 0);
  });

  it("refuses a route it cannot price rather than spending a round trip", () => {
    const request = rateRequest();
    request.destination.pincode = "";
    assert.throws(() => buildSpeedoPostRatePayloads(request), /pincode/i);
  });
});

describe("mapSpeedoPostOption — the tax split", () => {
  it("uses the GST they sent", () => {
    const quote = mapSpeedoPostOption(
      {
        serviceProviderCode: 37360,
        serviceProviderName: "DELHIVERYB2B_VK",
        freightCharge: 280,
        fscCharge: 14.2,
        subTotalCharge: 294.2,
        gstPercent: 18,
        gstAmount: 52.96,
        totalCharge: 347.16,
      },
      "B2B",
      VENDOR,
    );

    assert.equal(quote.totalWithTax, 347.16);
    assert.equal(quote.totalWithoutTax, 294.2);
    const gstLine = quote.charges.find((c) => c.name === "GST");
    assert.equal(gstLine?.amount, 52.96);
    assert.equal(gstLine?.taxAmount, 52.96);
  });

  it("derives GST from the percentage when only that is sent", () => {
    const quote = mapSpeedoPostOption(
      {
        serviceProviderCode: "1",
        serviceProviderName: "GATI B2B",
        subTotalCharge: 100,
        gstPercent: 18,
        totalCharge: 118,
      },
      "B2B",
      VENDOR,
    );
    assert.equal(quote.totalWithoutTax, 100);
    assert.equal(quote.charges.find((c) => c.name === "GST")?.amount, 18);
  });

  it("reports NO tax rather than assuming 18% on the minimal response", () => {
    // Their base documented shape: a total and nothing else. Inventing a split
    // here prints a tax figure the carrier never sent onto a tax invoice.
    const quote = mapSpeedoPostOption(
      {
        totalCharge: 347.215,
        serviceProviderCode: 37360,
        serviceProviderName: "DELHIVERYB2B_VK",
      },
      "B2B",
      VENDOR,
    );

    assert.equal(quote.totalWithTax, 347.22);
    assert.equal(quote.totalWithoutTax, 347.22);
    assert.equal(
      quote.charges.find((c) => c.name === "GST"),
      undefined,
    );
    // Still itemised as something, so the card is not blank.
    assert.deepEqual(
      quote.charges.map((c) => c.name),
      ["Freight"],
    );
  });
});

describe("mapSpeedoPostOption — the breakdown", () => {
  it("adds up to what the customer is charged", () => {
    // A surcharge we have not named must not silently go missing from the sum.
    const quote = mapSpeedoPostOption(
      {
        serviceProviderCode: "9",
        serviceProviderName: "NEXDROP",
        freightCharge: 100,
        fscCharge: 20,
        // 30 rupees of charges in fields this adapter does not itemise.
        subTotalCharge: 150,
        gstAmount: 27,
        totalCharge: 177,
      },
      "B2C",
      VENDOR,
    );

    const preTax = quote.charges
      .filter((c) => c.name !== "GST")
      .reduce((sum, c) => sum + c.amount, 0);

    assert.equal(preTax, quote.totalWithoutTax);
    assert.equal(quote.charges.find((c) => c.name === "Other charges")?.amount, 30);
  });

  it("omits charge lines the vendor sent as zero", () => {
    const quote = mapSpeedoPostOption(
      {
        serviceProviderCode: "9",
        serviceProviderName: "NEXDROP",
        freightCharge: 100,
        odaCharge: 0,
        codCharge: 0,
        subTotalCharge: 100,
        gstAmount: 18,
        totalCharge: 118,
      },
      "B2C",
      VENDOR,
    );

    assert.deepEqual(
      quote.charges.map((c) => c.name),
      ["Freight", "GST"],
    );
  });

  it("carries the provider code through for a later booking", () => {
    // This is the id a CreateOrder call will need to book the exact service the
    // customer paid for. Losing it means substituting a courier or nothing.
    const quote = mapSpeedoPostOption(
      { serviceProviderCode: 3376851, serviceProviderName: "DELHIVERYB2C_VK", totalCharge: 200 },
      "B2C",
      VENDOR,
    );
    assert.equal(quote.courierId, "3376851");
  });

  it("reports an unknown transit time as unknown", () => {
    // SpeedoPost publishes none. 0 is the canonical "unknown"; anything else
    // would print our guess as the carrier's commitment.
    const quote = mapSpeedoPostOption(
      { serviceProviderCode: "1", serviceProviderName: "GATI B2B", totalCharge: 200 },
      "B2B",
      VENDOR,
    );
    assert.equal(quote.tatDays, 0);
  });
});

describe("dedupeSpeedoPostQuotes", () => {
  it("collapses the four identical Blue Dart entries live returns", () => {
    // Real response, one lane: four provider codes, two repeated names, all at
    // the same price. The hub suffixes are stripped, so all four display as one
    // service and the customer cannot tell them apart.
    const live: SpeedoPostRateOption[] = [
      { serviceProviderCode: 69477, serviceProviderName: "Bluedart_PNK", totalCharge: 567.73 },
      { serviceProviderCode: 69478, serviceProviderName: "Bluedart_DEL", totalCharge: 567.73 },
      { serviceProviderCode: 69479, serviceProviderName: "Bluedart_PNK", totalCharge: 567.73 },
      { serviceProviderCode: 69480, serviceProviderName: "Bluedart_DEL", totalCharge: 567.73 },
    ];

    const quotes = dedupeSpeedoPostQuotes(mapSpeedoPostSegment(live, "B2B", VENDOR));
    assert.equal(quotes.length, 1);
    assert.equal(quotes[0].productName, "Blue Dart Freight");
  });

  it("never emits two quotes that share a picker key", () => {
    // quoteKey is `vendorId-productName-totalWithTax`. Two quotes sharing one
    // break React list identity and make selecting one select the other.
    const live: SpeedoPostRateOption[] = [
      { serviceProviderCode: 69477, serviceProviderName: "Bluedart_PNK", totalCharge: 567.73 },
      { serviceProviderCode: 69479, serviceProviderName: "Bluedart_PNK", totalCharge: 567.73 },
      { serviceProviderCode: 3765884, serviceProviderName: "DELHIVERY_B2B_10CFT", totalCharge: 357.37 },
      { serviceProviderCode: 32220237, serviceProviderName: "DELHIVERY B2BC 10CFT", totalCharge: 357.37 },
    ];

    const quotes = dedupeSpeedoPostQuotes(mapSpeedoPostSegment(live, "B2B", VENDOR));
    const keys = quotes.map((q) => `${q.vendorId}-${q.productName}-${q.totalWithTax}`);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("keeps the cheapest when the same name is priced twice", () => {
    const quotes = dedupeSpeedoPostQuotes(
      mapSpeedoPostSegment(
        [
          { serviceProviderCode: 1, serviceProviderName: "GATI B2B", totalCharge: 400 },
          { serviceProviderCode: 2, serviceProviderName: "GATI", totalCharge: 350 },
        ],
        "B2B",
        VENDOR,
      ),
    );
    assert.equal(quotes.length, 1);
    assert.equal(quotes[0].totalWithTax, 350);
  });

  it("breaks a price tie on the provider code, not on arrival order", () => {
    // domesticCourierResolve re-quotes and matches on the product name. If a
    // reshuffled response handed back a different provider code for the same
    // displayed service, that lookup would silently book a different courier.
    const options: SpeedoPostRateOption[] = [
      { serviceProviderCode: "69480", serviceProviderName: "Bluedart_DEL", totalCharge: 567.73 },
      { serviceProviderCode: "69477", serviceProviderName: "Bluedart_PNK", totalCharge: 567.73 },
    ];

    const forward = dedupeSpeedoPostQuotes(mapSpeedoPostSegment(options, "B2B", VENDOR));
    const reversed = dedupeSpeedoPostQuotes(
      mapSpeedoPostSegment([...options].reverse(), "B2B", VENDOR),
    );

    assert.equal(forward[0].courierId, "69477");
    assert.equal(reversed[0].courierId, forward[0].courierId);
  });

  it("compares provider codes as numbers, not as strings", () => {
    // Live returns these two under one displayed name at one price. Compared as
    // strings, "32220237" sorts below "3765884" because the comparison stops at
    // the second character, which makes the winner impossible to predict from
    // reading the response.
    const quotes = dedupeSpeedoPostQuotes(
      mapSpeedoPostSegment(
        [
          { serviceProviderCode: "32220237", serviceProviderName: "DELHIVERY B2BC 10CFT", totalCharge: 357.37 },
          { serviceProviderCode: "3765884", serviceProviderName: "DELHIVERY_B2B_10CFT", totalCharge: 357.37 },
        ],
        "B2B",
        VENDOR,
      ),
    );
    assert.equal(quotes.length, 1);
    assert.equal(quotes[0].courierId, "3765884");
  });
});

describe("mapSpeedoPostSegment", () => {
  it("drops a provider that failed to price the lane", () => {
    // A zero-rupee quote is not a free shipment.
    const quotes = mapSpeedoPostSegment(
      [
        { serviceProviderCode: 1, serviceProviderName: "GATI B2B", totalCharge: 0 },
        { serviceProviderCode: 2, serviceProviderName: "NEXDROP", totalCharge: 250 },
      ],
      "B2B",
      VENDOR,
    );
    assert.equal(quotes.length, 1);
    assert.equal(quotes[0].courierId, "2");
  });

  it("survives an empty segment without inventing anything", () => {
    assert.deepEqual(mapSpeedoPostSegment([], "B2C", VENDOR), []);
  });
});

// ---------------------------------------------------------------------------
// 3. Tracking
// ---------------------------------------------------------------------------

describe("mapSpeedoPostEventType", () => {
  it("maps the four status codes their documentation evidences", () => {
    assert.equal(mapSpeedoPostEventType("Order Booked", "10001"), "booked");
    assert.equal(mapSpeedoPostEventType("Order In-transit", "10003"), "in_transit");
    assert.equal(
      mapSpeedoPostEventType("Out for delivery", "10006"),
      "out_for_delivery",
    );
    assert.equal(mapSpeedoPostEventType("Delivered", "10007"), "delivered");
  });

  it("does NOT read 'Undelivered' as a delivery", () => {
    // The whole reason this file exists.
    assert.equal(mapSpeedoPostEventType("Undelivered"), "attempted");
    assert.equal(mapSpeedoPostEventType("Un-delivered"), "attempted");
    assert.equal(mapSpeedoPostEventType("Not Delivered"), "attempted");
    assert.equal(mapSpeedoPostEventType("Delivery failed"), "attempted");
  });

  it("does NOT read an RTO delivery as a delivery", () => {
    assert.equal(mapSpeedoPostEventType("RTO Delivered"), "returned");
    assert.equal(mapSpeedoPostEventType("Returned to origin"), "returned");
    assert.equal(mapSpeedoPostEventType("RTO Initiated"), "returned");
  });

  it("lets the words beat a contradicting status code", () => {
    // A feed reporting the delivered code beside "Undelivered" is describing a
    // failure, and the words are the specific claim.
    assert.equal(mapSpeedoPostEventType("Undelivered", "10007"), "attempted");
    assert.equal(mapSpeedoPostEventType("RTO Delivered", "10007"), "returned");
  });

  it("treats a return-direction scan as a return whatever it says", () => {
    assert.equal(mapSpeedoPostEventType("Delivered", "10007", "RTO"), "returned");
    assert.equal(mapSpeedoPostEventType("Out for delivery", "10006", "RVP"), "returned");
    // The forward leg is unaffected.
    assert.equal(mapSpeedoPostEventType("Delivered", "10007", "FWD"), "delivered");
  });

  it("reads statuses beyond the four published codes", () => {
    // Their enum is not published. The words have to carry everything else.
    assert.equal(mapSpeedoPostEventType("Shipment Picked Up", "88888"), "picked_up");
    assert.equal(mapSpeedoPostEventType("Bag Added To Trip", "77777"), "in_transit");
    assert.equal(mapSpeedoPostEventType("Pickup Pending", "66666"), "booked");
    assert.equal(mapSpeedoPostEventType("Shipment Cancelled", "55555"), "exception");
    assert.equal(mapSpeedoPostEventType("Customs Hold", "44444"), "exception");
  });

  it("says unknown rather than guessing", () => {
    assert.equal(mapSpeedoPostEventType("", ""), "unknown");
    assert.equal(mapSpeedoPostEventType("Zzz", "99999"), "unknown");
  });
});

describe("toIsoFromIst", () => {
  it("reads their zone-less timestamps as IST", () => {
    // Getting this wrong shifts every scan by five and a half hours, which
    // reorders a same-day timeline.
    assert.equal(toIsoFromIst("2023-06-21 14:24:02"), "2023-06-21T08:54:02.000Z");
    assert.equal(toIsoFromIst("2023-06-17 15:16:51"), "2023-06-17T09:46:51.000Z");
  });

  it("trusts a timestamp that carries its own zone", () => {
    assert.equal(toIsoFromIst("2023-06-21T14:24:02Z"), "2023-06-21T14:24:02.000Z");
  });

  it("keeps a scan with a broken timestamp instead of dropping it", () => {
    // A scan with an unreadable date is still information about the parcel.
    assert.ok(!Number.isNaN(Date.parse(toIsoFromIst("not a date"))));
    assert.ok(!Number.isNaN(Date.parse(toIsoFromIst(undefined))));
  });
});

describe("scan text", () => {
  it("prefers the fuller remark over the label", () => {
    assert.equal(
      readScanDescription({ status: "Order In-transit", remarks: "Bag Added To Trip" }),
      "Bag Added To Trip",
    );
  });

  it("does not print the same words twice", () => {
    assert.equal(
      readScanDescription({ status: "Delivered", remarks: "delivered" }),
      "",
    );
    assert.equal(readScanDescription({ status: "Delivered", remarks: null }), "");
  });

  it("flattens their placeholder locations away", () => {
    assert.equal(readScanLocation({ location: "EAST ANDHERI" }), "EAST ANDHERI");
    assert.equal(readScanLocation({ location: null }), "");
    assert.equal(readScanLocation({ location: "NA" }), "");
    assert.equal(readScanLocation({ location: "  " }), "");
  });
});
