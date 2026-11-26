import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";

import { domesticCourierLogo } from "@/lib/carrierLogo";

// Service names as the domestic calculator actually lists them.
const EXPECTED: Record<string, string | null> = {
  "Delhivery Air": "Delhivery",
  "Delhivery Heavy MPS.": "Delhivery",
  "Delhivery Surface 5KG": "Delhivery",
  "Delhivery Surface 10kg MPS": "Delhivery",
  "XpressBees 0.5 Kg": "XpressBees",
  "XpressBees LTL B2B": "XpressBees",
  "Amazon ATS 2KG": "Amazon",
  "Aramex Premium - with Pickup": "Aramex",
  "TCI Express 5kg+": "TCI Express",
  "TCI Express LTL B2B": "TCI Express",
  "Shadowfax Flat": "Shadowfax",
  "Ekart SPCL 1 KG": "Ekart",
  "Ekart Flat Price": "Ekart",
  "Movin B2B LTL Air": "MOVIN",
  "Indiapost SpeedPost": "India Post",
  "IndiaPost Business Parcel": "India Post",
  "GATI B2B LTL": "Gati",
  "Fedex Non-Documents.": "FedEx",
  "DHL Non-Documents.": "DHL",
  "UPS Non-Documents (O)": "UPS",
  "UPS (Special) - Documents": "UPS",
  "DTDC B2B LTL": "DTDC",
  "DP World B2B LTL": "DP World",
  // Shipmozo own-brand services never carry a logo.
  "Shipmozo Sky Saver - I": null,
  "Shipmozo Sky Saver - II": null,
  "Shipmozo Sky Ecom - Duty Paid": null,
  "Shipmozo Self Canda YYZ": null,
  "Shipmozo Ecom USA - Duty Paid": null,
  "Shipmozo Self USA - Duty Paid": null,
};

test("each domestic service gets its courier's logo, Shipmozo rows none", () => {
  for (const [name, alt] of Object.entries(EXPECTED)) {
    assert.equal(domesticCourierLogo(name)?.alt ?? null, alt, name);
  }
});

test("every domestic logo file exists in /public", () => {
  for (const name of Object.keys(EXPECTED)) {
    const logo = domesticCourierLogo(name);
    if (!logo) continue;
    assert.ok(existsSync(path.join(process.cwd(), "public", logo.src)), logo.src);
  }
});
