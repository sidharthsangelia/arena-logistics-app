/**
 * lib/rateSweep/excel/workbook.ts
 *
 * Builds the quotation workbook. Layout only: every price arriving here is
 * already marked up and every name already masked (./data.ts). This file must
 * never make a pricing or a disclosure decision.
 *
 * ── THE SHAPE, AND WHY ──────────────────────────────────────────────────────
 *   Cover                what this is, who it is for, how long it holds good,
 *                        and the four warnings that must travel with any page
 *   Summary / Best rate  the cheapest option per lane and weight, with the
 *                        carrier NAMED beside every number
 *   One sheet per carrier (BY_SERVICE only), because customers choose by
 *                        carrier: some will only ship DHL, some only FedEx
 *   Terms & Conditions   the full set
 *
 * ── AN UNATTRIBUTED PRICE IS A BUG ──────────────────────────────────────────
 * No number in this workbook appears without the carrier it belongs to. A cell
 * reading "1,500" with nothing beside it is the exact ambiguity this whole
 * system was built to remove: the customer is buying a carrier, not a number.
 *
 * ── PRINTING IS A FIRST-CLASS CASE ──────────────────────────────────────────
 * These get printed and PDF'd more than they get scrolled. Every sheet sets
 * page setup, repeat rows, and a footer, and every rate sheet carries the short
 * footnotes, because somebody will print one tab and never open the terms.
 */

import "server-only";

import ExcelJS from "exceljs";

import {
  ALIGN,
  NUMBER_FORMAT,
  PALETTE,
  ROW_HEIGHT,
  cellBorder,
  fill,
  font,
  headerBorder,
} from "./theme";
import { EXCEL_LOGOS } from "./logoData";
import {
  INTERNAL_STAMP,
  SHEET_FOOTNOTES,
  allTermsSections,
  type TermsContext,
} from "./terms";
import { SWEEP_ORIGIN } from "../config";
import { isOwnBrandNetwork } from "../carrier";
import type { QuotationData, PricedOption } from "./data";
import {
  CUSTOMER_OWN_BRAND_CARRIER,
  CUSTOMER_OWN_BRAND_LABEL,
  laneKey,
  optionKey,
} from "./data";
import type { QuotationSpec } from "./spec";

/** Logo key per carrier code. Missing means the Arena mark is used. */
const CARRIER_LOGO_KEY: Record<string, string> = {
  ARAMEX: "aramex",
  DHL: "dhl",
  FEDEX: "fedex",
  UPS: "ups",
};

export async function buildQuotationWorkbook(
  spec: QuotationSpec,
  data: QuotationData,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Arena Cargo Logistics";
  workbook.lastModifiedBy = "Arena Cargo Logistics";
  workbook.created = new Date();
  workbook.company = "Arena Cargo Logistics";
  workbook.title =
    spec.layout === "CHEAPEST" ? "Arena best-rate summary" : "Arena international rate card";

  const context = termsContext(spec, data);

  addCoverSheet(workbook, spec, data, context);
  addSummarySheet(workbook, spec, data);

  if (spec.layout === "BY_SERVICE") {
    const usedSheetNames = new Set(["cover", "summary", "best rates", "terms & conditions"]);
    for (const carrier of data.carriers) {
      addCarrierSheet(workbook, spec, data, carrier, usedSheetNames);
    }
  }

  addTermsSheet(workbook, spec, context);

  // ExcelJS types this as Promise<ExcelJS.Buffer>, which is an ArrayBuffer-like
  // it defines itself. Node's Buffer.from handles it and gives the route a type
  // it can actually return.
  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw as ArrayBuffer);
}

// ---------------------------------------------------------------------------
// Cover
// ---------------------------------------------------------------------------

function addCoverSheet(
  workbook: ExcelJS.Workbook,
  spec: QuotationSpec,
  data: QuotationData,
  context: TermsContext,
): void {
  const sheet = workbook.addWorksheet("Cover", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
  });

  sheet.columns = [
    { width: 3 },
    { width: 26 },
    { width: 30 },
    { width: 26 },
    { width: 24 },
    { width: 3 },
  ];

  // Space for the logo. Set before anything is written into it so the image
  // never lands on top of text.
  sheet.getRow(1).height = 12;
  sheet.getRow(2).height = 56;

  placeImage(workbook, sheet, "arena", { tl: { col: 1, row: 1 }, ext: { width: 168, height: 56 } });

  let row = 4;

  row = writeTitle(
    sheet,
    row,
    spec.layout === "CHEAPEST" ? "Best available rates" : "International rate card",
    `Express and economy air freight from ${SWEEP_ORIGIN.city}, India`,
  );

  row += 1;

  // The internal stamp goes above everything else on the page. A person
  // glancing at a printout must see it before they see a price.
  if (spec.audience === "INTERNAL") {
    sheet.mergeCells(row, 2, row, 5);
    const stamp = sheet.getCell(row, 2);
    stamp.value = INTERNAL_STAMP;
    stamp.font = font.danger;
    stamp.fill = fill(PALETTE.dangerSoft);
    stamp.alignment = ALIGN.centre;
    stamp.border = cellBorder(PALETTE.danger);
    sheet.getRow(row).height = 30;
    row += 2;
  }

  const fields: [string, string][] = [
    ["Prepared for", spec.preparedFor || "—"],
    ["Prepared by", "Arena Cargo Logistics"],
    ["Date of issue", context.capturedOn],
    ["Valid until", context.validUntil],
    ["Origin", `${SWEEP_ORIGIN.city} (PIN ${SWEEP_ORIGIN.pincode}), India`],
    ["Destinations", `${data.countries.length} countries, listed on each rate sheet`],
    [
      "Weight range",
      `${formatWeight(data.weights[0])} to ${formatWeight(data.weights[data.weights.length - 1])}, ${data.weights.length} slabs`,
    ],
    ["Currency", "Indian Rupees (INR), inclusive of GST on freight"],
  ];

  if (spec.audience === "INTERNAL") {
    fields.push(["Sweep run", data.runId]);
    fields.push(["Markup applied", "None. Raw carrier cost."]);
  }

  row = writeFieldTable(sheet, row, fields);
  row += 1;

  row = writeSectionLabel(sheet, row, "What is inside this workbook");

  const contents: [string, string][] = [
    [
      spec.layout === "CHEAPEST" ? "Best rates" : "Summary",
      "The lowest price we can offer on each lane and weight, with the carrier named.",
    ],
  ];

  if (spec.layout === "BY_SERVICE") {
    for (const carrier of data.carriers) {
      contents.push([
        sheetNameFor(carrier, spec),
        `Every ${sheetNameFor(carrier, spec)} rate, by destination and weight.`,
      ]);
    }
  }

  contents.push([
    "Terms & Conditions",
    "How weight is charged, what the price includes, and what it does not.",
  ]);

  row = writeFieldTable(sheet, row, contents);
  row += 1;

  // The four warnings, on the cover, in full. Everything else in the workbook
  // assumes these have been read.
  row = writeSectionLabel(sheet, row, "Please read before quoting from this document");

  for (const note of SHEET_FOOTNOTES) {
    sheet.mergeCells(row, 2, row, 5);
    const cell = sheet.getCell(row, 2);
    cell.value = `•  ${note}`;
    cell.font = font.bodySoft;
    cell.alignment = ALIGN.topLeft;
    cell.fill = fill(PALETTE.warnSoft);
    sheet.getRow(row).height = 30;
    row += 1;
  }

  if (data.stale) {
    row += 1;
    sheet.mergeCells(row, 2, row, 5);
    const cell = sheet.getCell(row, 2);
    cell.value = `These rates were captured ${data.ageDays} days ago and are older than our ${"quotable"} window. Reconfirm every price before sending this document.`;
    cell.font = font.warn;
    cell.fill = fill(PALETTE.warnSoft);
    cell.alignment = ALIGN.left;
    cell.border = cellBorder(PALETTE.warn);
    sheet.getRow(row).height = 28;
  }

  setFooter(sheet, spec);
}

// ---------------------------------------------------------------------------
// Summary / best rates
// ---------------------------------------------------------------------------

/**
 * Weights down the side, countries across the top, and under every country two
 * columns: the price and the carrier that gives it.
 *
 * The carrier column is why this sheet is worth having. A grid of prices alone
 * is what we had before, and it could not answer the only question a customer
 * asks next.
 */
function addSummarySheet(
  workbook: ExcelJS.Workbook,
  spec: QuotationSpec,
  data: QuotationData,
): void {
  const sheet = workbook.addWorksheet(spec.layout === "CHEAPEST" ? "Best rates" : "Summary", {
    views: [{ showGridLines: false, state: "frozen", xSplit: 1, ySplit: 6 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:6",
    },
  });

  const headerRow = 6;

  sheet.getColumn(1).width = 12;
  for (let i = 0; i < data.countries.length; i += 1) {
    sheet.getColumn(2 + i * 2).width = 15;
    sheet.getColumn(3 + i * 2).width = 26;
  }

  writeSheetHeading(
    workbook,
    sheet,
    "arena",
    "Best available rate",
    "The lowest price we can offer on each lane, and the carrier it is with.",
    2 + data.countries.length * 2 - 1,
  );

  // Country band across the top, spanning its two columns.
  data.countries.forEach((country, index) => {
    const left = 2 + index * 2;
    sheet.mergeCells(headerRow - 1, left, headerRow - 1, left + 1);
    const band = sheet.getCell(headerRow - 1, left);
    band.value = `${country.name} (${country.city})`;
    band.font = { ...font.tableHeader, size: 11 };
    band.fill = fill(PALETTE.accent);
    band.alignment = ALIGN.centre;
    band.border = headerBorder();
  });
  sheet.getRow(headerRow - 1).height = 24;

  const weightHeader = sheet.getCell(headerRow - 1, 1);
  weightHeader.value = "";
  weightHeader.fill = fill(PALETTE.accent);
  weightHeader.border = headerBorder();

  writeHeaderCell(sheet, headerRow, 1, "Weight");
  data.countries.forEach((_country, index) => {
    writeHeaderCell(sheet, headerRow, 2 + index * 2, "Rate (INR)");
    writeHeaderCell(sheet, headerRow, 3 + index * 2, "Carrier / service");
  });
  sheet.getRow(headerRow).height = ROW_HEIGHT.tableHeader;

  data.weights.forEach((weight, weightIndex) => {
    const rowNumber = headerRow + 1 + weightIndex;
    const excelRow = sheet.getRow(rowNumber);
    excelRow.height = ROW_HEIGHT.data;

    const banded = weightIndex % 2 === 1;

    const weightCell = sheet.getCell(rowNumber, 1);
    weightCell.value = weight;
    weightCell.numFmt = NUMBER_FORMAT.weight;
    weightCell.font = font.bodyStrong;
    weightCell.alignment = ALIGN.right;
    weightCell.border = cellBorder();
    weightCell.fill = fill(banded ? PALETTE.paperAlt : PALETTE.paper);

    data.countries.forEach((country, countryIndex) => {
      const option = data.cheapest.get(laneKey(country.code, weight));
      const priceCol = 2 + countryIndex * 2;

      writePriceCell(sheet, rowNumber, priceCol, option?.price ?? null, banded, true);
      writeServiceCell(sheet, rowNumber, priceCol + 1, option ?? null, banded, spec);
    });
  });

  writeFootnotes(sheet, headerRow + data.weights.length + 2, 2 + data.countries.length * 2 - 1, spec);
  setFooter(sheet, spec);
}

// ---------------------------------------------------------------------------
// One carrier
// ---------------------------------------------------------------------------

/**
 * Weights down, countries across, one price each. The tab a customer who only
 * ships DHL opens and never leaves.
 *
 * Below the grid sits a service table: which product each price is, how long it
 * takes, and whether pickup is in it. Those belong under the grid rather than
 * inside it because they are constant per country, and repeating them in every
 * cell would triple the width of the sheet to say the same thing thirty times.
 */
function addCarrierSheet(
  workbook: ExcelJS.Workbook,
  spec: QuotationSpec,
  data: QuotationData,
  carrier: string,
  usedSheetNames: Set<string>,
): void {
  const title = sheetNameFor(carrier, spec);

  const sheet = workbook.addWorksheet(safeSheetName(title, usedSheetNames), {
    views: [{ showGridLines: false, state: "frozen", xSplit: 1, ySplit: 6 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:6",
    },
  });

  const headerRow = 6;
  const lastCol = 1 + data.countries.length;

  sheet.getColumn(1).width = 12;
  for (let i = 0; i < data.countries.length; i += 1) {
    sheet.getColumn(2 + i).width = 17;
  }

  writeSheetHeading(
    workbook,
    sheet,
    CARRIER_LOGO_KEY[carrier] ?? "arena",
    title,
    `All ${title} rates from ${SWEEP_ORIGIN.city}, by destination and chargeable weight.`,
    lastCol,
  );

  writeHeaderCell(sheet, headerRow, 1, "Weight");
  data.countries.forEach((country, index) => {
    writeHeaderCell(sheet, headerRow, 2 + index, `${country.name}\n${country.code}`);
  });
  sheet.getRow(headerRow).height = ROW_HEIGHT.tableHeader;

  data.weights.forEach((weight, weightIndex) => {
    const rowNumber = headerRow + 1 + weightIndex;
    sheet.getRow(rowNumber).height = ROW_HEIGHT.data;

    const banded = weightIndex % 2 === 1;

    const weightCell = sheet.getCell(rowNumber, 1);
    weightCell.value = weight;
    weightCell.numFmt = NUMBER_FORMAT.weight;
    weightCell.font = font.bodyStrong;
    weightCell.alignment = ALIGN.right;
    weightCell.border = cellBorder();
    weightCell.fill = fill(banded ? PALETTE.paperAlt : PALETTE.paper);

    data.countries.forEach((country, countryIndex) => {
      const option = data.best.get(optionKey(carrier, country.code, weight));

      // Marked when this carrier is also the cheapest option on the lane. The
      // only "good news" colour in the workbook, so it stays readable.
      const isCheapestOverall =
        option !== undefined &&
        data.cheapest.get(laneKey(country.code, weight))?.carrier === carrier;

      writePriceCell(sheet, rowNumber, 2 + countryIndex, option?.price ?? null, banded, isCheapestOverall);
    });
  });

  let row = headerRow + data.weights.length + 2;

  row = writeSectionLabel(sheet, row, "Service, transit and coverage");

  const serviceHeader = ["Destination", "Service", "Transit", "Pickup", "Available"];
  if (spec.audience === "INTERNAL") serviceHeader.push("Sourced via");

  serviceHeader.forEach((label, index) => {
    writeHeaderCell(sheet, row, 1 + index, label);
  });
  sheet.getRow(row).height = ROW_HEIGHT.tableHeader;
  row += 1;

  data.countries.forEach((country, index) => {
    const options = data.weights
      .map((weight) => data.best.get(optionKey(carrier, country.code, weight)))
      .filter((option): option is PricedOption => Boolean(option));

    const banded = index % 2 === 1;
    const bg = fill(banded ? PALETTE.paperAlt : PALETTE.paper);
    const sample = options[0];

    const cells: (string | number)[] = [
      country.name,
      sample ? sample.serviceName : "Not available",
      sample && sample.tatDays > 0 ? `${sample.tatDays} days` : "On request",
      sample?.pickupIncluded === true
        ? "Included"
        : sample?.pickupIncluded === false
          ? "Not included"
          : "On request",
      options.length > 0
        ? `${formatWeight(options[0].weightKg)} to ${formatWeight(options[options.length - 1].weightKg)}`
        : "—",
    ];

    if (spec.audience === "INTERNAL") {
      cells.push(sample?.vendorId ?? "—");
    }

    cells.forEach((value, cellIndex) => {
      const cell = sheet.getCell(row, 1 + cellIndex);
      cell.value = value;
      cell.font = cellIndex === 0 ? font.bodyStrong : font.bodySoft;
      cell.alignment = ALIGN.left;
      cell.border = cellBorder();
      cell.fill = bg;
    });

    sheet.getRow(row).height = ROW_HEIGHT.data;
    row += 1;
  });

  // Column widths for the service table are wider than the price grid needs, so
  // they are applied after the grid has had its say. The service column is the
  // one that actually holds a long string.
  sheet.getColumn(2).width = Math.max(sheet.getColumn(2).width ?? 17, 30);

  writeFootnotes(sheet, row + 1, lastCol, spec);
  setFooter(sheet, spec);
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

function addTermsSheet(
  workbook: ExcelJS.Workbook,
  spec: QuotationSpec,
  context: TermsContext,
): void {
  const sheet = workbook.addWorksheet("Terms & Conditions", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  sheet.columns = [{ width: 3 }, { width: 6 }, { width: 108 }, { width: 3 }];

  sheet.getRow(1).height = 12;
  sheet.getRow(2).height = 48;
  placeImage(workbook, sheet, "arena", { tl: { col: 1, row: 1 }, ext: { width: 144, height: 48 } });

  let row = 4;
  row = writeTitle(sheet, row, "Terms & Conditions", "Applicable to every rate in this workbook.");
  row += 1;

  // The terms sheet gets the stamp too. Sheets get printed one at a time, and
  // an unstamped page of Arena letterhead is exactly the page that ends up
  // stapled to a customer copy.
  if (spec.audience === "INTERNAL") {
    sheet.mergeCells(row, 2, row, 3);
    const stamp = sheet.getCell(row, 2);
    stamp.value = INTERNAL_STAMP;
    stamp.font = font.danger;
    stamp.fill = fill(PALETTE.dangerSoft);
    stamp.alignment = ALIGN.left;
    stamp.border = cellBorder(PALETTE.danger);
    sheet.getRow(row).height = 26;
    row += 2;
  }

  for (const section of allTermsSections(context)) {
    sheet.mergeCells(row, 2, row, 3);
    const heading = sheet.getCell(row, 2);
    heading.value = section.heading;
    heading.font = { ...font.sheetTitle, size: 12 };
    heading.alignment = ALIGN.left;
    heading.fill = fill(PALETTE.accentSoft);
    heading.border = {
      bottom: { style: "thin", color: { argb: PALETTE.accent } },
    };
    sheet.getRow(row).height = 26;
    row += 1;

    section.clauses.forEach((clause, index) => {
      const number = sheet.getCell(row, 2);
      number.value = `${index + 1}.`;
      number.font = font.small;
      number.alignment = { horizontal: "right", vertical: "top" };

      const text = sheet.getCell(row, 3);
      text.value = clause;
      text.font = font.bodySoft;
      text.alignment = ALIGN.topLeft;

      // ExcelJS cannot measure wrapped text, so the height is estimated from
      // the character count. Erring generous: a clause clipped at the bottom of
      // its cell is a clause a customer can say they never saw.
      sheet.getRow(row).height = Math.max(
        ROW_HEIGHT.terms,
        Math.ceil(clause.length / 105) * ROW_HEIGHT.terms,
      );
      row += 1;
    });

    row += 1;
  }

  sheet.mergeCells(row, 2, row, 3);
  const closing = sheet.getCell(row, 2);
  closing.value =
    "Arena Cargo Logistics · " +
    `${SWEEP_ORIGIN.line1}, ${SWEEP_ORIGIN.city} ${SWEEP_ORIGIN.pincode}, India · ` +
    "Questions about any clause on this page are welcome before you book.";
  closing.font = font.small;
  closing.alignment = ALIGN.topLeft;
  sheet.getRow(row).height = 28;

  setFooter(sheet, spec);
}

// ---------------------------------------------------------------------------
// Shared drawing helpers
// ---------------------------------------------------------------------------

function writeTitle(
  sheet: ExcelJS.Worksheet,
  row: number,
  title: string,
  subtitle: string,
): number {
  sheet.mergeCells(row, 2, row, 5);
  const titleCell = sheet.getCell(row, 2);
  titleCell.value = title;
  titleCell.font = font.title;
  titleCell.alignment = ALIGN.left;
  sheet.getRow(row).height = ROW_HEIGHT.title;

  sheet.mergeCells(row + 1, 2, row + 1, 5);
  const subtitleCell = sheet.getCell(row + 1, 2);
  subtitleCell.value = subtitle;
  subtitleCell.font = font.subtitle;
  subtitleCell.alignment = ALIGN.left;
  sheet.getRow(row + 1).height = 20;

  return row + 3;
}

/** Title block for a rate sheet, with the carrier's own mark beside it. */
function writeSheetHeading(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  logoKey: string,
  title: string,
  subtitle: string,
  lastCol: number,
): void {
  sheet.getRow(1).height = 10;
  sheet.getRow(2).height = 40;
  sheet.getRow(3).height = 18;
  sheet.getRow(4).height = 10;

  placeImage(workbook, sheet, logoKey, {
    tl: { col: 0.15, row: 1.1 },
    ext: { width: 110, height: 34 },
  });

  sheet.mergeCells(2, 2, 2, Math.max(2, lastCol));
  const titleCell = sheet.getCell(2, 2);
  titleCell.value = title;
  titleCell.font = font.sheetTitle;
  titleCell.alignment = { horizontal: "left", vertical: "middle" };

  sheet.mergeCells(3, 2, 3, Math.max(2, lastCol));
  const subtitleCell = sheet.getCell(3, 2);
  subtitleCell.value = subtitle;
  subtitleCell.font = font.bodySoft;
  subtitleCell.alignment = { horizontal: "left", vertical: "middle" };
}

function writeSectionLabel(sheet: ExcelJS.Worksheet, row: number, label: string): number {
  const cell = sheet.getCell(row, 1);
  cell.value = label.toUpperCase();
  cell.font = font.sectionLabel;
  cell.alignment = ALIGN.left;
  sheet.getRow(row).height = 22;
  return row + 1;
}

function writeFieldTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  fields: [string, string][],
): number {
  let row = startRow;

  for (const [label, value] of fields) {
    const labelCell = sheet.getCell(row, 2);
    labelCell.value = label;
    labelCell.font = font.bodySoft;
    labelCell.alignment = ALIGN.left;
    labelCell.fill = fill(PALETTE.paperAlt);
    labelCell.border = cellBorder();

    sheet.mergeCells(row, 3, row, 5);
    const valueCell = sheet.getCell(row, 3);
    valueCell.value = value;
    valueCell.font = font.body;
    valueCell.alignment = ALIGN.left;
    valueCell.border = cellBorder();

    sheet.getRow(row).height = ROW_HEIGHT.data;
    row += 1;
  }

  return row + 1;
}

function writeHeaderCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  col: number,
  label: string,
): void {
  const cell = sheet.getCell(row, col);
  cell.value = label;
  cell.font = font.tableHeader;
  cell.fill = fill(PALETTE.accent);
  cell.alignment = ALIGN.centre;
  cell.border = headerBorder();
}

/**
 * A price, or a blank that means "no rate", never a zero.
 *
 * `null` writes an empty cell rather than a 0, because 0 in a price grid reads
 * as free. The number format turns a stored zero into an em dash for the same
 * reason.
 */
function writePriceCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  col: number,
  price: number | null,
  banded: boolean,
  highlight: boolean,
): void {
  const cell = sheet.getCell(row, col);

  if (price === null) {
    cell.value = "—";
    cell.font = font.small;
    cell.alignment = ALIGN.centre;
  } else {
    cell.value = price;
    cell.numFmt = NUMBER_FORMAT.money;
    cell.font = highlight ? font.best : font.body;
    cell.alignment = ALIGN.right;
  }

  cell.border = cellBorder();
  cell.fill = fill(
    price !== null && highlight ? PALETTE.bestSoft : banded ? PALETTE.paperAlt : PALETTE.paper,
  );
}

function writeServiceCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  col: number,
  option: PricedOption | null,
  banded: boolean,
  spec: QuotationSpec,
): void {
  const cell = sheet.getCell(row, col);

  if (!option) {
    cell.value = "Not available";
    cell.font = font.small;
  } else {
    // Carrier first, then the service, then the sourcing vendor on an internal
    // file only. This is the string that stops a price being anonymous.
    const parts = [option.carrierName];
    if (option.serviceName && option.serviceName !== option.carrierName) {
      parts.push(option.serviceName);
    }
    if (spec.audience === "INTERNAL" && option.vendorId) {
      parts.push(`via ${option.vendorId}`);
    }
    cell.value = parts.join(" · ");
    cell.font = font.bodySoft;
  }

  cell.alignment = ALIGN.left;
  cell.border = cellBorder();
  cell.fill = fill(banded ? PALETTE.paperAlt : PALETTE.paper);
}

function writeFootnotes(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  lastCol: number,
  spec: QuotationSpec,
): void {
  let row = startRow;

  if (spec.audience === "INTERNAL") {
    sheet.mergeCells(row, 1, row, Math.max(2, lastCol));
    const stamp = sheet.getCell(row, 1);
    stamp.value = INTERNAL_STAMP;
    stamp.font = font.danger;
    stamp.fill = fill(PALETTE.dangerSoft);
    stamp.alignment = ALIGN.left;
    sheet.getRow(row).height = 24;
    row += 1;
  }

  for (const note of SHEET_FOOTNOTES) {
    sheet.mergeCells(row, 1, row, Math.max(2, lastCol));
    const cell = sheet.getCell(row, 1);
    cell.value = `•  ${note}`;
    cell.font = font.small;
    cell.alignment = ALIGN.topLeft;
    sheet.getRow(row).height = 16;
    row += 1;
  }
}

/** Page footer. Printed on every page of every sheet, so a loose page is placeable. */
function setFooter(sheet: ExcelJS.Worksheet, spec: QuotationSpec): void {
  const left =
    spec.audience === "INTERNAL" ? "&K8C1D18INTERNAL — RAW CARRIER COST" : "Arena Cargo Logistics";

  sheet.headerFooter.oddFooter = `&L&8${left}&C&8Indicative rates. Full terms inside.&R&8Page &P of &N`;
}

/**
 * Image ids, cached per workbook.
 *
 * addImage stores the bytes and returns an id, so calling it once per sheet
 * embeds a fresh copy of the same PNG every time. With the Arena mark on eleven
 * sheets that was 380KB of workbook to show one logo eleven times. Registering
 * each logo once and reusing the id takes the same file to a fraction of that,
 * which matters because these get emailed.
 *
 * A WeakMap so a workbook that goes out of scope takes its ids with it and this
 * module holds nothing between requests.
 */
const imageIds = new WeakMap<ExcelJS.Workbook, Map<string, number>>();

function imageId(workbook: ExcelJS.Workbook, key: string, base64: string): number {
  let forWorkbook = imageIds.get(workbook);
  if (!forWorkbook) {
    forWorkbook = new Map();
    imageIds.set(workbook, forWorkbook);
  }

  const existing = forWorkbook.get(key);
  if (existing !== undefined) return existing;

  const id = workbook.addImage({ base64, extension: "png" });
  forWorkbook.set(key, id);
  return id;
}

function placeImage(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  key: string,
  position: { tl: { col: number; row: number }; ext: { width: number; height: number } },
): void {
  const logo = EXCEL_LOGOS[key];
  if (!logo) return;

  const id = imageId(workbook, key, logo.base64);

  // Fit inside the box while keeping the aspect ratio. A squashed logo is worse
  // than no logo: it reads as carelessness on a document meant to signal the
  // opposite.
  const scale = Math.min(position.ext.width / logo.width, position.ext.height / logo.height);

  sheet.addImage(id, {
    tl: position.tl as unknown as ExcelJS.Anchor,
    ext: { width: logo.width * scale, height: logo.height * scale },
    editAs: "oneCell",
  });
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

/**
 * What a carrier is called on its tab.
 *
 * On a customer file, our own consolidated networks are "Arena Economy" rather
 * than "ShipGlobal network": the vendor behind them is masked everywhere else
 * per carrierBranding.md, and a tab bearing the vendor's name would undo all of
 * it in the most visible place in the workbook.
 */
function sheetNameFor(carrier: string, spec: QuotationSpec): string {
  // On a customer file ./data.ts has already collapsed every own-brand network
  // into one carrier code, so there is exactly one such sheet and no name
  // collision is possible. isOwnBrandNetwork is still checked as a belt-and-
  // braces guard in case a future carrier rule is added without the collapse.
  if (carrier === CUSTOMER_OWN_BRAND_CARRIER) return CUSTOMER_OWN_BRAND_LABEL;
  if (spec.audience === "CUSTOMER" && isOwnBrandNetwork(carrier)) {
    return CUSTOMER_OWN_BRAND_LABEL;
  }

  const names: Record<string, string> = {
    DHL: "DHL",
    FEDEX: "FedEx",
    UPS: "UPS",
    ARAMEX: "Aramex",
    USPS: "USPS",
    DPD: "DPD",
    CANADA_POST: "Canada Post",
    AUSTRALIA_POST: "Australia Post",
    ROYAL_MAIL: "Royal Mail",
    EMIRATES: "Emirates",
    SHIPGLOBAL: "ShipGlobal network",
    SHIPMOZO: "Shipmozo network",
  };

  return names[carrier] ?? carrier;
}

/**
 * Excel rejects a sheet name over 31 characters or containing : \ / ? * [ ],
 * and ExcelJS throws on a duplicate. The uniqueness suffix should never fire
 * given the collapse in ./data.ts, but it is here because the failure mode
 * without it is a thrown exception mid-generation rather than a slightly odd
 * tab name, and a customer waiting on a file would get neither.
 */
function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);

  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, 28)} ${suffix}`;
    suffix += 1;
  }

  used.add(candidate.toLowerCase());
  return candidate;
}

function formatWeight(kg: number): string {
  return `${Number(kg)}kg`;
}

function termsContext(spec: QuotationSpec, data: QuotationData): TermsContext {
  const validUntil = new Date(data.capturedAt);
  validUntil.setDate(validUntil.getDate() + spec.validityDays);

  return {
    capturedOn: formatDate(data.capturedAt),
    validUntil: formatDate(validUntil),
    markupApplied: spec.audience === "CUSTOMER",
  };
}

/**
 * Dates on the page are Indian dates, wherever the server happens to be.
 *
 * Without the explicit zone this renders in the host's timezone, so a sweep
 * that finished at 00:48 IST prints as the previous day on a UTC server. The
 * validity date on a quotation is a commitment, and having it silently differ
 * by a day between a developer's machine and production is not a difference
 * anyone would notice until a customer quoted an expiry back at us.
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}
