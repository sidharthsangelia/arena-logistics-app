/**
 * utils/invoiceHsn.test.tsx
 *
 * The one HSN a booking invoice prints at the head of its cargo block.
 *
 * A booking's goods are a list of items, each with its own code, and the
 * invoice states one. The rule is the item there is most of: three t-shirts and
 * one charger prints the t-shirt's code.
 *
 * These assertions exist because the rule has three edges that are easy to get
 * wrong and impossible to see on a rendered page, since a wrong code looks
 * exactly like a right one:
 *
 *   - a quantity is per BOX, so a row of identical boxes multiplies it;
 *   - an item with no code cannot win by being the biggest;
 *   - a tie keeps the order the shipper listed the goods in.
 *
 * Run: node --import tsx --test "utils/*.test.tsx"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dominantHsCode } from "../lib/invoices/tax/pdf/TaxInvoiceDocument";
import type {
  PackageContentSnapshot,
  PackageSnapshot,
} from "../lib/invoices/tax/types";

function item(
  description: string,
  hsCode: string | null,
  quantity: number,
): PackageContentSnapshot {
  return { description, hsCode, quantity, unitValue: 100, currency: "INR" };
}

function box(quantity: number, contents: PackageContentSnapshot[]): PackageSnapshot {
  return {
    description: "Box",
    quantity,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 10,
    weightKg: 5,
    declaredValue: null,
    declaredCurrency: null,
    contents,
  };
}

describe("dominantHsCode", () => {
  it("takes the code of the item there is most of", () => {
    const boxes = [
      box(1, [item("T-shirts", "610910", 3), item("Charger", "850440", 1)]),
    ];

    assert.equal(dominantHsCode(boxes), "610910");
  });

  it("counts an item once per identical box, not once per row", () => {
    // Two chargers in each of five boxes is ten chargers, and beats the four
    // t-shirts packed once. Counting rows rather than pieces would have picked
    // the t-shirt.
    const boxes = [
      box(1, [item("T-shirts", "610910", 4)]),
      box(5, [item("Charger", "850440", 2)]),
    ];

    assert.equal(dominantHsCode(boxes), "850440");
  });

  it("will not print a code an untyped item does not have", () => {
    // The bulk of the consignment carries no code at all. That is the absence
    // of an answer, so the answer comes from the goods that do have one rather
    // than the block printing nothing.
    const boxes = [
      box(1, [item("Assorted goods", null, 90), item("Belts", "420330", 2)]),
    ];

    assert.equal(dominantHsCode(boxes), "420330");
  });

  it("keeps the first of a tie, which is the order the shipper listed", () => {
    const boxes = [
      box(1, [item("Shirts", "610510", 10), item("Jeans", "620462", 10)]),
    ];

    assert.equal(dominantHsCode(boxes), "610510");
  });

  it("says nothing when the booking recorded no codes", () => {
    // Domestic bookings routinely carry none, and a cargo block with no HSN
    // line is the honest rendering of that.
    assert.equal(dominantHsCode([box(1, [item("Documents", null, 1)])]), null);
    assert.equal(dominantHsCode([box(2, [])]), null);
    assert.equal(dominantHsCode([]), null);
  });

  it("ignores a code that is only whitespace", () => {
    const boxes = [
      box(1, [item("Samples", "   ", 50), item("Belts", "420330", 1)]),
    ];

    assert.equal(dominantHsCode(boxes), "420330");
  });
});
