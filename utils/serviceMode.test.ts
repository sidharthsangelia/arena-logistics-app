/**
 * utils/serviceMode.test.ts
 *
 * The surface/air split on the domestic service step is name-driven, so the
 * risk is entirely in the matching: a substring match puts "Aircel" in the air
 * tab, and a missing MOVIN rule buries a same-day flight among trucks.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyServiceMode } from "@/lib/booking/serviceMode";

describe("classifyServiceMode", () => {
  it("reads the word air out of real Shipmozo product names", () => {
    const airNames = [
      "Delhivery Air 0.5 Kg",
      "Blue Dart AIR 1 KG",
      "Ekart air 10kg",
      "Xpressbees Air-Express 2 Kg",
      "DTDC Air Cargo",
    ];
    for (const name of airNames) {
      assert.equal(classifyServiceMode(name), "air", name);
    }
  });

  it("treats every MOVIN product as air, spelled either way", () => {
    assert.equal(classifyServiceMode("Movin Air 5 Kg"), "air");
    assert.equal(classifyServiceMode("MOVIN Express 5 Kg"), "air");
    assert.equal(classifyServiceMode("Moving Standard 10 Kg"), "air");
  });

  it("keeps surface products on surface", () => {
    const surfaceNames = [
      "Delhivery Surface 0.5 Kg",
      "Xpressbees Surface 0.5 K.G",
      "Ecom Express 5 Kg",
      "Shadowfax 1 Kg",
      "Amazon Shipping 0.5",
    ];
    for (const name of surfaceNames) {
      assert.equal(classifyServiceMode(name), "surface", name);
    }
  });

  it("does not match air inside a longer word", () => {
    assert.equal(classifyServiceMode("Aircel Logistics 1 Kg"), "surface");
    assert.equal(classifyServiceMode("Repair Returns 2 Kg"), "surface");
    assert.equal(classifyServiceMode("Chairs Bulk Surface"), "surface");
  });

  it("falls back to surface for empty or unrecognised names", () => {
    assert.equal(classifyServiceMode(""), "surface");
    assert.equal(classifyServiceMode("Courier"), "surface");
  });
});
