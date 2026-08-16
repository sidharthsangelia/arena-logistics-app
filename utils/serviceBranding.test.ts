/**
 * utils/serviceBranding.test.ts
 *
 * White-labelling is the one place where a regression is a commercial leak
 * rather than a bug: if a vendor's brand token survives to a customer surface,
 * the customer can go buy direct. carrierBranding.md D16 asks for these to be
 * pinned, so they are.
 *
 * Two failure directions are covered, because they are equally bad:
 *   - Under-masking: "ShipGlobal Direct" reaching a customer verbatim.
 *   - Over-masking: rebranding a carrier or a third party we have no
 *     permission over ("UPS Promotional", "Xpressbees International"), which
 *     would misdescribe who is carrying the parcel.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  brandServiceName,
  containsVendorBrand,
  displayServiceName,
} from "@/lib/branding/serviceName";
import { ARENA_LOGO, carrierLogo } from "@/lib/carrierLogo";

describe("brandServiceName — ShipGlobal (D17)", () => {
  it("swaps only the brand token and keeps the tier word verbatim", () => {
    const cases: [string, string][] = [
      ["ShipGlobal Direct", "Arena Direct"],
      ["ShipGlobal First Class", "Arena First Class"],
      ["ShipGlobal Premium", "Arena Premium"],
      ["ShipGlobal Economy DEL", "Arena Economy DEL"],
    ];
    for (const [raw, expected] of cases) {
      assert.equal(brandServiceName(raw), expected, raw);
    }
  });

  it("matches the spaced and lowercased spellings too", () => {
    assert.equal(brandServiceName("Ship Global Direct"), "Arena Direct");
    assert.equal(brandServiceName("shipglobal direct"), "Arena direct");
    assert.equal(brandServiceName("SHIPGLOBAL DIRECT"), "Arena DIRECT");
  });

  it("leaves no trace of the vendor name in any rebranded output", () => {
    const out = brandServiceName("ShipGlobal Direct");
    assert.ok(!/ship\s?global/i.test(out), out);
  });
});

describe("brandServiceName — Shipmozo (D7)", () => {
  it("keeps behaving as before", () => {
    assert.equal(brandServiceName("Shipmozo Drift"), "Arena Drift");
    assert.equal(brandServiceName("Shipmozo Xpress"), "Arena Xpress");
  });
});

describe("brandServiceName — what must NOT be rebranded", () => {
  it("leaves big-4 carriers alone", () => {
    const untouched = [
      "UPS Promotional",
      "Fedex",
      "FedEx International Priority",
      "DHL Express Worldwide",
      "Aramex Priority",
    ];
    for (const name of untouched) {
      assert.equal(brandServiceName(name), name, name);
    }
  });

  it("keeps the carrier but still drops the reseller that sold it", () => {
    // This used to assert "ShipGlobal UPS" came through verbatim. The big-4
    // early return was doing two jobs — "never rename this carrier" and, by
    // accident, "skip masking entirely" — so any vendor brand sharing a label
    // with a real carrier reached the customer. Only the first job was intended.
    assert.equal(brandServiceName("ShipGlobal UPS"), "UPS");
  });

  it("leaves third parties a vendor resells alone", () => {
    // No white-label permission over these — rebranding them would be a lie
    // about who is carrying the parcel. Note these are third-party COURIERS,
    // not the vendors we buy from: they carry no sourcing-vendor token, so
    // there is nothing to redact and nothing we are allowed to rename.
    for (const name of ["Xpressbees International", "Delhivery Air 0.5 Kg"]) {
      assert.equal(brandServiceName(name), name, name);
    }
  });

  it("handles empty and missing names without throwing", () => {
    assert.equal(brandServiceName(null), "");
    assert.equal(brandServiceName(undefined), "");
    assert.equal(brandServiceName("   "), "");
  });
});

describe("displayServiceName — viewer split (D11)", () => {
  it("gives Arena staff the raw sourcing name", () => {
    assert.equal(displayServiceName("ShipGlobal Direct", true), "ShipGlobal Direct");
  });

  it("gives every customer the masked name", () => {
    assert.equal(displayServiceName("ShipGlobal Direct", false), "Arena Direct");
  });
});

describe("post-booking surfaces — the strings they actually feed in", () => {
  /**
   * Quoting was already masked; everything AFTER the customer pays used to
   * print the raw name, because Shipment.selectedProductName stores the vendor
   * string verbatim as the sourcing record (D12) and the read-time swap was
   * only wired into the rate and quote screens.
   *
   * The shipment detail page, the shipments table, the tax invoice, the
   * tracking page and the milestone emails now all route through here, and they
   * feed in shapes the quote path never did — a bare vendor name with no
   * service word after it, and real carrier names that must survive untouched.
   */

  it("masks a bare vendor name, which is what the tracking legs fall back to", () => {
    // TrackingLegPlan.carrier falls back to selectedVendorName /
    // firstMileVendorName when no airline is recorded, so these arrive alone.
    assert.equal(brandServiceName("ShipGlobal"), "Arena");
    assert.equal(brandServiceName("Shipmozo"), "Arena");
  });

  it("passes a real carrier through, so tracking keeps naming who is flying it", () => {
    // shipmentResolve prefers carrierAirline / domesticCourierName; masking one
    // of these would tell the customer Arena is the airline.
    for (const name of ["Emirates SkyCargo", "Delhivery", "Blue Dart", "DHL"]) {
      assert.equal(brandServiceName(name), name, name);
    }
  });

  it("gives the invoice and the quote the same words for the same shipment", () => {
    // The buyer holds both documents. A quote saying "Arena Direct" against an
    // invoice saying "ShipGlobal Direct" is the leak AND a discrepancy.
    const raw = "ShipGlobal Direct";
    assert.equal(displayServiceName(raw, false), brandServiceName(raw));
  });

  it("never lets a vendor token through on any post-booking string", () => {
    const stored = [
      "ShipGlobal Direct",
      "ShipGlobal First Class",
      "Ship Global Premium",
      "ShipGlobal",
      "Shipmozo Drift",
      "Shipmozo",
    ];
    for (const raw of stored) {
      const out = brandServiceName(raw);
      assert.ok(!/ship\s?global|shipmozo/i.test(out), `${raw} -> ${out}`);
    }
  });
});

describe("no sourcing vendor survives a customer-facing name (H3)", () => {
  /**
   * carrierBranding.md §11 asks for "a snapshot assertion that no customer-
   * facing payload contains any of shipmozo, skart, sKart Express or Shipmozo".
   * This is that assertion, written as an invariant over inputs rather than a
   * fixed list of outputs — a table of expected strings only catches the leaks
   * someone already thought of.
   *
   * It supersedes carrierBranding.md 12.2, which accepted "sKartedge" reaching
   * customers because we hold no white-label permission from sKart. Permission
   * governs whether we may put OUR name on their service; it was never a reason
   * to print THEIRS. The unlicensed path now strips the token instead.
   */

  /** Every raw label the four live vendors have actually returned, plus the
   *  shapes that only appear after booking and the ones designed to break it. */
  const RAW_LABELS: readonly string[] = [
    // Own-brand, white-label permission held.
    "Shipmozo Sky Saver - Duty Paid",
    "Shipmozo Sky Ecom - Duty Paid",
    "Shipmozo Self USA - Duty Paid",
    "ShipGlobal Direct",
    "Shipglobal Direct",
    "ShipGlobal CA eCommerce Special",
    "Ship Global Premium",
    // Own-brand, no permission. These are the H3 case.
    "sKartedge",
    "sKart Express",
    "sKart Self International",
    "skart self international",
    "SKART SELF INTERNATIONAL",
    "SpeedoPost Surface",
    // A vendor brand wrapped around a real carrier — the case the big-4 early
    // return used to wave straight through.
    "Shipmozo DHL Express",
    "sKart Aramex Exp DEL",
    "ShipGlobal Premium UPS Ground",
    // Bare vendor names, which is what the tracking legs fall back to.
    "Shipmozo",
    "ShipGlobal",
    "sKart",
    // Real carriers and third parties, which must come through intact.
    "FEDEX DEL",
    "DHL DEL DDU ( Gifts Only )",
    "UPS Promotional",
    "Aramex Exp DEL",
    "Emirates B2B DEL",
    "Xpressbees International",
    "Blue Dart Freight",
  ];

  it("strips every vendor token from every observed label", () => {
    const leaked = RAW_LABELS.map((raw) => [raw, brandServiceName(raw)] as const).filter(
      ([, out]) => containsVendorBrand(out),
    );

    assert.deepEqual(
      leaked.map(([raw, out]) => `${raw} -> ${out}`),
      [],
      "a sourcing vendor's brand reached a customer-facing service name",
    );
  });

  it("never returns an empty name, so no surface renders a blank service", () => {
    for (const raw of RAW_LABELS) {
      assert.ok(brandServiceName(raw).length > 0, raw);
    }
  });

  it("strips the unlicensed brand instead of claiming the service as Arena (D9)", () => {
    // Closing the leak must not quietly grant ourselves white-label rights we
    // do not hold. The token goes; the descriptive rest of the label stays.
    assert.equal(brandServiceName("sKart Self International"), "Self International");
    assert.equal(brandServiceName("SpeedoPost Surface"), "Surface");
  });

  it("falls back to a neutral label when the brand WAS the whole name", () => {
    // "sKartedge" is nothing but the vendor. There is no descriptive remainder
    // to keep, and inventing a speed or duty claim here would be a lie.
    const out = brandServiceName("sKartedge");
    assert.equal(out, "Courier service");
    assert.ok(!containsVendorBrand(out));
  });

  it("keeps the carrier and drops the reseller when a label names both", () => {
    // Not "Arena DHL Express": the parcel moves on DHL and rule 1 says the
    // carrier name survives, so the reseller's brand is removed, not swapped.
    assert.equal(brandServiceName("Shipmozo DHL Express"), "DHL Express");
    assert.equal(brandServiceName("sKart Aramex Exp DEL"), "Aramex Exp DEL");
    assert.equal(brandServiceName("ShipGlobal Premium UPS Ground"), "Premium UPS Ground");
  });

  it("still shows Arena staff the raw name, leaks and all (D11)", () => {
    // The masking is a customer boundary, not redaction for its own sake — ops
    // need to know who they bought from.
    for (const raw of RAW_LABELS) {
      assert.equal(displayServiceName(raw, true), raw, raw);
    }
  });

  it("leaves labels that name no vendor completely untouched", () => {
    for (const raw of ["FEDEX DEL", "UPS Promotional", "Xpressbees International", "Blue Dart Freight"]) {
      assert.equal(brandServiceName(raw), raw, raw);
    }
  });
});

describe("containsVendorBrand — the guard's own list", () => {
  it("recognises every spelling the vendors and our own vendor ids use", () => {
    for (const text of [
      "Shipmozo",
      "shipmozo",
      "ShipGlobal",
      "Ship Global",
      "shipglobal",
      "sKart",
      "skart",
      "sKartedge",
      "sKart Express",
      "SpeedoPost",
      "speedopost",
    ]) {
      assert.ok(containsVendorBrand(text), text);
    }
  });

  it("does not fire on carriers or third parties", () => {
    for (const text of [
      "DHL Express",
      "Aramex Exp DEL",
      "Xpressbees International",
      "Blue Dart Freight",
      "Arena Direct",
      "Courier service",
    ]) {
      assert.ok(!containsVendorBrand(text), text);
    }
  });

  it("handles empty and missing input", () => {
    assert.equal(containsVendorBrand(null), false);
    assert.equal(containsVendorBrand(undefined), false);
    assert.equal(containsVendorBrand(""), false);
  });
});

describe("carrierLogo follows the displayed name", () => {
  it("shows the Arena logo once the name is white-labelled", () => {
    const customerName = displayServiceName("ShipGlobal Direct", false);
    assert.equal(carrierLogo(customerName).src, ARENA_LOGO.src);
  });

  it("still shows the vendor logo to Arena staff, who see the raw name", () => {
    const staffName = displayServiceName("ShipGlobal Direct", true);
    assert.equal(carrierLogo(staffName).alt, "ShipGlobal");
  });

  it("keeps the carrier logo on a ShipGlobal-sourced big-4 row", () => {
    assert.equal(carrierLogo(displayServiceName("ShipGlobal UPS", false)).alt, "UPS");
  });
});
