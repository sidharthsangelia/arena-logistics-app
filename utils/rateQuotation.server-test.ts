/**
 * utils/rateQuotation.server-test.ts
 *
 * The quotation workbook is the one artefact in this system that leaves the
 * building. It is built unattended from a spec somebody filled in on a form,
 * and by the time anyone notices a mistake it is in a customer's inbox.
 *
 * ── THE TEST THAT MATTERS MOST ──────────────────────────────────────────────
 * "a customer workbook names no sourcing vendor". Every other failure here is
 * embarrassing; that one hands a customer our supplier list and our buying
 * price. It works by unzipping the generated file and searching the raw XML,
 * rather than by asking the builder what it put in, because the point is to
 * catch a leak through a path nobody thought about.
 *
 * ── WHY A SEPARATE RUNNER ───────────────────────────────────────────────────
 * The workbook modules are marked "server-only", which throws under plain Node.
 * This file runs under --conditions=react-server, where that package resolves
 * to a no-op, exactly as it does in a Next server component. That condition
 * also switches React to its server build, which breaks the React rendering
 * tests, so it cannot go on the main test script:
 *
 *   npm run test:server     (or npm run test:all for both)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gunzipSync, inflateRawSync } from "node:zlib";

import ExcelJS from "exceljs";

import { buildQuotationWorkbook } from "@/lib/rateSweep/excel/workbook";
import {
  defaultQuotationSpec,
  quotationFilename,
  quotationSpecSchema,
  type QuotationSpec,
} from "@/lib/rateSweep/excel/spec";
import {
  CUSTOMER_OWN_BRAND_CARRIER,
  CUSTOMER_OWN_BRAND_LABEL,
  laneKey,
  optionKey,
  type PricedOption,
  type QuotationData,
} from "@/lib/rateSweep/excel/data";
import { INTERNAL_STAMP, allTermsSections } from "@/lib/rateSweep/excel/terms";
import { INTERNATIONAL_VOLUMETRIC_DIVISOR } from "@/lib/pricing/chargeableWeight";
import { SWEEP_ORIGIN } from "@/lib/rateSweep/config";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COUNTRIES = [
  { code: "US", name: "United States", city: "Washington", syntheticPostcode: false },
  { code: "GB", name: "United Kingdom", city: "London", syntheticPostcode: false },
  { code: "AE", name: "United Arab Emirates", city: "Abu Dhabi", syntheticPostcode: true },
];

const WEIGHTS = [0.5, 1, 2, 5];

/** Vendor ids that must never appear in a customer file. */
const VENDOR_IDS = ["shipmozo", "skart", "shipglobal"];

function option(overrides: Partial<PricedOption> & Pick<PricedOption, "carrier" | "countryCode" | "weightKg">): PricedOption {
  return {
    carrierName: overrides.carrier,
    serviceName: `${overrides.carrier} Express`,
    vendorId: null,
    price: 1000,
    tatDays: 4,
    dutyPaid: true,
    pickupIncluded: null,
    ...overrides,
  } as PricedOption;
}

/**
 * A data set shaped like a real one: four carriers, one of which is our own
 * collapsed network, with a couple of deliberate holes so the "no rate" path is
 * exercised rather than assumed.
 */
function makeData(spec: QuotationSpec): QuotationData {
  const carriers =
    spec.audience === "CUSTOMER"
      ? ["DHL", "FEDEX", "UPS", CUSTOMER_OWN_BRAND_CARRIER]
      : ["DHL", "FEDEX", "UPS", "SHIPGLOBAL", "SHIPMOZO"];

  const best = new Map<string, PricedOption>();
  const cheapest = new Map<string, PricedOption>();

  carriers.forEach((carrier, carrierIndex) => {
    COUNTRIES.forEach((country, countryIndex) => {
      WEIGHTS.forEach((weight, weightIndex) => {
        // One deliberate hole, so a missing rate is rendered at least once.
        if (carrier === "UPS" && country.code === "AE") return;

        const priced = option({
          carrier,
          carrierName:
            carrier === CUSTOMER_OWN_BRAND_CARRIER ? CUSTOMER_OWN_BRAND_LABEL : carrier,
          countryCode: country.code,
          weightKg: weight,
          price: 800 + carrierIndex * 250 + countryIndex * 90 + weightIndex * 400,
          // Internal files carry the sourcing vendor; customer files must not.
          vendorId: spec.audience === "INTERNAL" ? VENDOR_IDS[carrierIndex % VENDOR_IDS.length] : null,
          serviceName:
            spec.audience === "INTERNAL"
              ? `${carrier} DEL via ${VENDOR_IDS[carrierIndex % VENDOR_IDS.length]}`
              : `${carrier} Express`,
        });

        best.set(optionKey(carrier, country.code, weight), priced);

        const lane = laneKey(country.code, weight);
        const existing = cheapest.get(lane);
        if (!existing || priced.price < existing.price) cheapest.set(lane, priced);
      });
    });
  });

  return {
    runId: "run_test",
    capturedAt: new Date("2026-08-14T19:18:07.000Z"),
    stale: false,
    ageDays: 1,
    countries: COUNTRIES,
    weights: WEIGHTS,
    carriers,
    best,
    cheapest,
    excluded: { nonInr: 0, dutyUnpaid: 3, restricted: 5 },
  };
}

function customerSpec(overrides: Partial<QuotationSpec> = {}): QuotationSpec {
  return quotationSpecSchema.parse({
    ...defaultQuotationSpec(),
    countryCodes: COUNTRIES.map((c) => c.code),
    weightsKg: WEIGHTS,
    preparedFor: "Acme Exports",
    ...overrides,
  });
}

function internalSpec(overrides: Partial<QuotationSpec> = {}): QuotationSpec {
  return customerSpec({ audience: "INTERNAL", markupPercent: 0, ...overrides });
}

async function open(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

/**
 * Every scrap of text in the file, including parts ExcelJS would not surface.
 *
 * An .xlsx is a zip of XML, and this reads it through the CENTRAL DIRECTORY
 * rather than by walking local file headers. That distinction cost a debugging
 * session and is worth the paragraph: when a writer streams entries it does not
 * know their compressed size in advance, so it writes zero in the local header
 * and appends the real size in a trailing data descriptor. A reader that trusts
 * the local header therefore stops after the first entry. It still returns a
 * few kilobytes of plausible XML, so the vendor-leak test below went on passing
 * while reading almost none of the file — a green test that checked nothing.
 * The central directory always carries accurate sizes.
 *
 * Deliberately not ExcelJS: the leak test must not depend on the same reader
 * the writer was built against.
 */
/**
 * The row number of a grid's header, found by its column A label.
 *
 * Every rate sheet has a heading block of logo, title and subtitle above the
 * grid, and that block has already changed height once. Pinning assertions to
 * an absolute row number made a layout change look like a pricing regression,
 * which is the opposite of what these tests are for.
 */
function findHeaderRow(sheet: ExcelJS.Worksheet, label: string): number {
  for (let row = 1; row <= 20; row += 1) {
    if (sheet.getCell(row, 1).value === label) return row;
  }
  throw new Error(`no header row with "${label}" in column A on "${sheet.name}"`);
}

function rawXmlText(buffer: Buffer): string {
  // End of central directory record, found by scanning back for its signature.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file: no end-of-central-directory record");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);

  const parts: string[] = [];

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);

    // The local header's own name/extra lengths can differ from the central
    // directory's, so they are re-read here rather than reused.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    try {
      if (method === 0) parts.push(data.toString("utf8"));
      else if (method === 8) parts.push(inflateRawSync(data).toString("utf8"));
      else if (method === 9) parts.push(gunzipSync(data).toString("utf8"));
    } catch {
      // A binary entry (the PNGs) that will not inflate as text. Not our concern.
    }

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// The leak tests
// ---------------------------------------------------------------------------

describe("a customer workbook never leaks the sourcing vendor", () => {
  it("names no vendor anywhere in the file, including sheet names and metadata", async () => {
    const spec = customerSpec();
    const buffer = await buildQuotationWorkbook(spec, makeData(spec));
    const text = rawXmlText(buffer).toLowerCase();

    assert.ok(text.length > 1000, "could not read the workbook back as XML");

    for (const vendor of VENDOR_IDS) {
      assert.ok(
        !text.includes(vendor),
        `customer workbook contains the vendor name "${vendor}"`,
      );
    }
  });

  it("shows one Arena Economy sheet, not two vendor networks", async () => {
    const spec = customerSpec();
    const workbook = await open(await buildQuotationWorkbook(spec, makeData(spec)));

    const names = workbook.worksheets.map((sheet) => sheet.name);
    const arenaSheets = names.filter((name) => name === CUSTOMER_OWN_BRAND_LABEL);

    // Two would mean the collapse in data.ts stopped working, and would also
    // have thrown on the duplicate name before it got here.
    assert.equal(arenaSheets.length, 1, `sheets: ${names.join(", ")}`);
  });

  it("carries no internal stamp", async () => {
    const spec = customerSpec();
    const text = rawXmlText(await buildQuotationWorkbook(spec, makeData(spec)));

    assert.ok(!text.includes("INTERNAL"), "customer file carries an internal marking");
  });
});

describe("an internal workbook is unmistakably internal", () => {
  it("stamps every sheet", async () => {
    const spec = internalSpec();
    const workbook = await open(await buildQuotationWorkbook(spec, makeData(spec)));

    for (const sheet of workbook.worksheets) {
      let found = false;

      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (typeof cell.value === "string" && cell.value.includes(INTERNAL_STAMP)) {
            found = true;
          }
        });
      });

      assert.ok(found, `sheet "${sheet.name}" has no internal stamp`);
    }
  });

  it("names the sourcing vendor, which is the entire point of the variant", async () => {
    const spec = internalSpec();
    const text = rawXmlText(await buildQuotationWorkbook(spec, makeData(spec))).toLowerCase();

    assert.ok(
      VENDOR_IDS.some((vendor) => text.includes(vendor)),
      "internal file names no vendor",
    );
  });

  it("puts INTERNAL in the filename", () => {
    assert.ok(quotationFilename(internalSpec()).includes("INTERNAL"));
    assert.ok(!quotationFilename(customerSpec()).includes("INTERNAL"));
  });
});

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe("workbook structure", () => {
  it("gives every carrier its own sheet in the by-service layout", async () => {
    const spec = customerSpec({ layout: "BY_SERVICE" });
    const data = makeData(spec);
    const workbook = await open(await buildQuotationWorkbook(spec, data));

    const names = workbook.worksheets.map((s) => s.name);

    assert.deepEqual(names.slice(0, 2), ["Cover", "Summary"]);
    assert.equal(names.at(-1), "Terms & Conditions");
    assert.equal(names.length, 3 + data.carriers.length);
  });

  it("collapses to three sheets in the cheapest layout", async () => {
    const spec = customerSpec({ layout: "CHEAPEST" });
    const workbook = await open(await buildQuotationWorkbook(spec, makeData(spec)));

    assert.deepEqual(
      workbook.worksheets.map((s) => s.name),
      ["Cover", "Best rates", "Terms & Conditions"],
    );
  });

  it("orders carrier sheets by recognition, not alphabetically", async () => {
    const spec = customerSpec();
    const workbook = await open(await buildQuotationWorkbook(spec, makeData(spec)));

    const names = workbook.worksheets.map((s) => s.name);

    // A customer scanning the tab bar looks for the carrier they already use.
    assert.ok(names.indexOf("DHL") < names.indexOf(CUSTOMER_OWN_BRAND_LABEL));
    assert.ok(names.indexOf("FedEx") < names.indexOf(CUSTOMER_OWN_BRAND_LABEL));
  });

  it("keeps every logo out of the frozen first column", async () => {
    const spec = internalSpec();
    const workbook = await open(await buildQuotationWorkbook(spec, makeData(spec)));

    for (const sheet of workbook.worksheets) {
      const frozen = sheet.views.some(
        (view) => view.state === "frozen" && (view.xSplit ?? 0) > 0,
      );
      if (!frozen) continue;

      for (const image of sheet.getImages()) {
        // Excel clips a floating image at a frozen pane boundary. Anchored in
        // column A, a logo wider than the weight column was cut in half at the
        // freeze line, which is how carrier marks went missing on the page.
        assert.ok(
          image.range.tl.nativeCol >= 1,
          `logo anchored in column A on "${sheet.name}" will be clipped at the freeze`,
        );
      }
    }
  });

  it("writes nothing but weights into column A of a rate sheet", async () => {
    const spec = internalSpec();
    const workbook = await open(await buildQuotationWorkbook(spec, makeData(spec)));

    for (const sheet of workbook.worksheets) {
      if (sheet.name === "Cover" || sheet.name === "Terms & Conditions") continue;

      sheet.eachRow((row, rowNumber) => {
        const value = row.getCell(1).value;
        if (value === null || value === undefined || value === "") return;

        // The header label and the numbers under it. Anything else here is a
        // heading, a footnote or a section label that has drifted back into the
        // column, where it is either clipped or overflowing into the grid.
        assert.ok(
          value === "Weight" || typeof value === "number",
          `"${sheet.name}" row ${rowNumber} column A holds ${JSON.stringify(value)}`,
        );
      });
    }
  });

  it("embeds each logo once, however many sheets use it", async () => {
    const spec = customerSpec();
    const workbook = await open(await buildQuotationWorkbook(spec, makeData(spec)));

    // The Arena mark appears on the cover, the summary and the terms sheet, and
    // an own-brand carrier sheet. Registering it per sheet tripled the file.
    const media = workbook.model.media ?? [];
    const names = workbook.worksheets.map((s) => s.name);

    assert.ok(
      media.length <= names.length,
      `${media.length} images embedded across ${names.length} sheets`,
    );
  });

  it("stays small enough to email", async () => {
    const spec = customerSpec();
    const buffer = await buildQuotationWorkbook(spec, makeData(spec));

    assert.ok(
      buffer.byteLength < 500_000,
      `workbook is ${(buffer.byteLength / 1024).toFixed(0)}KB`,
    );
  });
});

describe("prices on the page", () => {
  it("writes prices as numbers with a currency format, not as text", async () => {
    const spec = customerSpec();
    const workbook = await open(await buildQuotationWorkbook(spec, makeData(spec)));

    const sheet = workbook.getWorksheet("DHL");
    assert.ok(sheet);

    const cell = sheet.getCell(findHeaderRow(sheet, "Weight") + 1, 2);

    assert.equal(typeof cell.value, "number", "price written as text, not a number");
    assert.ok(cell.numFmt?.includes("₹"), `numFmt was "${cell.numFmt}"`);
  });

  it("leaves a dash, never a zero, where there is no rate", async () => {
    const spec = customerSpec();
    const workbook = await open(await buildQuotationWorkbook(spec, makeData(spec)));

    // UPS has no AE rate in the fixture. AE is the third country, so column 4.
    const ups = workbook.getWorksheet("UPS");
    assert.ok(ups);
    const cell = ups.getCell(findHeaderRow(ups, "Weight") + 1, 4);

    // A zero in a price grid reads as free. This must never be 0.
    assert.notEqual(cell?.value, 0);
    assert.equal(cell?.value, "—");
  });

  it("names the carrier beside every price on the summary", async () => {
    const spec = customerSpec({ layout: "CHEAPEST" });
    const workbook = await open(await buildQuotationWorkbook(spec, makeData(spec)));

    const sheet = workbook.getWorksheet("Best rates");
    assert.ok(sheet);

    // Found rather than hardcoded: the heading block above the grid has moved
    // once already, and a test that pins the grid to row 7 fails on a layout
    // change instead of on the thing it is actually asserting.
    const headerRow = findHeaderRow(sheet, "Weight");

    // Country bands are two columns wide: price, then carrier.
    const price = sheet.getCell(headerRow + 1, 2);
    const carrier = sheet.getCell(headerRow + 1, 3);

    assert.equal(typeof price.value, "number");
    assert.ok(
      typeof carrier.value === "string" && carrier.value.length > 0,
      "a price with no carrier beside it is the ambiguity this system removes",
    );
  });
});

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

describe("terms and disclaimers", () => {
  it("puts the four charges people argue about in writing", async () => {
    const spec = customerSpec();
    const text = rawXmlText(await buildQuotationWorkbook(spec, makeData(spec)));

    // Each of these maps to a real dispute: a reweigh, a customs bill at the
    // door, a surcharge nobody mentioned, and a missed deadline.
    for (const phrase of ["volumetric", "reweigh", "duties", "surcharge", "not guaranteed"]) {
      assert.ok(
        text.toLowerCase().includes(phrase),
        `the workbook never mentions "${phrase}"`,
      );
    }
  });

  it("states the validity date the spec asked for", async () => {
    const spec = customerSpec({ validityDays: 30 });
    const text = rawXmlText(await buildQuotationWorkbook(spec, makeData(spec)));

    // Captured 2026-08-14T19:18Z, which is 15 August in IST. Plus 30 days is
    // 14 September. Hard-coded rather than computed so this also pins the
    // timezone: without the explicit Asia/Kolkata in formatDate, a UTC server
    // renders the previous day and this assertion is what catches it.
    assert.ok(text.includes("14 September 2026"), "validity date is not on the cover");
  });

  it("never states an amount or a threshold in a clause", () => {
    const sections = allTermsSections({
      capturedOn: "14 August 2026",
      validUntil: "29 August 2026",
      markupApplied: true,
    });

    // The terms say which charges exist and who bears them, never what they
    // cost. Every figure in a surcharge belongs to a carrier contract that gets
    // renegotiated, and a stale number on a customer document is worse than no
    // number: it is the number they will hold us to. The volumetric divisor is
    // the one permitted figure, because it is a formula the reader has to be
    // able to apply themselves.
    const permitted = new Set([
      String(INTERNATIONAL_VOLUMETRIC_DIVISOR),
      SWEEP_ORIGIN.pincode,
    ]);

    for (const section of sections) {
      for (const clause of section.clauses) {
        // The date fields come from the context and are legitimately numeric.
        const withoutDates = clause.replaceAll(/\d+ [A-Z][a-z]+ \d{4}/g, "");
        // Trailing punctuation is excluded from the match, so "÷ 5000." reads
        // as the divisor rather than as an unknown figure.
        for (const [figure] of withoutDates.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
          assert.ok(
            permitted.has(figure),
            `"${figure}" in ${section.heading}: terms must not carry amounts, weights or thresholds`,
          );
        }
        // No separate currency assertion: naming INR as the currency of the
        // quote is correct, and an amount in any currency is a digit, which the
        // check above already refuses.
      }
    }
  });

  it("keeps every clause non-empty", () => {
    const sections = allTermsSections({
      capturedOn: "14 August 2026",
      validUntil: "29 August 2026",
      markupApplied: true,
    });

    assert.ok(sections.length >= 6);

    for (const section of sections) {
      assert.ok(section.clauses.length > 0, `${section.heading} has no clauses`);
      for (const clause of section.clauses) {
        assert.ok(clause.trim().length > 20, `short clause in ${section.heading}`);
      }
    }
  });

  it("flags the sections a person still has to sign off", () => {
    const sections = allTermsSections({
      capturedOn: "14 August 2026",
      validUntil: "29 August 2026",
      markupApplied: true,
    });

    // Payment, cancellation and liability are business positions, not facts
    // about the data. The flag is what stops them being assumed to be agreed.
    assert.ok(sections.some((section) => section.needsBusinessReview));
  });
});

// ---------------------------------------------------------------------------
// The spec guard
// ---------------------------------------------------------------------------

describe("spec validation", () => {
  it("refuses a customer file at zero markup", () => {
    const result = quotationSpecSchema.safeParse({
      ...defaultQuotationSpec(),
      audience: "CUSTOMER",
      markupPercent: 0,
    });

    // The easiest possible mistake: leave a field alone and email the cost book.
    assert.equal(result.success, false);
  });

  it("allows an internal file at zero markup", () => {
    const result = quotationSpecSchema.safeParse({
      ...defaultQuotationSpec(),
      audience: "INTERNAL",
      markupPercent: 0,
    });

    assert.equal(result.success, true);
  });

  it("refuses a country the sweep does not cover", () => {
    const result = quotationSpecSchema.safeParse({
      ...defaultQuotationSpec(),
      countryCodes: ["ZZ"],
    });

    assert.equal(result.success, false);
  });

  it("refuses a weight that was never swept", () => {
    const result = quotationSpecSchema.safeParse({
      ...defaultQuotationSpec(),
      // 7.5kg is between two slabs. Filling that row would mean interpolating a
      // price, and an interpolated price is one we cannot actually buy.
      weightsKg: [7.5],
    });

    assert.equal(result.success, false);
  });

  it("builds a filename that cannot be confused with the other variant", () => {
    const customer = quotationFilename(customerSpec(), new Date("2026-08-15T00:00:00Z"));
    const internal = quotationFilename(internalSpec(), new Date("2026-08-15T00:00:00Z"));

    assert.ok(customer.endsWith(".xlsx"));
    assert.ok(customer.includes("acme-exports"));
    assert.notEqual(customer, internal);
  });
});
