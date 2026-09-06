/**
 * utils/domesticRateRules.test.ts
 *
 * The domestic rate path now makes two decisions of its own on top of what
 * Shipmozo returns, and both are the kind that fail quietly in production:
 *
 *   • WHAT WE DECLARE. `type_of_package` filters which couriers are offered as
 *     much as it prices, so an over- or under-declaration either hides half the
 *     market or promises a courier that will refuse the consignment at the hub.
 *   • WHAT WE WITHDRAW. A courier hidden here but shown in the calculator (or
 *     the other way round) means a rate that vanishes between choosing and
 *     paying, and lib/booking/domesticCourierResolve.ts re-quotes the same lane
 *     at booking time and has to find the exact service that was bought.
 *
 * These are exercised through the adapter's public fetchRates with fetch stubbed,
 * because the interesting behaviour is in how the three steps combine, not in
 * any one of them.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { ShipmozoDomesticAdapter } from "@/lib/rate-adapters/vendors/shipmozo-domestic/shipmozo-domestic.adapter";
import type { CanonicalRateRequest } from "@/lib/rate-adapters/core/types";
import {
  SHADOWFAX_MAX_DECLARED_VALUE,
  applyDomesticCarrierRules,
} from "@/lib/rates/domesticCarrierRules";

// --- fetch stub ---------------------------------------------------------------

interface Call {
  typeOfPackage: string;
  weight: string;
  orderAmount: string;
  boxes: number;
}

const realFetch = globalThis.fetch;

/**
 * Stub `fetch` and record what each call declared. `bodies` is consumed one
 * response per call, so a test can hand back an empty MPS answer followed by a
 * populated SPS one and assert on the retry.
 */
function stubFetch(bodies: unknown[]): { calls: Call[] } {
  const calls: Call[] = [];
  let index = 0;

  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const payload = JSON.parse(String(init.body));
    calls.push({
      typeOfPackage: payload.type_of_package,
      weight: payload.weight,
      orderAmount: payload.order_amount,
      boxes: payload.dimensions.length,
    });

    const body = bodies[Math.min(index, bodies.length - 1)];
    index += 1;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify(body),
    };
  }) as unknown as typeof fetch;

  return { calls };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

// --- fixtures -----------------------------------------------------------------

function product(name: string, total = 500) {
  return {
    id: name.length,
    name,
    estimated_delivery: "3 Days",
    shipping_charges: total * 0.85,
    gst: total * 0.15,
    total_charges: total,
  };
}

function ok(names: string[]) {
  return { result: 1, message: "Success", data: names.map((n) => product(n)) };
}

const EMPTY = { result: 1, message: "Success", data: [] };

function request(
  packages: { quantity: number; weightKg: number; cm: number }[],
  extra: Partial<CanonicalRateRequest["shipment"]> = {},
): CanonicalRateRequest {
  const first = packages[0];
  return {
    origin: { city: "Delhi", pincode: "110059", countryCode: "IN" },
    destination: { city: "Mumbai", pincode: "400001", countryCode: "IN" },
    shipment: {
      packages: packages.map((p) => ({
        quantity: p.quantity,
        weightKg: p.weightKg,
        lengthCm: p.cm,
        widthCm: p.cm,
        heightCm: p.cm,
      })),
      weight: packages.reduce((s, p) => s + p.weightKg * p.quantity, 0),
      quantity: packages.reduce((s, p) => s + p.quantity, 0),
      dimensions: {
        length: first.cm,
        width: first.cm,
        height: first.cm,
        unit: "cm",
      },
      ...extra,
    },
  };
}

/** One 2 kg box in a 10 cm cube: single piece, well under the threshold. */
const SMALL = [{ quantity: 1, weightKg: 2, cm: 10 }];

// --- tests --------------------------------------------------------------------

describe("Shipmozo domestic package type", () => {
  it("declares SPS for one light box", async () => {
    const { calls } = stubFetch([ok(["Delhivery Surface 5 Kg"])]);
    await new ShipmozoDomesticAdapter().fetchRates(request(SMALL));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].typeOfPackage, "SPS");
  });

  it("declares MPS the moment there is a second piece", async () => {
    const { calls } = stubFetch([ok(["Delhivery Surface 5 Kg"])]);
    await new ShipmozoDomesticAdapter().fetchRates(
      request([{ quantity: 2, weightKg: 1, cm: 10 }]),
    );

    assert.equal(calls[0].typeOfPackage, "MPS");
  });

  it("declares MPS for one heavy box", async () => {
    const { calls } = stubFetch([ok(["Delhivery Surface 20 Kg"])]);
    await new ShipmozoDomesticAdapter().fetchRates(
      request([{ quantity: 1, weightKg: 18, cm: 30 }]),
    );

    assert.equal(calls[0].typeOfPackage, "MPS");
  });

  it("puts the threshold on chargeable weight, not the weight on the scale", async () => {
    // 4 kg on the scale, but 40×40×40 cm is 12.8 kg volumetric. The courier
    // bills the larger figure, and it is the figure the UI shows as "You pay
    // for", so it is the one the declaration follows.
    const { calls } = stubFetch([ok(["Delhivery Surface 20 Kg"])]);
    await new ShipmozoDomesticAdapter().fetchRates(
      request([{ quantity: 1, weightKg: 4, cm: 40 }]),
    );

    assert.equal(calls[0].typeOfPackage, "MPS");
  });

  it("leaves exactly ten kilos on SPS", async () => {
    // 10 kg in a small box: chargeable is 10.00 and the rule is strictly above.
    const { calls } = stubFetch([ok(["Delhivery Surface 10 Kg"])]);
    await new ShipmozoDomesticAdapter().fetchRates(
      request([{ quantity: 1, weightKg: 10, cm: 20 }]),
    );

    assert.equal(calls[0].typeOfPackage, "SPS");
  });

  it("honours an explicit override instead of deriving one", async () => {
    const { calls } = stubFetch([ok(["Delhivery Surface 20 Kg"])]);
    await new ShipmozoDomesticAdapter().fetchRates(
      request([{ quantity: 4, weightKg: 9, cm: 40 }], { packageType: "SPS" }),
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].typeOfPackage, "SPS");
  });
});

describe("Shipmozo domestic MPS fallback", () => {
  it("retries as SPS when MPS prices nothing at all", async () => {
    const { calls } = stubFetch([EMPTY, ok(["Delhivery Surface 5 Kg", "Shadowfax 5 Kg"])]);
    const result = await new ShipmozoDomesticAdapter().fetchRates(
      request([{ quantity: 3, weightKg: 2, cm: 10 }]),
    );

    assert.deepEqual(
      calls.map((c) => c.typeOfPackage),
      ["MPS", "SPS"],
    );
    assert.equal(result.quotes.length, 2);
  });

  it("does NOT retry when MPS returns a short list", async () => {
    // Three couriers is a real answer: those three accepted the consignment as
    // declared. Widening to SPS would undo the declaration.
    const { calls } = stubFetch([ok(["Delhivery Surface 5 Kg"])]);
    await new ShipmozoDomesticAdapter().fetchRates(
      request([{ quantity: 3, weightKg: 2, cm: 10 }]),
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].typeOfPackage, "MPS");
  });

  it("never retries an SPS request", async () => {
    const { calls } = stubFetch([EMPTY]);
    const result = await new ShipmozoDomesticAdapter().fetchRates(request(SMALL));

    assert.equal(calls.length, 1);
    assert.equal(result.quotes.length, 0);
  });

  it("keeps the original empty answer rather than reporting an error when the retry fails", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body));
      calls.push(payload.type_of_package);
      if (payload.type_of_package === "SPS") throw new Error("network down");
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify(EMPTY),
      };
    }) as unknown as typeof fetch;

    const result = await new ShipmozoDomesticAdapter().fetchRates(
      request([{ quantity: 3, weightKg: 2, cm: 10 }]),
    );

    assert.deepEqual(calls, ["MPS", "SPS"]);
    // No quotes, but no vendor error banner either: the first call succeeded.
    assert.equal(result.quotes.length, 0);
    assert.equal(result.error, undefined);
  });

  it("keeps the MPS answer when the SPS retry is empty too", async () => {
    const { calls } = stubFetch([EMPTY, EMPTY]);
    const result = await new ShipmozoDomesticAdapter().fetchRates(
      request([{ quantity: 3, weightKg: 2, cm: 10 }]),
    );

    assert.equal(calls.length, 2);
    assert.equal(result.quotes.length, 0);
  });

  it("still sends every box in `dimensions`, whichever type it declared", async () => {
    // Multi-piece PRICING comes from this array, not from the flag, so it must
    // not change with the declaration or the fallback.
    const { calls } = stubFetch([EMPTY, ok(["Delhivery Surface 5 Kg"])]);
    await new ShipmozoDomesticAdapter().fetchRates(
      request([
        { quantity: 2, weightKg: 1, cm: 10 },
        { quantity: 1, weightKg: 3, cm: 20 },
      ]),
    );

    assert.deepEqual(
      calls.map((c) => c.boxes),
      [2, 2],
    );
    assert.deepEqual(
      calls.map((c) => c.weight),
      ["5000", "5000"],
    );
  });
});

describe("Shadowfax value cap", () => {
  it("hides Shadowfax once the invoice value is above the cap", async () => {
    stubFetch([ok(["Delhivery Surface 5 Kg", "Shadowfax 5 Kg", "Amazon Shipping 1 Kg"])]);
    const result = await new ShipmozoDomesticAdapter().fetchRates(
      request(SMALL, { declaredValue: SHADOWFAX_MAX_DECLARED_VALUE + 1 }),
    );

    assert.deepEqual(
      result.quotes.map((q) => q.productName),
      ["Delhivery Surface 5 Kg", "Amazon Shipping 1 Kg"],
    );
  });

  it("keeps Shadowfax at exactly the cap", async () => {
    stubFetch([ok(["Shadowfax 5 Kg"])]);
    const result = await new ShipmozoDomesticAdapter().fetchRates(
      request(SMALL, { declaredValue: SHADOWFAX_MAX_DECLARED_VALUE }),
    );

    assert.equal(result.quotes.length, 1);
  });

  it("keeps Shadowfax when no invoice value was given at all", async () => {
    // The adapter substitutes a neutral dummy order amount when pricing without
    // a value. Reading that dummy as a real invoice would hide the courier from
    // every caller that simply did not collect a figure.
    const { calls } = stubFetch([ok(["Shadowfax 5 Kg"])]);
    const result = await new ShipmozoDomesticAdapter().fetchRates(request(SMALL));

    assert.ok(Number(calls[0].orderAmount) > SHADOWFAX_MAX_DECLARED_VALUE);
    assert.equal(result.quotes.length, 1);
  });

  it("does not hide a courier that merely contains the letters", () => {
    const quotes = [
      { productName: "Shadowfax Surface 1 Kg" },
      { productName: "Shadow Logistics 1 Kg" },
      { productName: "Faxton Express 1 Kg" },
    ] as never;

    const kept = applyDomesticCarrierRules(quotes, {
      origin: { city: "Delhi", countryCode: "IN" },
      destination: { city: "Mumbai", countryCode: "IN" },
      shipment: {
        weight: 1,
        quantity: 1,
        dimensions: { length: 10, width: 10, height: 10, unit: "cm" },
        declaredValue: 25000,
      },
    });

    assert.deepEqual(
      kept.map((q) => q.productName),
      ["Shadow Logistics 1 Kg", "Faxton Express 1 Kg"],
    );
  });
});
