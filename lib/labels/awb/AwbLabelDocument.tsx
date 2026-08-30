/**
 * lib/labels/awb/AwbLabelDocument.tsx
 *
 * The shipping label, as a document.
 *
 * ── IT IS A LABEL, NOT A DOCUMENT ───────────────────────────────────────────
 * An invoice is read once, carefully, by someone sitting down. A label is read
 * in a fraction of a second by a person holding a box, and by a machine that
 * gets one pass at it. Everything below follows from that:
 *
 *   - Structure comes from RULES, not whitespace. The tax invoice separates its
 *     sections with air, which is right for a page somebody studies. Here a
 *     hairline box around each block is what lets a warehouse hand find the
 *     delivery address without reading anything, which is the opposite of the
 *     invoice's design and deliberately so.
 *   - Nothing is grey. Thermal printers have one ink and no halftone worth the
 *     name; a grey label prints as a muddy black one. Every rule and every
 *     glyph on this page is pure black on pure white.
 *   - Hierarchy is carried by size and weight alone, in four steps: the
 *     receiver's name and the payment stamp, then the AWB, then content, then
 *     the small labels that name each block.
 *
 * ── THE 4x6 IS THE ARTWORK; A4 IS A CARRIER FOR IT ──────────────────────────
 * `LabelBody` is a fixed 288 x 432pt block, which is 4 x 6 inches exactly. The
 * thermal page IS that block; the A4 page places the same block at the top-left
 * of a sheet. There is no responsive layout and no second set of styles, so a
 * barcode printed on A4 is geometrically identical to one printed on a roll.
 *
 * ── FONTS ───────────────────────────────────────────────────────────────────
 * Helvetica and Helvetica-Bold only, both built into @react-pdf/renderer. No
 * Font.register, so there is no font fetch that can fail in a background job.
 * That is also why money reads "Rs 1,234.00": the built-in fonts have no glyph
 * for the rupee sign, and it would print as a blank box on a COD label, which
 * is the single worst place on this page to print a blank box.
 */

import {
  Document,
  Image,
  Page,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";

import { ARENA_LOGO_ASPECT, ARENA_LOGO_DATA_URI } from "@/lib/invoices/tax/pdf/logo";
import { layoutCode128 } from "@/lib/labels/barcode";
import { fitHelveticaBold } from "@/lib/labels/fitText";
import type { AwbLabelData, AwbLabelItem, LabelPaperSize } from "./types";

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** 4 x 6 inches at 72pt per inch. The universal Indian thermal label. */
const LABEL_WIDTH = 288;
const LABEL_HEIGHT = 432;

/** Inner padding of each bordered block. */
const PAD = 6;

/** Content width inside a block: label width, minus its border and padding. */
const BLOCK_CONTENT_WIDTH = LABEL_WIDTH - PAD * 2 - 2;

/**
 * Bar height for the AWB barcode: 35mm.
 *
 * Height is what makes a barcode tolerant of a skewed or fast scan: a taller
 * symbol gives the beam more chances to cross every bar cleanly. It is the
 * second lever after bar width, and both are pushed as far as the label allows.
 *
 * 35mm rather than 30 because the layout measured out with roughly 14pt of
 * slack at the bottom once every other block had what it needed, and the most
 * useful place on a shipping label to spend spare millimetres is the barcode
 * the carrier has to read.
 */
const AWB_BARCODE_HEIGHT = (35 / 25.4) * 72;

/** The order barcode is a convenience for our own ops, so it gets less room. */
const ORDER_BARCODE_HEIGHT = (11 / 25.4) * 72;

/** Logo drawn at a fixed height; width follows the mark's real aspect ratio. */
const LOGO_HEIGHT = 17;
const LOGO_WIDTH = LOGO_HEIGHT * ARENA_LOGO_ASPECT;

/**
 * The company name in the header, set to fill the space the logo leaves.
 *
 * The name is printed at whatever size fits (see lib/labels/fitText.ts) rather
 * than at one size chosen for the longest name we could think of. The numbers
 * below are the box it has to fit, and each is a real limit:
 *
 *   GAP        The mark and the wordmark have to read as two things. Below
 *              about 10pt at these sizes they start to look like one lockup.
 *   MAX_HEIGHT LOGO_HEIGHT plus a little. The header block is as tall as its
 *              tallest child, so every point past this pushes the whole label
 *              down and comes out of the item table at the bottom.
 *   MAX_SIZE   Below the 11pt receiver name and the 9.5pt courier. This is the
 *              sender's name on someone else's parcel: it is a mark of origin,
 *              not an instruction, and it must not out-shout either of those.
 *   MAX_LINES  Two. A third line costs more height than the width it buys.
 */
const COMPANY_GAP = 10;
const COMPANY_MAX_WIDTH = BLOCK_CONTENT_WIDTH - LOGO_WIDTH - COMPANY_GAP;
const COMPANY_MAX_HEIGHT = LOGO_HEIGHT + 4;
const COMPANY_LINE_HEIGHT = 1.15;
const COMPANY_MAX_SIZE = 9;
const COMPANY_MIN_SIZE = 5;
const COMPANY_MAX_LINES = 2;

/**
 * A4, with the label at the top-left.
 *
 * Offset rather than flush to the corner: laser printers cannot image the outer
 * few millimetres of a sheet, so a label in the true corner comes out clipped.
 * 24pt is about 8mm, clear of every common unprintable margin, and it leaves
 * the label's own border intact as the line to cut along.
 */
const A4_OFFSET = 24;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const BLACK = "#000000";

const styles = StyleSheet.create({
  thermalPage: {
    width: LABEL_WIDTH,
    height: LABEL_HEIGHT,
    backgroundColor: "#FFFFFF",
  },
  a4Page: {
    backgroundColor: "#FFFFFF",
    paddingTop: A4_OFFSET,
    paddingLeft: A4_OFFSET,
  },

  label: {
    width: LABEL_WIDTH,
    height: LABEL_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BLACK,
    borderStyle: "solid",
    flexDirection: "column",
  },

  // Each block is separated by a rule rather than by space. The last one omits
  // it, so the label's own border is the closing line.
  block: {
    borderBottomWidth: 1,
    borderBottomColor: BLACK,
    borderBottomStyle: "solid",
    paddingHorizontal: PAD,
    paddingVertical: 4,
  },
  blockLast: {
    paddingHorizontal: PAD,
    paddingVertical: 4,
    flexGrow: 1,
  },

  row: { flexDirection: "row", alignItems: "center" },
  rowTop: { flexDirection: "row", alignItems: "flex-start" },
  grow: { flexGrow: 1 },

  // Tier 4: the small caps that name a block. Present but never competing.
  caption: {
    fontFamily: "Helvetica-Bold",
    fontSize: 5.5,
    letterSpacing: 0.7,
    color: BLACK,
    marginBottom: 1.5,
  },

  // Tier 1: the two things read from arm's length.
  receiverName: { fontFamily: "Helvetica-Bold", fontSize: 11, color: BLACK },
  stamp: { fontFamily: "Helvetica-Bold", fontSize: 13, color: BLACK },
  stampCod: { fontFamily: "Helvetica-Bold", fontSize: 10, color: BLACK },

  // Tier 2: the AWB, printed under its own barcode.
  awbText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    letterSpacing: 1.4,
    color: BLACK,
    textAlign: "center",
  },

  // Tier 3: content.
  body: { fontFamily: "Helvetica", fontSize: 7.5, color: BLACK, lineHeight: 1.32 },
  bodyBold: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: BLACK, lineHeight: 1.32 },
  courier: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: BLACK },
  small: { fontFamily: "Helvetica", fontSize: 6.5, color: BLACK, lineHeight: 1.3 },
  smallBold: { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: BLACK, lineHeight: 1.3 },

  // No fontSize here: it is measured per name at render time, so that a short
  // sender's name is not set at the size a long one needs.
  company: {
    fontFamily: "Helvetica-Bold",
    color: BLACK,
    textAlign: "right",
    lineHeight: COMPANY_LINE_HEIGHT,
  },

  // The payment stamp sits in its own box: it is the one instruction on the
  // label that changes what the delivery agent DOES.
  stampBox: {
    borderWidth: 1.2,
    borderColor: BLACK,
    borderStyle: "solid",
    paddingVertical: 3,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },

  barcodeBox: { alignItems: "center", justifyContent: "center" },

  // Item table. Rules on all sides, because a table read at a glance needs its
  // columns bounded.
  table: {
    borderWidth: 0.7,
    borderColor: BLACK,
    borderStyle: "solid",
    marginTop: 2,
  },
  tableHeadRow: {
    flexDirection: "row",
    borderBottomWidth: 0.7,
    borderBottomColor: BLACK,
    borderBottomStyle: "solid",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.35,
    borderBottomColor: BLACK,
    borderBottomStyle: "solid",
  },
  tableRowLast: { flexDirection: "row" },
  cellDesc: { flexGrow: 1, paddingVertical: 2, paddingHorizontal: 4 },
  cellQty: {
    width: 40,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderLeftWidth: 0.7,
    borderLeftColor: BLACK,
    borderLeftStyle: "solid",
    textAlign: "right",
  },
});

// ---------------------------------------------------------------------------
// Barcode
// ---------------------------------------------------------------------------

/**
 * A Code 128 symbol as filled rectangles.
 *
 * Vector, not an image: see the reasoning in lib/labels/barcode.ts. The white
 * background rect is drawn explicitly rather than left to the page, so the
 * quiet zone is part of the symbol itself and cannot be encroached on by a
 * neighbouring element or lost to a page background change.
 */
function Barcode({
  value,
  width,
  height,
}: {
  value: string;
  width: number;
  height: number;
}) {
  const layout = layoutCode128(value, width, height);

  return (
    <Svg width={layout.width} height={height} viewBox={`0 0 ${layout.width} ${height}`}>
      <Rect x={0} y={0} width={layout.width} height={height} fill="#FFFFFF" />
      {layout.bars.map((bar, index) => (
        <Rect
          key={index}
          x={bar.x}
          y={0}
          width={bar.width}
          height={height}
          fill={BLACK}
        />
      ))}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function Header({ companyName }: { companyName: string }) {
  // Each line is rendered as its own Text, because the break points came out of
  // the same measurement as the size. Handing the renderer the whole string
  // would let it wrap somewhere else and make the measurement a guess.
  const { lines, fontSize } = fitHelveticaBold(companyName, COMPANY_MAX_WIDTH, {
    maxSize: COMPANY_MAX_SIZE,
    minSize: COMPANY_MIN_SIZE,
    maxHeight: COMPANY_MAX_HEIGHT,
    lineHeight: COMPANY_LINE_HEIGHT,
    maxLines: COMPANY_MAX_LINES,
  });

  return (
    <View style={[styles.block, styles.row]}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
      <Image src={ARENA_LOGO_DATA_URI} style={{ width: LOGO_WIDTH, height: LOGO_HEIGHT }} />
      <View style={styles.grow} />
      <View style={{ width: COMPANY_MAX_WIDTH }}>
        {lines.map((line, index) => (
          <Text key={index} style={[styles.company, { fontSize }]}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

function ShipTo({ data }: { data: AwbLabelData }) {
  return (
    <View style={styles.block}>
      <Text style={styles.caption}>SHIP TO</Text>
      <Text style={styles.receiverName}>{data.receiverName}</Text>
      <Text style={styles.body}>{data.receiverAddress}</Text>
      <Text style={styles.bodyBold}>
        {[data.receiverCity, data.receiverState].filter(Boolean).join(", ")}
        {data.receiverPinCode ? ` - ${data.receiverPinCode}` : ""}
      </Text>
      <Text style={styles.body}>Mobile: {data.receiverMobile}</Text>
    </View>
  );
}

function CourierAndAwb({ data }: { data: AwbLabelData }) {
  const service = [data.courierName, data.courierWeightTier]
    .filter((part) => part && String(part).trim())
    .join(" ");

  return (
    <View style={styles.block}>
      <View style={[styles.row, { marginBottom: 3 }]}>
        <Text style={styles.courier}>{service}</Text>
        <View style={styles.grow} />
        {/* Middle dot, not a pipe: in Helvetica a "|" is near enough to a
            lowercase "l" to be misread as part of the measurement. */}
        <Text style={styles.small}>
          {data.dimensions} &#183; {data.weight}
        </Text>
      </View>

      <View style={styles.barcodeBox}>
        <Barcode
          value={data.awbNumber}
          width={BLOCK_CONTENT_WIDTH}
          height={AWB_BARCODE_HEIGHT}
        />
      </View>

      <Text style={[styles.awbText, { marginTop: 2 }]}>{data.awbNumber}</Text>
    </View>
  );
}

function ReturnTo({ data }: { data: AwbLabelData }) {
  return (
    <View style={styles.block}>
      <Text style={styles.caption}>IF UNDELIVERED, RETURN TO</Text>
      <Text style={styles.smallBold}>{data.senderCompanyName}</Text>
      <Text style={styles.small}>{data.senderContactName}</Text>
      <Text style={styles.small}>{data.senderAddress}</Text>
      <Text style={styles.small}>Mobile: {data.senderMobile}</Text>
    </View>
  );
}

/**
 * "Rs 1,234.00" with Indian digit grouping.
 *
 * Not "₹": the built-in PDF fonts have no glyph for U+20B9 and it would print
 * as a blank box. Same reasoning and same grouping as the tax invoice's
 * `money`, which is the other place Arena prints an amount.
 */
function rupees(amount: number): string {
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, fraction] = fixed.split(".");
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest
    ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`
    : last3;
  return `Rs ${grouped}.${fraction}`;
}

function PaymentStamp({ data }: { data: AwbLabelData }) {
  if (data.paymentType === "COD") {
    return (
      <View style={styles.stampBox}>
        <Text style={styles.stamp}>COD</Text>
        <Text style={styles.stampCod}>{rupees(Number(data.codAmount))}</Text>
      </View>
    );
  }

  return (
    <View style={styles.stampBox}>
      <Text style={styles.stamp}>PREPAID</Text>
      <Text style={styles.small}>Do not collect</Text>
    </View>
  );
}

function OrderInfo({ data }: { data: AwbLabelData }) {
  // The stamp takes what it needs and the barcode gets the rest, so a long COD
  // figure never squeezes the symbol below a printable module width.
  const stampWidth = 88;
  const barcodeWidth = BLOCK_CONTENT_WIDTH - stampWidth - 8;

  return (
    <View style={[styles.block, styles.rowTop]}>
      <View style={{ width: barcodeWidth }}>
        <Text style={styles.caption}>ORDER</Text>
        <Text style={styles.bodyBold}>{data.orderId}</Text>
        <Text style={styles.small}>Ref: {data.refId}</Text>

        <View style={[styles.barcodeBox, { marginTop: 2 }]}>
          <Barcode
            value={data.orderId}
            width={barcodeWidth}
            height={ORDER_BARCODE_HEIGHT}
          />
        </View>
      </View>

      <View style={styles.grow} />

      <View style={{ width: stampWidth }}>
        <PaymentStamp data={data} />
      </View>
    </View>
  );
}

function ItemTable({ items }: { items: AwbLabelItem[] }) {
  return (
    <View style={styles.blockLast}>
      <Text style={styles.caption}>CONTENTS</Text>

      <View style={styles.table}>
        <View style={styles.tableHeadRow}>
          <Text style={[styles.smallBold, styles.cellDesc]}>Item Description</Text>
          <Text style={[styles.smallBold, styles.cellQty]}>Qty</Text>
        </View>

        {items.map((item, index) => (
          <View
            key={index}
            style={index === items.length - 1 ? styles.tableRowLast : styles.tableRow}
          >
            <Text style={[styles.small, styles.cellDesc]}>{item.description}</Text>
            <Text style={[styles.small, styles.cellQty]}>{item.qty}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/** The 4x6 artwork. Identical on both paper sizes. */
function LabelBody({ data }: { data: AwbLabelData }) {
  return (
    <View style={styles.label}>
      <Header companyName={data.senderCompanyName} />
      <ShipTo data={data} />
      <CourierAndAwb data={data} />
      <ReturnTo data={data} />
      <OrderInfo data={data} />
      <ItemTable items={data.items} />
    </View>
  );
}

export interface AwbLabelDocumentProps {
  data: AwbLabelData;
  /** Defaults to the 4x6 thermal label. */
  paperSize?: LabelPaperSize;
}

export function AwbLabelDocument({ data, paperSize = "thermal" }: AwbLabelDocumentProps) {
  return (
    <Document
      title={`AWB ${data.awbNumber}`}
      author={data.senderCompanyName}
      subject={`Shipping label for ${data.orderId}`}
    >
      {paperSize === "a4" ? (
        <Page size="A4" style={styles.a4Page}>
          <LabelBody data={data} />
        </Page>
      ) : (
        <Page size={{ width: LABEL_WIDTH, height: LABEL_HEIGHT }} style={styles.thermalPage}>
          <LabelBody data={data} />
        </Page>
      )}
    </Document>
  );
}

/** Exported for the tests that check the label still fits on one page. */
export const LABEL_GEOMETRY = {
  width: LABEL_WIDTH,
  height: LABEL_HEIGHT,
  awbBarcodeHeight: AWB_BARCODE_HEIGHT,
  blockContentWidth: BLOCK_CONTENT_WIDTH,
} as const;
