/**
 * Tests for the invoice money engine.
 *
 * Run with: npm test
 *
 * The engine's contract is arithmetic that has to hold exactly, not
 * approximately, so most of this file is property testing over randomly
 * generated shipments rather than a handful of worked examples. A tax invoice
 * whose line items do not add up to its total is a document that gets sent
 * back, and the failure mode is silent: it looks fine until an accountant adds
 * up the column.
 *
 * The four invariants under test are documented at the top of
 * lib/invoices/tax/money.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ShipmentMode } from "../generated/prisma";
import {
  amountInWords,
  buildInvoiceMoney,
  isVendorTaxLine,
  splitProportionally,
  toPaise,
  verifyInvoiceMoney,
  type InvoiceMoneyInput,
  type RawCharge,
} from "../lib/invoices/tax/money";

const identity = (name: string) => name;

const SELLER_STATE = "07"; // Delhi

function build(input: Partial<InvoiceMoneyInput> & { totalCharged: number }) {
  return buildInvoiceMoney(
    {
      charges: [],
      mode: ShipmentMode.INTERNATIONAL,
      sellerStateCode: SELLER_STATE,
      placeOfSupplyCode: "29", // Karnataka, so inter-state unless overridden
      ...input,
    },
    identity,
  );
}

/** Sum in paise, so the assertions never compare floats. */
function paiseSum(values: number[]): number {
  return values.reduce((a, v) => a + toPaise(v), 0);
}

// ---------------------------------------------------------------------------
// Deterministic pseudo-random generator
// ---------------------------------------------------------------------------
// Seeded so a failure is reproducible from the printed seed rather than
// vanishing on the next run.

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// ---------------------------------------------------------------------------

describe("toPaise", () => {
  it("does not lose a paisa to floating point", () => {
    // 186.44 * 100 is 18643.999999999996 in IEEE 754.
    assert.equal(toPaise(186.44), 18644);
    assert.equal(toPaise(0.07), 7);
    assert.equal(toPaise(23200), 2320000);
    // The classic: 0.1 + 0.2 is 0.30000000000000004.
    assert.equal(toPaise(0.1 + 0.2), 30);
    // 1.15 * 100 is 114.99999999999999, which truncates to a paisa short.
    assert.equal(toPaise(1.15), 115);
  });

  it("treats non-finite input as zero rather than propagating NaN", () => {
    assert.equal(toPaise(NaN), 0);
    assert.equal(toPaise(Infinity), 0);
  });
});

describe("splitProportionally", () => {
  it("always sums to the target exactly", () => {
    const random = makeRandom(12345);

    for (let run = 0; run < 2000; run++) {
      const n = 1 + Math.floor(random() * 6);
      const weights = Array.from({ length: n }, () =>
        Math.floor(random() * 500000),
      );
      const target = Math.floor(random() * 5000000);

      const shares = splitProportionally(weights, target);

      assert.equal(
        shares.reduce((a, b) => a + b, 0),
        target,
        `run ${run}: weights ${weights} target ${target}`,
      );
    }
  });

  it("handles a zero total weight without producing NaN", () => {
    const shares = splitProportionally([0, 0, 0], 1000);

    assert.deepEqual(shares, [1000, 0, 0]);
  });

  it("returns an empty result for no weights", () => {
    assert.deepEqual(splitProportionally([], 500), []);
  });
});

describe("vendor tax lines", () => {
  it("recognises the labels the adapters actually emit", () => {
    // shipmozo.adapter.ts and shipmozo-domestic.adapter.ts push "GST";
    // aramex.adapter.ts pushes "TAX".
    for (const name of ["GST", "gst", "TAX", "IGST", "CGST", "SGST", "Service Tax"]) {
      assert.equal(isVendorTaxLine({ name, amount: 1 }), true, name);
    }
  });

  it("does not mistake a real charge for a tax line", () => {
    for (const name of [
      "FREIGHT",
      "Fuel surcharge",
      "Overhead charges",
      "Taxable handling", // starts with "Tax" but is not a tax head
    ]) {
      assert.equal(isVendorTaxLine({ name, amount: 1 }), false, name);
    }
  });

  it("drops the vendor's tax without losing its value from the total", () => {
    // The vendor's own GST is Arena's input cost. It comes out of the
    // breakdown, but the customer still paid the full total, so the amount
    // must be redistributed across the real service lines.
    const money = build({
      totalCharged: 11800,
      charges: [
        { name: "FREIGHT", amount: 10000 },
        { name: "GST", amount: 1800 },
      ],
    });

    assert.equal(money.lineItems.length, 1);
    assert.equal(money.lineItems[0].lineTotal, 11800);
    assert.equal(money.total, 11800);
  });
});

describe("invariants", () => {
  it("holds over thousands of generated shipments", () => {
    const random = makeRandom(98765);

    const vendorNames = [
      "FREIGHT",
      "Fuel surcharge",
      "Overhead charges",
      "ODA charges",
      "Documentation charges",
      "GST",
      "TAX",
    ];

    for (let run = 0; run < 5000; run++) {
      const chargeCount = 1 + Math.floor(random() * 5);

      const charges: RawCharge[] = Array.from({ length: chargeCount }, () => ({
        name: vendorNames[Math.floor(random() * vendorNames.length)],
        // Deliberately messy amounts: three decimal places and tiny values,
        // which is where per-line markup rounding drifts worst.
        amount: Math.round(random() * 5000000) / 1000,
      }));

      const firstMile = random() < 0.4 ? Math.round(random() * 300000) / 100 : 0;

      // The total is the authoritative figure and is intentionally NOT the sum
      // of the charges: that mismatch is exactly the condition the engine is
      // built to reconcile.
      const totalCharged = Math.round(random() * 20000000) / 100;
      if (totalCharged <= 0) continue;

      const intraState = random() < 0.5;

      const money = build({
        totalCharged,
        charges,
        firstMileCharge: firstMile,
        firstMileLabel: "Dwarka",
        mode: random() < 0.5 ? ShipmentMode.DOMESTIC : ShipmentMode.INTERNATIONAL,
        placeOfSupplyCode: intraState ? SELLER_STATE : "29",
      });

      const context = `run ${run}: total ${totalCharged}`;

      // I1
      assert.equal(toPaise(money.total), toPaise(totalCharged), `${context} (I1)`);

      // I2
      assert.equal(
        paiseSum(money.lineItems.map((l) => l.taxableValue)),
        toPaise(money.taxableValue),
        `${context} (I2)`,
      );

      // I3
      assert.equal(
        toPaise(money.taxableValue) + toPaise(money.totalTax),
        toPaise(money.total),
        `${context} (I3)`,
      );

      // I4
      assert.equal(
        toPaise(money.cgstAmount) +
          toPaise(money.sgstAmount) +
          toPaise(money.igstAmount),
        toPaise(money.totalTax),
        `${context} (I4)`,
      );

      // I5
      for (const line of money.lineItems) {
        assert.equal(
          Math.round(line.taxableValue * 100),
          toPaise(line.taxableValue),
          `${context} (I5)`,
        );
      }

      // Each line's own parts must also close, or the printed row is wrong
      // even though the column totals happen to be right.
      for (const line of money.lineItems) {
        assert.equal(
          toPaise(line.taxableValue) +
            toPaise(line.cgstAmount) +
            toPaise(line.sgstAmount) +
            toPaise(line.igstAmount),
          toPaise(line.lineTotal),
          `${context} (line closes)`,
        );
      }

      // Lines must sum to the invoice total too.
      assert.equal(
        paiseSum(money.lineItems.map((l) => l.lineTotal)),
        toPaise(money.total),
        `${context} (line totals)`,
      );

      // No zero-value or negative lines should survive onto a document.
      for (const line of money.lineItems) {
        assert.ok(line.lineTotal > 0, `${context} (positive lines)`);
      }

      assert.deepEqual(
        verifyInvoiceMoney(money, totalCharged),
        { ok: true },
        `${context} (verify)`,
      );
    }
  });
});

describe("tax heads", () => {
  it("charges IGST when the place of supply differs from the seller state", () => {
    const money = build({
      totalCharged: 23200,
      charges: [{ name: "FREIGHT", amount: 23200 }],
      placeOfSupplyCode: "29",
    });

    assert.equal(money.isIntraState, false);
    assert.equal(money.cgstAmount, 0);
    assert.equal(money.sgstAmount, 0);
    assert.equal(money.igstAmount, money.totalTax);
  });

  it("splits into CGST and SGST within the seller state", () => {
    const money = build({
      totalCharged: 23200,
      charges: [{ name: "FREIGHT", amount: 23200 }],
      placeOfSupplyCode: SELLER_STATE,
    });

    assert.equal(money.isIntraState, true);
    assert.equal(money.igstAmount, 0);
    assert.equal(
      toPaise(money.cgstAmount) + toPaise(money.sgstAmount),
      toPaise(money.totalTax),
    );
    // An odd paisa goes to SGST, never lost.
    assert.ok(Math.abs(toPaise(money.sgstAmount) - toPaise(money.cgstAmount)) <= 1);
  });

  it("back-computes tax out of a tax-inclusive price", () => {
    // 23,200 inclusive of 18% is 19,661.02 taxable + 3,538.98 tax.
    const money = build({
      totalCharged: 23200,
      charges: [{ name: "FREIGHT", amount: 23200 }],
    });

    assert.equal(money.taxableValue, 19661.02);
    assert.equal(money.totalTax, 3538.98);
    assert.equal(money.total, 23200);
  });

  it("produces a valid zero-rated invoice when the rate is 0", () => {
    const money = build({
      totalCharged: 23200,
      charges: [{ name: "FREIGHT", amount: 23200 }],
      taxTreatmentOverride: {
        ratePercent: 0,
        note: "Exempt supply",
        sacCode: "996812",
        sacDescription: "Goods transport services",
      },
    });

    assert.equal(money.totalTax, 0);
    assert.equal(money.taxableValue, 23200);
    assert.equal(money.total, 23200);
    assert.equal(money.taxNote, "Exempt supply");
    assert.deepEqual(verifyInvoiceMoney(money, 23200), { ok: true });
  });
});

describe("line assembly", () => {
  it("keeps freight and door pickup as separate lines", () => {
    const money = build({
      totalCharged: 19661,
      charges: [{ name: "FREIGHT", amount: 18644 }],
      firstMileCharge: 1017,
      firstMileLabel: "Dwarka, New Delhi",
    });

    assert.equal(money.lineItems.length, 2);
    assert.equal(money.lineItems[1].description, "Door pickup, Dwarka, New Delhi");
  });

  it("merges lines that describe the same thing", () => {
    const money = buildInvoiceMoney(
      {
        totalCharged: 10000,
        charges: [
          { name: "FREIGHT", amount: 5000 },
          { name: "unknown-a", amount: 3000 },
          { name: "unknown-b", amount: 2000 },
        ],
        mode: ShipmentMode.INTERNATIONAL,
        sellerStateCode: SELLER_STATE,
        placeOfSupplyCode: "29",
      },
      // Stand-in for the real describer: everything unknown collapses.
      (name) => (name === "FREIGHT" ? "Freight" : "Handling and surcharges"),
    );

    assert.equal(money.lineItems.length, 2);
    assert.equal(money.lineItems[0].description, "Freight");
    assert.equal(money.lineItems[1].description, "Handling and surcharges");
    assert.equal(money.lineItems[1].lineTotal, 5000);
  });

  it("keeps the vendor's line order rather than reordering the document", () => {
    // First appearance wins. Every adapter pushes freight first, so freight
    // leads the invoice without the engine needing an opinion about ranking.
    const money = buildInvoiceMoney(
      {
        totalCharged: 10000,
        charges: [
          { name: "surcharge", amount: 2000 },
          { name: "FREIGHT", amount: 8000 },
        ],
        mode: ShipmentMode.INTERNATIONAL,
        sellerStateCode: SELLER_STATE,
        placeOfSupplyCode: "29",
      },
      (name) => (name === "FREIGHT" ? "Freight" : "Surcharge"),
    );

    assert.deepEqual(
      money.lineItems.map((l) => l.description),
      ["Surcharge", "Freight"],
    );
  });

  it("still produces an invoice when the snapshot has no usable charges", () => {
    // A snapshot that was nothing but a vendor tax line, or an empty one, must
    // not produce a document with no lines on it.
    const money = build({
      totalCharged: 5000,
      charges: [{ name: "GST", amount: 900 }],
      mode: ShipmentMode.DOMESTIC,
    });

    assert.equal(money.lineItems.length, 1);
    assert.equal(money.lineItems[0].description, "Domestic courier services");
    assert.equal(money.lineItems[0].lineTotal, 5000);
    assert.deepEqual(verifyInvoiceMoney(money, 5000), { ok: true });
  });

  it("drops zero and negative charges", () => {
    const money = build({
      totalCharged: 1000,
      charges: [
        { name: "FREIGHT", amount: 1000 },
        { name: "Waiver", amount: 0 },
        { name: "Adjustment", amount: -50 },
      ],
    });

    assert.equal(money.lineItems.length, 1);
  });
});

describe("verifyInvoiceMoney", () => {
  it("rejects a total that does not match what was charged", () => {
    const money = build({
      totalCharged: 1000,
      charges: [{ name: "FREIGHT", amount: 1000 }],
    });

    const result = verifyInvoiceMoney(money, 1001);

    assert.equal(result.ok, false);
  });

  it("rejects an invoice whose lines were tampered with", () => {
    const money = build({
      totalCharged: 1000,
      charges: [{ name: "FREIGHT", amount: 1000 }],
    });
    money.lineItems[0].taxableValue += 1;

    const result = verifyInvoiceMoney(money, 1000);

    assert.equal(result.ok, false);
  });
});

describe("amountInWords", () => {
  it("uses the Indian numbering system", () => {
    assert.equal(amountInWords(23200), "Twenty Three Thousand Two Hundred Rupees only");
    assert.equal(amountInWords(100000), "One Lakh Rupees only");
    assert.equal(amountInWords(10000000), "One Crore Rupees only");
    assert.equal(
      amountInWords(123456),
      "One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees only",
    );
  });

  it("spells out paise", () => {
    assert.equal(
      amountInWords(23200.5),
      "Twenty Three Thousand Two Hundred Rupees and Fifty Paise only",
    );
  });

  it("handles zero", () => {
    assert.equal(amountInWords(0), "Zero Rupees only");
  });
});
