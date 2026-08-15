/**
 * utils/rateCarrier.test.ts
 *
 * The service classifier turns a vendor's free-text label into the carrier and
 * the terms behind a price. Every cross-vendor comparison, and eventually every
 * quotation sheet, groups on its output.
 *
 * A mistake here is invisible in a way most bugs are not. Nothing crashes; a
 * FedEx rate quietly files under OTHER and drops out of the FedEx table, or a
 * duty-unpaid rate files as UNKNOWN and gets ranked against duty-paid ones,
 * looks cheapest, and wins the quote. The customer finds out at the door.
 *
 * So the centrepiece is not the regexes but the table below: every distinct
 * service name that has actually come back from the four live vendors, with the
 * answer it must produce. When a vendor renames something or a new one is
 * added, that table is where it gets pinned.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  UNMAPPED_CARRIER,
  carrierLabel,
  classifyService,
  detectCarrier,
  isOwnBrandNetwork,
  knownCarrierCodes,
} from "@/lib/rateSweep/carrier";

/**
 * Every distinct productName observed in the first full sweep (2026-08-15),
 * 45 of them across the four vendors, with the carrier each must resolve to.
 *
 * Kept verbatim, trailing full stops and doubled spellings included. The value
 * of this table is that it is real: "Aramex Premium - with Pickup" and "Aramex
 * Premium (with Pickup)" are both here because Shipmozo genuinely returns both,
 * and a classifier that handles only the tidy one is a classifier that loses
 * rows in production.
 */
const OBSERVED_SERVICES: readonly { vendor: string; name: string; carrier: string }[] = [
  // ── aramex (direct account) ──
  { vendor: "aramex", name: "Aramex Express", carrier: "ARAMEX" },

  // ── shipmozo ──
  { vendor: "shipmozo", name: "Fedex DL - with Pickup", carrier: "FEDEX" },
  { vendor: "shipmozo", name: "Fedex Non-Documents.", carrier: "FEDEX" },
  { vendor: "shipmozo", name: "Aramex Premium - with Pickup", carrier: "ARAMEX" },
  { vendor: "shipmozo", name: "Aramex Premium (with Pickup)", carrier: "ARAMEX" },
  { vendor: "shipmozo", name: "DHL Non-Documents.", carrier: "DHL" },
  { vendor: "shipmozo", name: "UPS Non-Documents (O)", carrier: "UPS" },
  { vendor: "shipmozo", name: "UPS (Special) Non-Documents", carrier: "UPS" },
  { vendor: "shipmozo", name: "Shipmozo Sky Saver - Duty Paid", carrier: "SHIPMOZO" },
  { vendor: "shipmozo", name: "Shipmozo Sky Ecom - Duty Paid", carrier: "SHIPMOZO" },
  { vendor: "shipmozo", name: "Shipmozo Self USA - Duty Paid", carrier: "SHIPMOZO" },
  { vendor: "shipmozo", name: "Shipmozo Ecom USA - Duty Paid", carrier: "SHIPMOZO" },

  // ── skart ──
  { vendor: "skart", name: "FEDEX DEL", carrier: "FEDEX" },
  { vendor: "skart", name: "Fedex DEL DDU", carrier: "FEDEX" },
  { vendor: "skart", name: "DHL DEL", carrier: "DHL" },
  { vendor: "skart", name: "DHL DEL DDU ( Gifts Only )", carrier: "DHL" },
  { vendor: "skart", name: "UPS Express DEL", carrier: "UPS" },
  { vendor: "skart", name: "UPS World", carrier: "UPS" },
  { vendor: "skart", name: "UPS World DEL USA", carrier: "UPS" },
  { vendor: "skart", name: "Aramex Exp DEL", carrier: "ARAMEX" },
  { vendor: "skart", name: "Aramex Exp GPX", carrier: "ARAMEX" },
  { vendor: "skart", name: "Aramex Exp DPX", carrier: "ARAMEX" },
  { vendor: "skart", name: "Aramex Aus PPX DEL", carrier: "ARAMEX" },
  { vendor: "skart", name: "Aramex Aus GPX", carrier: "ARAMEX" },
  { vendor: "skart", name: "Aramex UK GPX", carrier: "ARAMEX" },
  { vendor: "skart", name: "Aramex USA Del", carrier: "ARAMEX" },
  { vendor: "skart", name: "Emirates B2B DEL", carrier: "EMIRATES" },

  // ── shipglobal ──
  { vendor: "shipglobal", name: "Fedex", carrier: "FEDEX" },
  { vendor: "shipglobal", name: "UPS", carrier: "UPS" },
  { vendor: "shipglobal", name: "UPS Promotional", carrier: "UPS" },
  // Own-brand name carrying a real carrier. The parcel moves on UPS Ground and
  // that is what makes it comparable with every other UPS row; the fact that
  // ShipGlobal sourced it is already recorded in vendorId.
  { vendor: "shipglobal", name: "ShipGlobal Premium UPS Ground", carrier: "UPS" },
  { vendor: "shipglobal", name: "ShipGlobal Premium DPD", carrier: "DPD" },
  { vendor: "shipglobal", name: "ShipGlobal USPS Special", carrier: "USPS" },
  { vendor: "shipglobal", name: "ShipGlobal CA Post Special", carrier: "CANADA_POST" },
  { vendor: "shipglobal", name: "ShipGlobal AU Post Special", carrier: "AUSTRALIA_POST" },
  { vendor: "shipglobal", name: "ShipGlobal Direct", carrier: "SHIPGLOBAL" },
  // Same service, different capitalisation, straight from the vendor. Both must
  // land on one code or ShipGlobal Direct splits into two products in analysis.
  { vendor: "shipglobal", name: "Shipglobal Direct", carrier: "SHIPGLOBAL" },
  { vendor: "shipglobal", name: "ShipGlobal Direct Commercial", carrier: "SHIPGLOBAL" },
  { vendor: "shipglobal", name: "ShipGlobal Premium", carrier: "SHIPGLOBAL" },
  { vendor: "shipglobal", name: "ShipGlobal First Class", carrier: "SHIPGLOBAL" },
  { vendor: "shipglobal", name: "ShipGlobal Rakhi Special", carrier: "SHIPGLOBAL" },
  { vendor: "shipglobal", name: "ShipGlobal WorldWide", carrier: "SHIPGLOBAL" },
  { vendor: "shipglobal", name: "ShipGlobal Economy", carrier: "SHIPGLOBAL" },
  { vendor: "shipglobal", name: "Shipglobal Express", carrier: "SHIPGLOBAL" },
  { vendor: "shipglobal", name: "ShipGlobal CA eCommerce Special", carrier: "SHIPGLOBAL" },
];

describe("carrier detection over every observed service name", () => {
  for (const service of OBSERVED_SERVICES) {
    it(`${service.vendor}: "${service.name}" -> ${service.carrier}`, () => {
      assert.equal(detectCarrier(service.name), service.carrier);
    });
  }

  it("leaves nothing observed in the unmapped bucket", () => {
    const stranded = OBSERVED_SERVICES.filter(
      (s) => detectCarrier(s.name) === UNMAPPED_CARRIER,
    );

    assert.deepEqual(
      stranded.map((s) => s.name),
      [],
      "every service the vendors actually return must map to a carrier",
    );
  });

  it("finds the same carrier under three vendors' spellings of FedEx", () => {
    const fedex = OBSERVED_SERVICES.filter((s) => detectCarrier(s.name) === "FEDEX");
    const vendors = new Set(fedex.map((s) => s.vendor));

    // The entire point of the column: a cross-vendor FedEx comparison needs
    // FedEx rows from more than one vendor to compare.
    assert.ok(vendors.size >= 3, `FedEx found under only ${vendors.size} vendors`);
  });

  it("finds Aramex under our own account and the resellers that carry it", () => {
    const aramex = OBSERVED_SERVICES.filter((s) => detectCarrier(s.name) === "ARAMEX");
    const vendors = new Set(aramex.map((s) => s.vendor));

    // "Where is our direct Aramex account beaten by a reseller's Aramex" is one
    // of the questions this exercise exists to answer, and it needs the direct
    // account and the resold ones on one code.
    assert.ok(vendors.has("aramex"), "our own Aramex account must classify as ARAMEX");
    assert.ok(vendors.has("shipmozo") && vendors.has("skart"));

    // Three, not four: ShipGlobal's catalogue contains no Aramex service at
    // all. That is a fact about their product range, not a gap in the rules,
    // and if a ShipGlobal Aramex row ever appears this number should move.
    assert.equal(vendors.size, 3);
  });
});

describe("carrier rules that could quietly go wrong", () => {
  it("does not read USPS as UPS", () => {
    assert.equal(detectCarrier("ShipGlobal USPS Special"), "USPS");
  });

  it("does not match a lowercase ups inside another word", () => {
    // The UPS pattern is case-sensitive precisely so this cannot happen.
    assert.notEqual(detectCarrier("Groups Express"), "UPS");
    assert.notEqual(detectCarrier("Shipmozo Backups"), "UPS");
  });

  it("prefers the real carrier over the reseller that sold it", () => {
    assert.equal(detectCarrier("ShipGlobal Premium UPS Ground"), "UPS");
    assert.equal(detectCarrier("ShipGlobal Premium DPD"), "DPD");
  });

  it("matches Aramex before treating it as a vendor name", () => {
    // ARAMEX is first in the rule list because it is both a carrier and one of
    // our vendors; a later position would still work today but would break the
    // moment a reseller prefixes its own brand.
    assert.equal(detectCarrier("Shipmozo Aramex Premium"), "ARAMEX");
  });

  it("tolerates the spellings vendors actually use for ShipGlobal", () => {
    for (const name of ["ShipGlobal Direct", "Shipglobal Direct", "Ship Global Direct"]) {
      assert.equal(detectCarrier(name), "SHIPGLOBAL", name);
    }
  });

  it("returns OTHER rather than guessing", () => {
    assert.equal(detectCarrier("Some New Courier Express"), UNMAPPED_CARRIER);
    assert.equal(detectCarrier(""), UNMAPPED_CARRIER);
    assert.equal(detectCarrier(null), UNMAPPED_CARRIER);
    assert.equal(detectCarrier(undefined), UNMAPPED_CARRIER);
  });

  it("marks reseller networks as own-brand and real carriers as not", () => {
    assert.equal(isOwnBrandNetwork("SHIPGLOBAL"), true);
    assert.equal(isOwnBrandNetwork("SHIPMOZO"), true);
    assert.equal(isOwnBrandNetwork("FEDEX"), false);
    assert.equal(isOwnBrandNetwork("ARAMEX"), false);
    assert.equal(isOwnBrandNetwork(UNMAPPED_CARRIER), false);
  });

  it("has a label for every code it can produce", () => {
    for (const code of knownCarrierCodes()) {
      assert.ok(carrierLabel(code).length > 0, code);
    }
  });
});

describe("duty mode", () => {
  it("reads duty-paid labels", () => {
    assert.equal(classifyService("Shipmozo Sky Saver - Duty Paid").dutyMode, "DUTY_PAID");
    assert.equal(classifyService("FEDEX DEL DDP").dutyMode, "DUTY_PAID");
  });

  it("reads duty-unpaid labels", () => {
    assert.equal(classifyService("Fedex DEL DDU").dutyMode, "DUTY_UNPAID");
    assert.equal(classifyService("DHL DEL DDU ( Gifts Only )").dutyMode, "DUTY_UNPAID");
  });

  it("never reads 'duty unpaid' as paid", () => {
    // The costly direction. A DUTY_UNPAID rate mislabelled DUTY_PAID looks
    // cheapest in a comparison, wins the quote, and hands the customer a
    // customs bill nobody warned them about.
    assert.equal(classifyService("Express Duty Unpaid").dutyMode, "DUTY_UNPAID");
    assert.equal(classifyService("Express Duty Not Paid").dutyMode, "DUTY_UNPAID");
  });

  it("says UNKNOWN rather than assuming, when the label is silent", () => {
    assert.equal(classifyService("Aramex Express").dutyMode, "UNKNOWN");
    assert.equal(classifyService("UPS World").dutyMode, "UNKNOWN");
  });
});

describe("content type", () => {
  it("reads non-documents before documents", () => {
    // "Non-Documents" contains "Documents"; the wrong order files every parcel
    // service as a document service.
    assert.equal(classifyService("DHL Non-Documents.").contentType, "NON_DOCUMENTS");
    assert.equal(classifyService("UPS Non-Documents (O)").contentType, "NON_DOCUMENTS");
    assert.equal(classifyService("UPS (Special) Non-Documents").contentType, "NON_DOCUMENTS");
  });

  it("reads document services", () => {
    assert.equal(classifyService("DHL Documents").contentType, "DOCUMENTS");
    assert.equal(classifyService("FedEx Docs").contentType, "DOCUMENTS");
  });

  it("says UNKNOWN when the label is silent", () => {
    assert.equal(classifyService("Aramex Express").contentType, "UNKNOWN");
  });
});

describe("pickup", () => {
  it("reads both of Shipmozo's spellings", () => {
    assert.equal(classifyService("Fedex DL - with Pickup").pickupIncluded, true);
    assert.equal(classifyService("Aramex Premium (with Pickup)").pickupIncluded, true);
    assert.equal(classifyService("Aramex Premium - with Pickup").pickupIncluded, true);
  });

  it("reads self-drop services as no pickup", () => {
    assert.equal(classifyService("Shipmozo Self USA - Duty Paid").pickupIncluded, false);
  });

  it("is null, not false, when the label says nothing", () => {
    // Recording silence as "no pickup" would invent a fact about what the price
    // covers, and a quotation built on it would be wrong in the customer's
    // favour or ours at random.
    assert.equal(classifyService("Aramex Express").pickupIncluded, null);
    assert.equal(classifyService("UPS World").pickupIncluded, null);
  });
});

describe("restrictions", () => {
  it("catches gifts-only, which cannot go in a general quotation", () => {
    assert.equal(
      classifyService("DHL DEL DDU ( Gifts Only )").restrictionNote,
      "Gifts only",
    );
  });

  it("catches B2B", () => {
    assert.equal(classifyService("Emirates B2B DEL").restrictionNote, "B2B only");
  });

  it("catches ecommerce and commercial services", () => {
    assert.equal(
      classifyService("ShipGlobal CA eCommerce Special").restrictionNote,
      "Ecommerce consignments",
    );
    assert.equal(
      classifyService("ShipGlobal Direct Commercial").restrictionNote,
      "Commercial consignments",
    );
  });

  it("is null for an unrestricted service", () => {
    assert.equal(classifyService("Aramex Express").restrictionNote, null);
    assert.equal(classifyService("FEDEX DEL").restrictionNote, null);
  });
});

describe("classification is stable", () => {
  it("gives the same answer for the same label every time", () => {
    // The rules are held as source strings and fresh RegExp instances, never a
    // shared /g/ regex, so no lastIndex state can leak between calls. A
    // classifier whose answer depended on call order would corrupt a backfill
    // in a way that looks like random data loss.
    for (const service of OBSERVED_SERVICES) {
      const first = classifyService(service.name);
      const second = classifyService(service.name);
      assert.deepEqual(first, second, service.name);
    }
  });

  it("ignores surrounding whitespace", () => {
    assert.deepEqual(classifyService("  FEDEX DEL  "), classifyService("FEDEX DEL"));
  });
});
