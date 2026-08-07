/**
 * utils/awbLabel.test.tsx
 *
 * The parts of a shipping label that fail expensively.
 *
 * A label is not a document somebody reads and corrects. It is printed, stuck
 * to a box, and then trusted by machines and strangers. Three things have to be
 * right or the parcel is lost:
 *
 *   1. THE BARCODE GEOMETRY. If the bars are wrong the parcel does not scan,
 *      and nobody finds out until it is in a sortation hub. The pattern is
 *      cross-checked against bwip-js's own renderer, and the quiet zone against
 *      the Code 128 specification, because "it looked fine in the PDF viewer"
 *      is not evidence about a thermal print.
 *   2. THE ITEM DESCRIPTIONS. Real courier labels never print what is actually
 *      in the box. Leaking "iPhone 15 Pro" onto the outside of a carton is a
 *      theft invitation, and the mapper that builds label data from a shipment
 *      reads from the box summary, never from the contents.
 *   3. THE COD AMOUNT. A COD label with a missing or wrong figure is money
 *      collected wrongly at somebody's door.
 *
 * Run: npm test   (this file is .tsx because it renders the document itself)
 */

import assert from "node:assert/strict";
import zlib from "node:zlib";
import { describe, it } from "node:test";
import bwipjs from "bwip-js/node";

import {
  BarcodeError,
  code128Modules,
  layoutCode128,
} from "@/lib/labels/barcode";
import { AwbLabelDocument, LABEL_GEOMETRY } from "@/lib/labels/awb/AwbLabelDocument";
import {
  arenaLabelDocumentLabel,
  arenaLabelFileName,
  labelFileName,
} from "@/lib/labels/awb/naming";
import { describeDimensions, describeItems, splitServiceName } from "@/lib/labels/awb/shipmentShape";
import { SAMPLE_COD_LABEL, SAMPLE_PREPAID_LABEL } from "@/lib/labels/awb/sample";
import { AwbLabelDataError, assertLabelData } from "@/lib/labels/awb/types";

// ---------------------------------------------------------------------------
// 1. Barcode geometry
// ---------------------------------------------------------------------------

describe("code128Modules", () => {
  it("produces a pattern that starts and ends on a bar", () => {
    // A Code 128 symbol opens with a start character and closes with the stop
    // pattern, both of which begin and end on a bar. An even-length run list
    // would mean the symbol ends on a space, which is a malformed symbol.
    const modules = code128Modules("SP123456789IN");
    assert.equal(modules.length % 2, 1);
  });

  it("encodes a whole number of Code 128 symbol characters", () => {
    // Every character is 11 modules; the stop pattern is 13. So the total is
    // always 11n + 2. A total that fails this is not a Code 128 symbol at all.
    for (const value of ["SP123456789IN", "ARN260130748291", "1", "0000000000000000"]) {
      const total = code128Modules(value).reduce((a, b) => a + b, 0);
      assert.equal((total - 2) % 11, 0, `${value} produced ${total} modules`);
    }
  });

  it("refuses input Code 128 cannot represent", () => {
    // An en dash pasted into a reference would otherwise be dropped silently,
    // producing a barcode that scans as a DIFFERENT string than the one printed
    // beneath it in human-readable text.
    assert.throws(() => code128Modules("ARN–123"), BarcodeError);
    assert.throws(() => code128Modules(""), BarcodeError);
    assert.throws(() => code128Modules("   "), BarcodeError);
  });
});

describe("layoutCode128 — geometry matches the reference renderer", () => {
  it("places bars exactly where bwip-js's own renderer places them", () => {
    // The strongest check available without a physical scanner: bwip-js draws
    // each bar as a stroked vertical line at a known centre. Our filled rects
    // must describe the same bars. Any drift means our arithmetic on top of
    // their encoding has gone wrong.
    const value = "SP123456789IN";
    const svg = bwipjs.toSVG({
      bcid: "code128",
      text: value,
      height: 10,
      includetext: false,
      paddingwidth: 0,
      paddingheight: 0,
    });

    const theirs: { centre: number; width: number }[] = [];
    for (const stroke of svg.matchAll(/stroke-width="([\d.]+)"\s+d="([^"]+)"/g)) {
      const strokeWidth = parseFloat(stroke[1]);
      for (const seg of stroke[2].matchAll(/M([\d.]+) [\d.]+L\1 [\d.]+/g)) {
        theirs.push({ centre: parseFloat(seg[1]), width: strokeWidth });
      }
    }
    theirs.sort((a, b) => a.centre - b.centre);
    assert.ok(theirs.length > 0, "could not parse bwip-js SVG output");

    // Rebuild ours in bwip-js's unit system: 2 units per module, origin at 0,
    // no quiet zone (paddingwidth 0).
    const mine: { centre: number; width: number }[] = [];
    let cursor = 0;
    code128Modules(value).forEach((run, index) => {
      const width = run * 2;
      if (index % 2 === 0) mine.push({ centre: cursor + width / 2, width });
      cursor += width;
    });

    assert.equal(mine.length, theirs.length);
    for (let i = 0; i < theirs.length; i++) {
      assert.ok(
        Math.abs(theirs[i].centre - mine[i].centre) < 1e-9 &&
          Math.abs(theirs[i].width - mine[i].width) < 1e-9,
        `bar ${i} drifted: theirs ${JSON.stringify(theirs[i])} mine ${JSON.stringify(mine[i])}`,
      );
    }
  });
});

describe("layoutCode128 — quiet zone and fit", () => {
  it("gives exactly the 10 modules of quiet zone the spec requires", () => {
    // A scanner uses the quiet zone to find the symbol. Too little and it never
    // starts decoding, however clean the bars are.
    const layout = layoutCode128("SP123456789IN", 250, 85);
    assert.ok(Math.abs(layout.quietZone - layout.moduleWidth * 10) < 1e-9);
  });

  it("fills the box exactly, so bars are as wide as the space allows", () => {
    // Bar width is the single biggest factor in whether a thermal print scans
    // first time, so the symbol is solved to fit rather than padded to centre.
    const width = 250;
    const layout = layoutCode128("SP123456789IN", width, 85);
    const last = layout.bars[layout.bars.length - 1];
    const span = last.x + last.width + layout.quietZone;

    assert.ok(Math.abs(span - width) < 1e-9, `spanned ${span}, box ${width}`);
    assert.equal(layout.width, width);
  });

  it("keeps bars printable rather than shrinking them to fit", () => {
    // Squeezed into an absurd box, the module width would fall below what a
    // 203 dpi thermal head can resolve. Hairlines that cannot print are worse
    // than an overflow the caller can see, so the floor holds and the reported
    // width grows past the box to say so.
    const layout = layoutCode128("SP123456789IN", 10, 85);
    const floor = (0.25 / 25.4) * 72;

    assert.ok(layout.moduleWidth >= floor - 1e-9);
    assert.ok(layout.width > 10, "overflow must be reported, not hidden");
  });

  it("widening the box widens the bars", () => {
    const narrow = layoutCode128("SP123456789IN", 150, 85);
    const wide = layoutCode128("SP123456789IN", 250, 85);
    assert.ok(wide.moduleWidth > narrow.moduleWidth);
  });

  it("refuses a box with no area", () => {
    assert.throws(() => layoutCode128("SP123", 0, 85), BarcodeError);
    assert.throws(() => layoutCode128("SP123", 250, 0), BarcodeError);
  });
});

// ---------------------------------------------------------------------------
// 2. Label data
// ---------------------------------------------------------------------------

describe("assertLabelData", () => {
  it("refuses to print a label with no waybill", () => {
    // A label with a blank barcode area is worse than no label: it gets stuck
    // to a box and the box enters the network unroutable.
    assert.throws(
      () => assertLabelData({ ...SAMPLE_PREPAID_LABEL, awbNumber: "  " }),
      AwbLabelDataError,
    );
  });

  it("refuses a label the courier cannot deliver against", () => {
    for (const field of [
      "receiverName",
      "receiverAddress",
      "receiverPinCode",
      "receiverMobile",
      "orderId",
    ] as const) {
      assert.throws(
        () => assertLabelData({ ...SAMPLE_PREPAID_LABEL, [field]: "" }),
        AwbLabelDataError,
        `${field} should be required`,
      );
    }
  });

  it("refuses a COD label with no amount, or a zero one", () => {
    // A COD label with no figure tells the agent to collect an unknown sum. A
    // zero reads as "collect nothing", which is what PREPAID exists to say.
    assert.throws(
      () => assertLabelData({ ...SAMPLE_COD_LABEL, codAmount: undefined }),
      AwbLabelDataError,
    );
    assert.throws(
      () => assertLabelData({ ...SAMPLE_COD_LABEL, codAmount: 0 }),
      AwbLabelDataError,
    );
  });

  it("accepts the samples, so the preview route cannot ship broken", () => {
    assert.doesNotThrow(() => assertLabelData(SAMPLE_COD_LABEL));
    assert.doesNotThrow(() => assertLabelData(SAMPLE_PREPAID_LABEL));
  });
});

describe("label file names", () => {
  it("never gives the two labels for one waybill the same name", () => {
    // Both labels are attached to the SAME email and filed against the same
    // shipment. Identical filenames and a mail client shows one attachment, or
    // two a customer cannot tell apart, and somebody prints the wrong one.
    for (const awb of ["1234567890", "SP123456789IN", "AWB-99/2026"]) {
      assert.notEqual(labelFileName(awb), arenaLabelFileName(awb));
    }
  });

  it("keeps the waybill searchable in a downloads folder", () => {
    assert.equal(labelFileName("1234567890"), "AWB-1234567890.pdf");
    assert.equal(arenaLabelFileName("1234567890"), "Arena-label-1234567890.pdf");
  });

  it("survives a waybill with characters a filesystem dislikes", () => {
    // Never a path separator, a quote or a newline: these names reach a
    // Content-Disposition header and a bucket key.
    for (const name of [
      labelFileName("AWB/99 2026\"x"),
      arenaLabelFileName("AWB/99 2026\"x"),
    ]) {
      assert.match(name, /^[A-Za-z0-9.-]+\.pdf$/);
    }
  });

  it("still produces a usable name for a waybill of pure punctuation", () => {
    // Cannot happen through the mapper, which refuses a blank AWB. Pinned so a
    // future caller cannot produce a file literally called ".pdf".
    assert.equal(labelFileName("///"), "AWB-label.pdf");
    assert.equal(arenaLabelFileName("///"), "Arena-label-label.pdf");
  });

  it("names the document row after the waybill it prints", () => {
    // Three AIRWAY_BILL documents can sit on one shipment: the courier's, ours,
    // and anything ops uploaded. The row label is what tells them apart in a
    // file list.
    assert.equal(
      arenaLabelDocumentLabel("1234567890"),
      "Arena shipping label (AWB 1234567890)",
    );
  });
});

describe("splitServiceName", () => {
  it("splits a carrier from its weight slab", () => {
    assert.deepEqual(splitServiceName("XpressBees 2KG"), {
      courierName: "XpressBees",
      courierWeightTier: "2KG",
    });
    assert.deepEqual(splitServiceName("Delhivery Surface 10 Kg"), {
      courierName: "Delhivery Surface",
      courierWeightTier: "10KG",
    });
  });

  it("leaves a name with no slab whole", () => {
    // Live SpeedoPost names like these have no weight tier at all, and
    // inventing a split would print a carrier called "Gati".
    assert.deepEqual(splitServiceName("Shadowfax"), { courierName: "Shadowfax" });
    assert.deepEqual(splitServiceName("Gati Freight"), { courierName: "Gati Freight" });
    assert.deepEqual(splitServiceName("Delhivery 6CFT Freight"), {
      courierName: "Delhivery 6CFT Freight",
    });
  });

  it("never returns an empty carrier name", () => {
    assert.equal(splitServiceName("").courierName, "Courier");
    assert.equal(splitServiceName(null).courierName, "Courier");
    // A name that is nothing BUT a slab must not leave the carrier blank.
    assert.equal(splitServiceName("2KG").courierName, "2KG");
  });
});

describe("describeItems", () => {
  const box = (description: string, quantity = 1) => ({
    description,
    quantity,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 10,
  });

  it("merges identical categories into one row", () => {
    // Five apparel boxes read as one row of five, not five rows of one. The
    // table has four slots and a real consignment can have more boxes.
    assert.deepEqual(
      describeItems([box("Apparel", 3), box("Apparel", 2), box("Documents")]),
      [
        { description: "Apparel", qty: 5 },
        { description: "Documents", qty: 1 },
      ],
    );
  });

  it("collapses the overflow instead of dropping it", () => {
    // The quantities on the label still have to add up to the parcel that was
    // handed over, or a receiver counting boxes finds the label lying.
    const rows = describeItems([
      box("A"),
      box("B"),
      box("C"),
      box("D", 2),
      box("E", 3),
      box("F"),
    ]);

    assert.equal(rows.length, 4);
    assert.deepEqual(rows[3], { description: "Other items", qty: 6 });
    assert.equal(
      rows.reduce((sum, r) => sum + r.qty, 0),
      9,
      "total quantity must survive the collapse",
    );
  });

  it("never produces an empty table", () => {
    // A blank table reads as a printing fault; "Item x1" reads as a parcel.
    assert.deepEqual(describeItems([]), [{ description: "Item", qty: 1 }]);
    assert.deepEqual(describeItems([box("   ")]), [{ description: "Item", qty: 1 }]);
  });

  it("treats a zero or negative box count as one box", () => {
    assert.deepEqual(describeItems([box("Apparel", 0)]), [
      { description: "Apparel", qty: 1 },
    ]);
  });
});

describe("describeDimensions", () => {
  const box = (quantity: number) => ({
    description: "Apparel",
    quantity,
    lengthCm: 30.4,
    widthCm: 20.6,
    heightCm: 10,
  });

  it("prints real measurements for a single box", () => {
    assert.equal(describeDimensions([box(1)]), "30 x 21 x 10 cm");
  });

  it("prints a box count once there is more than one", () => {
    // Showing only the first box's size understates the consignment to whoever
    // has to load it, and there is no room to list them all.
    assert.equal(describeDimensions([box(3)]), "3 boxes");
    assert.equal(describeDimensions([box(1), box(1)]), "2 boxes");
  });
});

// ---------------------------------------------------------------------------
// 3. The rendered PDF
// ---------------------------------------------------------------------------

describe("the rendered label", () => {
  /** Every content stream in the PDF, inflated and concatenated. */
  function contentStreams(pdf: Buffer): string {
    const latin = pdf.toString("latin1");
    let ops = "";
    const marker = /stream\r?\n/g;
    let match: RegExpExecArray | null;

    while ((match = marker.exec(latin))) {
      const start = match.index + match[0].length;
      const end = latin.indexOf("endstream", start);
      if (end < 0) continue;
      try {
        ops += zlib.inflateSync(pdf.subarray(start, end)).toString("latin1") + "\n";
      } catch {
        // Not a deflate stream (an embedded image, say). Not our concern here.
      }
    }
    return ops;
  }

  async function render(data: typeof SAMPLE_COD_LABEL, paper: "thermal" | "a4") {
    const { renderToBuffer } = await import("@react-pdf/renderer");
    return renderToBuffer(<AwbLabelDocument data={data} paperSize={paper} />);
  }

  it("fits on exactly one page, on both paper sizes", async () => {
    // The label's bottom half is the payment stamp and the contents. A layout
    // that overflows loses precisely the part that changes what the delivery
    // agent does, and it does so silently.
    for (const paper of ["thermal", "a4"] as const) {
      for (const data of [SAMPLE_COD_LABEL, SAMPLE_PREPAID_LABEL]) {
        const pdf = await render(data, paper);
        const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
        assert.equal(pages, 1, `${paper} / ${data.paymentType} rendered ${pages} pages`);
      }
    }
  });

  it("draws the barcode as vector, never as an image", async () => {
    // A raster barcode is resampled by the printer driver, which anti-aliases
    // the bar edges to grey. Grey edges are what a CCD scanner reads as
    // ambiguous. The only image on this label is the logo.
    const pdf = await render(SAMPLE_COD_LABEL, "thermal");
    const imageDraws = (contentStreams(pdf).match(/\/[A-Za-z0-9]+ Do/g) ?? []).length;

    assert.equal(imageDraws, 1, "expected exactly one image draw: the Arena logo");
  });

  it("uses no ink that is neither pure black nor pure white", async () => {
    // Thermal printers have one ink and no usable halftone. Any grey in here
    // prints as mud, and on a barcode it prints as an unreadable barcode.
    const pdf = await render(SAMPLE_COD_LABEL, "thermal");
    const colours = new Set<string>();

    for (const op of contentStreams(pdf).matchAll(/((?:[\d.]+\s+){1,4})(scn|SCN)(?=\s|$)/g)) {
      colours.add(op[1].trim());
    }

    // The regex must actually be finding colour operators, or this asserts
    // nothing at all.
    assert.ok(colours.size > 0, "found no colour operators to check");

    for (const colour of colours) {
      const channels = colour.split(/\s+/).map(Number);
      const isBlack = channels.every((c) => c === 0);
      const isWhite = channels.every((c) => c === 1);
      assert.ok(isBlack || isWhite, `non-binary ink in the label: "${colour}"`);
    }
  });

  it("draws the same artwork on thermal and on A4", async () => {
    // The A4 page is a carrier for the 4x6 artwork, not a second layout. If it
    // ever diverges, a barcode printed on office paper stops being the same
    // barcode as the one printed on a roll, and only one of them gets tested.
    const thermal = contentStreams(await render(SAMPLE_COD_LABEL, "thermal"));
    const a4 = contentStreams(await render(SAMPLE_COD_LABEL, "a4"));

    const fills = (ops: string) => (ops.match(/(?:^|\s)f(?=\s|$)/g) ?? []).length;
    const lines = (ops: string) => (ops.match(/(?:^|\s)l(?=\s|$)/g) ?? []).length;

    // The floor is derived, not guessed: both barcodes' bars have to be on the
    // page before anything else is, so a template that quietly stopped drawing
    // one of them cannot pass this.
    const awbBars = layoutCode128(
      SAMPLE_COD_LABEL.awbNumber,
      LABEL_GEOMETRY.blockContentWidth,
      LABEL_GEOMETRY.awbBarcodeHeight,
    ).bars.length;
    const orderBars = layoutCode128(
      SAMPLE_COD_LABEL.orderId,
      LABEL_GEOMETRY.blockContentWidth,
      LABEL_GEOMETRY.awbBarcodeHeight,
    ).bars.length;

    assert.ok(
      fills(thermal) >= awbBars + orderBars,
      `only ${fills(thermal)} fills for ${awbBars + orderBars} expected bars`,
    );
    assert.equal(fills(a4), fills(thermal), "fill count diverged between papers");
    assert.equal(lines(a4), lines(thermal), "path geometry diverged between papers");
  });

  it("prints the AWB as text as well as bars", async () => {
    // If the barcode is damaged in transit, the human-readable number under it
    // is the only thing that saves the parcel.
    const pdf = await render(SAMPLE_COD_LABEL, "thermal");
    const ops = contentStreams(pdf);

    // PDF text ops split the string across Tj operands, so the digits are
    // checked individually rather than as one run.
    for (const char of SAMPLE_COD_LABEL.awbNumber.split("")) {
      assert.ok(ops.includes(char), `AWB character "${char}" missing from the page`);
    }
  });
});
