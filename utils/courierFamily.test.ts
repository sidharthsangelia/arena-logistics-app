/**
 * utils/courierFamily.test.ts
 *
 * The merging on the domestic rate list is only as safe as this function. A
 * WRONG merge takes a rate away from a customer at the price they were shown;
 * a missed merge only costs one extra card. So the assertions below are lopsided
 * on purpose: they pin the real product names Shipmozo and SpeedoPost return,
 * and they pin that anything unrecognised stays on its own.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { courierFamily } from "@/lib/rates/courierFamily";

/** Convenience: the two names belong to the same group. */
function sameFamily(a: string, b: string): boolean {
  return courierFamily(a).key === courierFamily(b).key;
}

describe("courierFamily", () => {
  it("collapses the weight slabs of one courier onto one family", () => {
    assert.ok(sameFamily("Delhivery Surface 0.5 Kg", "Delhivery Surface 5 Kg"));
    assert.ok(sameFamily("Xpressbees Surface 0.5 K.G", "Xpressbees Surface 10kg"));
    assert.ok(sameFamily("Amazon Shipping 0.5", "Amazon Shipping 1 Kg"));
    assert.ok(sameFamily("Shadowfax 1 Kg", "Shadowfax 5 Kg"));
  });

  it("keeps a courier's surface and air products on the same family", () => {
    // The MODE split happens in courierGroups, not here: this function answers
    // "who carries it", and the group key adds the mode on top.
    assert.ok(sameFamily("Delhivery Air 0.5 Kg", "Delhivery Surface 0.5 Kg"));
  });

  it("files a courier's own sub-networks under the courier", () => {
    assert.equal(courierFamily("Delhivery Dense 10 Kg").key, "DELHIVERY");
    assert.equal(courierFamily("Delhivery Surface 10 Kg").key, "DELHIVERY");
  });

  it("never merges two different couriers", () => {
    const names = [
      "Delhivery Surface 5 Kg",
      "Xpressbees Surface 5 Kg",
      "Shadowfax 5 Kg",
      "Amazon Shipping 5 Kg",
      "Blue Dart Surface 5 Kg",
      "Ecom Express 5 Kg",
      "DTDC Air Cargo",
      "Ekart air 10kg",
      "Smartr 5 Kg",
      "MOVIN Express 5 Kg",
    ];
    const keys = names.map((n) => courierFamily(n).key);
    assert.equal(new Set(keys).size, names.length, keys.join(", "));
  });

  it("resolves two-word brands rather than their first word", () => {
    assert.equal(courierFamily("Blue Dart AIR 1 KG").key, "BLUEDART");
    assert.equal(courierFamily("Bluedart Surface 2 Kg").key, "BLUEDART");
    assert.equal(courierFamily("DP World Surface").key, "DPWORLD");
    assert.equal(courierFamily("DP World Air").key, "DPWORLD");
    assert.equal(courierFamily("Ecom Express 5 Kg").label, "Ecom Express");
  });

  it("gives one courier one spelling whichever vendor named it", () => {
    // Shipmozo writes "Xpressbees", SpeedoPost's catalogue writes "XpressBees".
    // Grouping across vendors is the point, so both must land on one label.
    assert.equal(courierFamily("Xpressbees Surface 1 Kg").label, "XpressBees");
    assert.equal(courierFamily("XPRESSBEES 1 Kg").label, "XpressBees");
  });

  it("merges slabs of a courier it has never heard of", () => {
    assert.ok(sameFamily("Nimbus Cargo 0.5 Kg", "Nimbus Cargo 10 Kg"));
    assert.ok(sameFamily("Nimbus Cargo 6CFT", "Nimbus Cargo 10 CFT"));
    assert.equal(courierFamily("Nimbus Cargo 0.5 Kg").label, "Nimbus Cargo");
  });

  it("leaves two unknown couriers apart", () => {
    assert.ok(!sameFamily("Nimbus Cargo 5 Kg", "Cirrus Cargo 5 Kg"));
  });

  it("does not read a brand out of the middle of another word", () => {
    // "Gati" inside "Navigation", "air" inside "Aircel": a substring match here
    // would put unrelated couriers in one group.
    assert.notEqual(courierFamily("Navigation Logistics 1 Kg").key, "GATI");
    assert.equal(courierFamily("Aircel Logistics 1 Kg").label, "Aircel Logistics");
  });

  it("keeps a label that is nothing but slab words", () => {
    // Everything strippable is stripped, so the original stands rather than the
    // quote merging into an empty-named bucket with every other oddity.
    assert.equal(courierFamily("Surface 5 Kg").label, "Surface 5 Kg");
    assert.ok(!sameFamily("Surface 5 Kg", "Air 5 Kg"));
  });

  it("is stable when called twice, so a /g pattern never skips a match", () => {
    const first = courierFamily("Nimbus Cargo 5 Kg");
    const second = courierFamily("Nimbus Cargo 5 Kg");
    assert.deepEqual(first, second);
  });

  it("survives a blank or missing name", () => {
    for (const value of ["", "   ", null, undefined]) {
      const family = courierFamily(value);
      assert.ok(family.key.length > 0);
      assert.ok(family.label.length > 0);
    }
  });
});
