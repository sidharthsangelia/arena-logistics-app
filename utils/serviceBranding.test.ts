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

import { brandServiceName, displayServiceName } from "@/lib/branding/serviceName";
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
  it("leaves big-4 carriers alone, including on ShipGlobal-sourced rows", () => {
    const untouched = [
      "UPS Promotional",
      "Fedex",
      "FedEx International Priority",
      "DHL Express Worldwide",
      "Aramex Priority",
      "ShipGlobal UPS",
    ];
    for (const name of untouched) {
      assert.equal(brandServiceName(name), name, name);
    }
  });

  it("leaves third parties a vendor resells alone", () => {
    // No white-label permission over these — rebranding them would be a lie
    // about who is carrying the parcel.
    for (const name of ["Xpressbees International", "sKartedge", "Delhivery Air 0.5 Kg"]) {
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
