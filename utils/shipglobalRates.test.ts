/**
 * utils/shipglobalRates.test.ts
 *
 * The ShipGlobal rate mapping — vendor response to canonical RateQuote.
 *
 * These tests pin the three things that would be silently wrong rather than
 * loudly broken, which is the dangerous kind of wrong on a pricing path:
 *
 *   1. GST. ShipGlobal quotes `subtotal_fee` PRE-tax and never sends a tax
 *      field, so the 18% is ours to derive. Get it wrong and every ShipGlobal
 *      quote undercuts the other three vendors by 18% and always wins the
 *      cheapest-first sort.
 *   2. The breakdown adds up. `price` is an open bag of fee keys we do not
 *      control, and the quote PDF and tax invoice both print those lines next
 *      to the total.
 *   3. The response is parsed, not asserted. A string where a number used to be
 *      must produce a vendor error, never a NaN quote.
 *
 * Fixtures are the exact sample response from vendor-api-docs/shipglobal.md.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapShipGlobalServiceToQuote,
  parseTransitDays,
} from "@/lib/rate-adapters/vendors/shipglobal/shipglobal.adapter";
import {
  shipGlobalRateResponseSchema,
  type ShipGlobalService,
} from "@/lib/rate-adapters/vendors/shipglobal/shipglobal.types";

const OPTIONS = {
  currency: "INR",
  gstPercent: 18,
  vendorId: "shipglobal",
  vendorName: "ShipGlobal",
};

/** Verbatim from vendor-api-docs/shipglobal.md. */
const SAMPLE_RESPONSE = {
  success: true,
  billed_weight: 20,
  billed_weight_unit: "GM",
  currency: "INR",
  services: [
    {
      title: "ShipGlobal Direct",
      notes: "",
      transit_time: "7-10 Days",
      price: { logistic_fee: 285 },
      subtotal_fee: 300,
    },
    {
      title: "UPS Promotional",
      notes: "Duties will be charged, if applicable.",
      transit_time: "4 - 7 Days",
      price: { logistic_fee: 2009 },
      subtotal_fee: 2009,
    },
  ],
};

function parseSample() {
  const parsed = shipGlobalRateResponseSchema.safeParse(SAMPLE_RESPONSE);
  assert.equal(parsed.success, true);
  return parsed.data!;
}

describe("ShipGlobal response parsing", () => {
  it("accepts the documented sample response", () => {
    const data = parseSample();
    assert.equal(data.services?.length, 2);
    assert.equal(data.services?.[0].subtotal_fee, 300);
  });

  it("coerces money sent as strings", () => {
    const parsed = shipGlobalRateResponseSchema.safeParse({
      success: true,
      currency: "INR",
      services: [{ title: "ShipGlobal Direct", subtotal_fee: "1,250.50" }],
    });

    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.services?.[0].subtotal_fee, 1250.5);
  });

  it("rejects a service whose price is not a number at all", () => {
    // The whole point: this must fail loudly here rather than reach a customer
    // as a NaN total.
    const parsed = shipGlobalRateResponseSchema.safeParse({
      success: true,
      services: [{ title: "ShipGlobal Direct", subtotal_fee: "call us" }],
    });

    assert.equal(parsed.success, false);
  });

  it("rejects a service with no title", () => {
    const parsed = shipGlobalRateResponseSchema.safeParse({
      success: true,
      services: [{ subtotal_fee: 300 }],
    });

    assert.equal(parsed.success, false);
  });

  it("survives unknown extra fields and extra price keys", () => {
    const parsed = shipGlobalRateResponseSchema.safeParse({
      success: true,
      some_new_field: { nested: true },
      services: [
        {
          title: "ShipGlobal Premium",
          subtotal_fee: 733,
          price: { logistic_fee: 700, fuel_surcharge: 33, note: "n/a" },
        },
      ],
    });

    assert.equal(parsed.success, true);
  });
});

describe("ShipGlobal quote mapping", () => {
  it("adds 18% GST on top of subtotal_fee", () => {
    const data = parseSample();
    const quote = mapShipGlobalServiceToQuote(data.services![0], OPTIONS);

    assert.ok(quote);
    assert.equal(quote.totalWithoutTax, 300);
    assert.equal(quote.totalWithTax, 354);
    assert.equal(quote.currency, "INR");
    assert.equal(quote.productName, "ShipGlobal Direct");
    assert.equal(quote.tatDays, 7);
  });

  it("itemises price entries and closes the gap to subtotal_fee", () => {
    const data = parseSample();
    const quote = mapShipGlobalServiceToQuote(data.services![0], OPTIONS)!;

    assert.deepEqual(
      quote.charges.map((c) => [c.name, c.amount]),
      [
        ["LOGISTIC FEE", 285],
        ["OTHER CHARGES", 15],
        ["GST", 54],
      ],
    );
  });

  it("emits no residual line when the fee bag already equals the subtotal", () => {
    const data = parseSample();
    const quote = mapShipGlobalServiceToQuote(data.services![1], OPTIONS)!;

    assert.deepEqual(
      quote.charges.map((c) => c.name),
      ["LOGISTIC FEE", "GST"],
    );
    assert.equal(quote.totalWithoutTax, 2009);
    assert.equal(quote.totalWithTax, 2370.62);
  });

  it("keeps the pre-tax lines summing to totalWithoutTax", () => {
    const data = parseSample();

    for (const service of data.services!) {
      const quote = mapShipGlobalServiceToQuote(service, OPTIONS)!;
      const preTax = quote.charges
        .filter((c) => c.name !== "GST")
        .reduce((sum, c) => sum + c.amount, 0);

      assert.equal(Math.round(preTax * 100) / 100, quote.totalWithoutTax);
    }
  });

  it("falls back to a single FREIGHT line when price is missing", () => {
    const service: ShipGlobalService = {
      title: "ShipGlobal Premium",
      subtotal_fee: 733,
      price: null,
      notes: null,
      transit_time: null,
    };

    const quote = mapShipGlobalServiceToQuote(service, OPTIONS)!;

    assert.deepEqual(
      quote.charges.map((c) => [c.name, c.amount]),
      [
        ["FREIGHT", 733],
        ["GST", 131.94],
      ],
    );
  });

  it("falls back to FREIGHT when the fee bag overshoots the subtotal", () => {
    // A breakdown that exceeds its own total would print as a pricing error, so
    // itemisation is abandoned rather than shown wrong.
    const service: ShipGlobalService = {
      title: "ShipGlobal Direct",
      subtotal_fee: 300,
      price: { logistic_fee: 285, mystery_fee: 90 },
      notes: null,
      transit_time: null,
    };

    const quote = mapShipGlobalServiceToQuote(service, OPTIONS)!;

    assert.deepEqual(
      quote.charges.map((c) => [c.name, c.amount]),
      [
        ["FREIGHT", 300],
        ["GST", 54],
      ],
    );
  });

  it("drops a service that cannot be priced", () => {
    const service: ShipGlobalService = {
      title: "ShipGlobal Direct",
      subtotal_fee: 0,
      price: null,
      notes: null,
      transit_time: null,
    };

    assert.equal(mapShipGlobalServiceToQuote(service, OPTIONS), null);
  });
});

describe("ShipGlobal transit time parsing", () => {
  const cases: [string | null | undefined, number][] = [
    ["7-10 Days", 7],
    ["4 - 7 Days", 4],
    ["6-9 Days", 6],
    ["2 Days", 2],
    ["", 0],
    [null, 0],
    [undefined, 0],
    ["Ask us", 0],
  ];

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} reads as ${expected} days`, () => {
      assert.equal(parseTransitDays(input), expected);
    });
  }
});
