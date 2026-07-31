/**
 * utils/invoiceChargeNames.test.ts
 *
 * The charge descriptions printed on a tax invoice.
 *
 * These tests exist because of a real defect: the first version of
 * chargeNames.ts was a strict allowlist, so every vendor charge outside the
 * list collapsed into one shared generic line and merged with the others. The
 * invoice showed a total with extra steps instead of a breakdown.
 *
 * So the assertions here pull in two directions on purpose:
 *
 *   - Charges the vendor sent MUST reach the customer under their own wording.
 *   - No vendor's identity may reach the customer under any wording.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ShipmentMode } from "@/generated/prisma";
import {
  UNMAPPED_CHARGE_DESCRIPTION,
  isSuppressedChargeName,
  makeChargeDescriber,
} from "@/lib/invoices/tax/chargeNames";

const describeIntl = makeChargeDescriber({
  mode: ShipmentMode.INTERNATIONAL,
  originCity: "New Delhi",
  destinationCity: "Dubai",
});

const describeDomestic = makeChargeDescriber({
  mode: ShipmentMode.DOMESTIC,
  originCity: "Mumbai",
  destinationCity: "Chennai",
});

describe("freight is named with its route", () => {
  it("names the international leg", () => {
    assert.equal(
      describeIntl("FREIGHT"),
      "International air freight, New Delhi to Dubai",
    );
  });

  it("names the domestic leg", () => {
    assert.equal(
      describeDomestic("shipping_charges"),
      "Domestic courier services, Mumbai to Chennai",
    );
  });

  it("falls back to a plain label with no route", () => {
    const noRoute = makeChargeDescriber({ mode: ShipmentMode.INTERNATIONAL });
    assert.equal(noRoute("FREIGHT"), "International air freight");
  });
});

describe("curated names get curated wording", () => {
  const cases: Array<[string, string]> = [
    ["Fuel surcharge", "Fuel surcharge"],
    ["FUEL_SURCHARGE", "Fuel surcharge"],
    ["fsc", "Fuel surcharge"],
    ["Overhead charges", "Handling charges"],
    ["AWB_CHARGES", "Airway bill charges"],
    ["COD", "Cash on delivery charges"],
    ["ODA_CHARGES", "Out of delivery area charges"],
    ["Peak Surcharge", "Peak season surcharge"],
    ["green-tax", "Environmental surcharge"],
  ];

  for (const [raw, expected] of cases) {
    it(`${raw} prints as ${expected}`, () => {
      assert.equal(describeIntl(raw), expected);
    });
  }
});

describe("uncurated charges still reach the customer", () => {
  // The defect this file exists for. A vendor inventing a surcharge name must
  // not make the charge vanish into the generic line.
  const shown: Array<[string, string]> = [
    ["War risk surcharge", "War risk surcharge"],
    ["X-Ray Charges", "X ray charges"],
    ["Airport charges (origin)", "Airport charges origin"],
    ["SECURITY_SCREENING", "Security screening"],
    ["Freight @ 120/kg", "Freight 120kg"],
    ["Dangerous goods handling", "Dangerous goods handling"],
  ];

  for (const [raw, expected] of shown) {
    it(`${raw} prints as ${expected}`, () => {
      assert.equal(describeIntl(raw), expected);
      assert.equal(isSuppressedChargeName(raw), false);
    });
  }

  it("uppercases acronyms the customer would not otherwise read", () => {
    assert.equal(describeIntl("awb handling fee"), "AWB handling fee");
  });
});

describe("vendor identity never reaches the customer", () => {
  // carrierBranding.md: sourcing vendors are not disclosed. Charge names are a
  // side door, because skart passes charge_name straight through from its API.
  const suppressed = [
    "SHIPMOZO_HANDLING",
    "skart surcharge",
    "Aramex handling",
    "DHL fuel surcharge",
    "FedEx remote area",
    "Delhivery pickup",
    "Bluedart charges",
  ];

  for (const raw of suppressed) {
    it(`${raw} is suppressed`, () => {
      assert.equal(describeIntl(raw), UNMAPPED_CHARGE_DESCRIPTION);
      assert.equal(isSuppressedChargeName(raw), true);
    });
  }

  it("suppresses Arena's own economics", () => {
    for (const raw of ["vendor cost", "markup amount", "partner margin"]) {
      assert.equal(describeIntl(raw), UNMAPPED_CHARGE_DESCRIPTION);
    }
  });
});

describe("labels that are not descriptions are suppressed", () => {
  const suppressed = ["CHG_001", "X1 22", "", "   ", "999", "-"];

  for (const raw of suppressed) {
    it(`${JSON.stringify(raw)} is suppressed`, () => {
      assert.equal(describeIntl(raw), UNMAPPED_CHARGE_DESCRIPTION);
    });
  }

  it("suppresses a label long enough to be a sentence", () => {
    assert.equal(
      describeIntl(
        "This charge covers assorted handling and documentation work at origin",
      ),
      UNMAPPED_CHARGE_DESCRIPTION,
    );
  });
});
