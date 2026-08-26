/**
 * lib/invoices/tax/pdf/TaxInvoiceDocument.tsx
 *
 * The booking invoice, as a document. Raised automatically when a shipment is
 * booked, and describing that one shipment.
 *
 * ── IT SHARES A HOUSE STYLE, NOT A TEMPLATE ─────────────────────────────────
 * The palette, the repeated shapes, the number formatting and the two variants
 * all come from lib/invoices/pdf/theme.tsx, which the manual invoice draws from
 * too. That is deliberate and it is the point: a customer holding an automatic
 * invoice for a booking and a manual invoice for the warehousing on the same
 * cargo must be holding two documents from one company.
 *
 * What is NOT shared is the content, because the two describe different things.
 * This one has a cargo table: every box, its size, its weight and what was
 * packed in it with HSN codes. A manual invoice has consignments instead, and
 * forcing either into the other's shape would lose the half that matters.
 *
 * Which variant is used is a global setting, not an argument the caller
 * invents: see lib/invoices/pdf/variant.ts.
 *
 * ── ONE PAGE ────────────────────────────────────────────────────────────────
 * The whole invoice fits on a single A4 sheet for the shipment we actually see:
 * up to about four boxes and eight charge lines. That is a hard constraint, not
 * a preference, and it is why the layout below is dense in structure and quiet
 * in decoration. Everything on the page earns its height:
 *
 *   - The issuer's identity lives in the masthead, not in a second "from"
 *     column further down. It is letterhead; it does not need a section.
 *   - The customer and the shipment share one panel, side by side.
 *   - The cargo is a row of metrics and a table with one row per piece.
 *
 * Before adding anything, render both samples in both variants and check the
 * page count:
 *   npx tsx scripts/renderSampleInvoice.tsx
 * A shipment with more pieces or a longer breakdown will still flow onto a
 * second page. That is correct, and the wrap rules below make the break fall
 * between blocks rather than through one.
 *
 * ── WHAT THE PAGE MUST STATE PLAINLY ────────────────────────────────────────
 * Three things are load-bearing for the person reading this against their own
 * paperwork, and each has a fixed place:
 *
 *   1. The waybill number. Printed in the shipment panel at content weight and
 *      repeated in the page footer, so a loose second sheet is still traceable.
 *   2. Origin and destination, as a labelled FROM and TO rather than a run-on
 *      line, because these are matched against a booking rather than read.
 *   3. All THREE weights: actual, volumetric and chargeable. Freight is billed
 *      on the chargeable one, and a customer who sees only that figure and
 *      knows only what their parcel weighed on a scale reads the invoice as
 *      wrong. Showing the arithmetic is cheaper than answering it.
 *
 * ── DESIGN RULES, AND WHY ───────────────────────────────────────────────────
 * Structure comes from whitespace, alignment and weight in the arena variant,
 * and from rules and bands in the grid one. In both, filled panels are rationed
 * and the ration is the rule. There are three, and each answers a question the
 * reader arrives with:
 *
 *   1. Who is billed, and for which shipment.
 *   2. The total. The one figure the invoice exists to state.
 *   3. Where to send the money. The one block a reader hunts for rather than
 *      reads in order, which is why it is tinted rather than left as text.
 *
 * A fourth would make all of them ordinary.
 *
 * ── HIERARCHY ───────────────────────────────────────────────────────────────
 * Four tiers, and everything on the page is in exactly one of them, so a reader
 * can find the level they want without reading the levels they do not.
 */

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { ShipmentMode } from "@/generated/prisma";

import {
  Band,
  C,
  Fact,
  type InvoiceVariant,
  Metric,
  PaymentPanel,
  TermsBlock,
  TotalsRow,
  kg,
  money,
  splitLegalName,
  t,
  trim,
} from "../../pdf/theme";
import { DEFAULT_INVOICE_VARIANT } from "../../pdf/variant";
import { formatInvoiceDate } from "../gst";
import { amountInWords } from "../money";
import { invoiceTermsFor, taxTreatmentFor } from "../config";
import type {
  InvoiceDocumentData,
  PackageSnapshot,
  PartySnapshot,
} from "../types";
import { ARENA_LOGO_DATA_URI } from "./logo";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/**
 * The air divisor. Volumetric weight in kg is length × width × height in cm
 * divided by this.
 *
 * Redeclared here rather than imported from lib/booking/cargo, on purpose. That
 * constant is what a LIVE booking is priced with and it is free to change with
 * a carrier contract; this one is what an ALREADY ISSUED invoice is explained
 * by. A snapshot that regenerates with a different divisor next year would
 * print a volumetric weight that no longer reconciles with the chargeable
 * weight frozen beside it, which is worse than not printing one.
 */
const VOLUMETRIC_DIVISOR = 5000;

/** Right-hand columns of the charges table. Shared by the head and the rows. */
const COL = {
  // The S.No column. Narrow on purpose: it is an index, not data.
  sno: 24,
  sac: 46,
  taxable: 66,
  gst: 62,
  amount: 74,
};

/** Columns of the cargo table. Shared by the head and the piece rows. */
const CARGO = {
  index: 24,
  dimensions: 88,
  pieces: 34,
  weight: 56,
  value: 74,
};

const s = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: C.ink,
    lineHeight: 1.35,
  },

  // ── masthead ──
  // Mark, then the issuer's full legal identity as letterhead. Putting the
  // GSTIN and PAN here rather than in a "from" column below is what buys the
  // page the room for the cargo section.
  masthead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  logo: { width: 112, marginBottom: 4 },
  sellerName: { fontSize: 10, fontFamily: "Helvetica-Bold", lineHeight: 1.25 },
  // The issuer's own address and identifiers are NOT support text: they are
  // read off the page digit by digit by whoever is matching a payment or
  // filing against this invoice. Content colour, like everything else that is
  // read rather than skimmed.
  sellerLine: { fontSize: 8, color: C.ink, lineHeight: 1.4 },
  sellerIds: { fontSize: 8, color: C.ink, lineHeight: 1.4 },

  mastheadRight: { alignItems: "flex-end", paddingLeft: 20 },
  docTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    textAlign: "right",
  },
  docCopy: {
    fontSize: 7,
    color: C.muted,
    letterSpacing: 0.9,
    textAlign: "right",
    marginTop: 3,
  },
  docNumber: {
    fontSize: 11.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    marginTop: 7,
  },
  docDate: { fontSize: 8.5, color: C.ink, textAlign: "right", marginTop: 2 },
  statusMark: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    color: C.alert,
    textAlign: "right",
    marginTop: 4,
  },

  // ── party panel content ──
  partyName: { fontSize: 10, fontFamily: "Helvetica-Bold", lineHeight: 1.25 },
  detail: { fontSize: 8, color: C.ink, lineHeight: 1.4 },
  detailInk: { fontSize: 8, color: C.ink, lineHeight: 1.4 },
  shipmentNumber: { fontSize: 10, fontFamily: "Helvetica-Bold" },

  // ── the waybill and the route ──
  // Both are matched against other paperwork rather than read, so they are set
  // as labelled facts with the value at content weight, not as a sentence. The
  // route used to be one run-on line reading "Gurugram, Haryana to Jaipur,
  // Rajasthan"; splitting it into FROM and TO is what makes the two ends
  // separable at a glance when somebody is checking one of them.
  awbValue: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.3,
  },
  routeValue: { flex: 1, fontSize: 8.5, lineHeight: 1.35 },

  // ── cargo table ──
  // One row per piece, with its contents on a grey line beneath. Nesting a
  // second table inside the first was accurate and hard to read; this says the
  // same thing in half the height.
  cargoHead: { flexDirection: "row", paddingTop: 5, paddingBottom: 3 },
  cargoHeadGrid: {
    flexDirection: "row",
    backgroundColor: C.band,
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginTop: 6,
  },
  headCell: { fontSize: 7, color: C.muted, letterSpacing: 0.8 },
  headCellGrid: {
    fontSize: 7,
    color: C.bandInk,
    letterSpacing: 0.6,
    fontFamily: "Helvetica-Bold",
  },
  boxRow: { flexDirection: "row", paddingTop: 4 },
  boxRowGrid: {
    flexDirection: "row",
    paddingVertical: 2.5,
    paddingHorizontal: 4,
  },
  rowZebra: { backgroundColor: C.gridZebra },
  rowRuled: { borderBottomWidth: 0.5, borderBottomColor: C.gridRule },
  boxIndex: { width: CARGO.index, fontSize: 9, color: C.muted },
  boxName: { flex: 1, paddingRight: 12, fontSize: 9, lineHeight: 1.3 },
  boxCell: { fontSize: 8.5, textAlign: "right" },
  boxCellMuted: { fontSize: 8, color: C.muted, textAlign: "right" },
  boxContents: {
    fontSize: 7.5,
    color: C.muted,
    marginLeft: CARGO.index,
    marginTop: 2,
    lineHeight: 1.4,
  },
  boxContentsGrid: {
    fontSize: 7.5,
    color: C.muted,
    marginLeft: CARGO.index + 4,
    paddingRight: 4,
    paddingBottom: 3.5,
    lineHeight: 1.4,
  },

  // ── charges table ──
  tableHead: { flexDirection: "row", paddingTop: 4, paddingBottom: 3 },
  tableHeadGrid: {
    flexDirection: "row",
    backgroundColor: C.band,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  row: { flexDirection: "row", paddingTop: 4.5, paddingBottom: 1 },
  rowGrid: {
    flexDirection: "row",
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: C.gridRule,
  },
  rowDescription: { flex: 1, paddingRight: 14 },
  descriptionText: { fontSize: 9, lineHeight: 1.3 },
  cell: { fontSize: 8.5, color: C.ink, textAlign: "right" },
  cellMuted: { fontSize: 8, color: C.muted, textAlign: "right" },
  cellStrong: { fontSize: 9, textAlign: "right" },
  cellIndex: { fontSize: 8, color: C.muted, textAlign: "left" },

  // ── the bottom block ──
  // Terms and the payment block on the left, the total on the right, on one
  // row. The charges table leaves the bottom left of the page empty and the
  // footer used to sit below it; putting the two side by side is what buys the
  // last hundred points, and it is where an invoice reader looks for both.
  bottomRow: { flexDirection: "row", marginTop: 7, alignItems: "flex-start" },
  bottomLeft: { flex: 1, paddingRight: 18 },
  /** Totals panel and signature, stacked. Fixed width so the two agree. */
  bottomRight: { width: 238 },
  totalsPanel: {
    backgroundColor: C.panel,
    borderWidth: 0.5,
    borderColor: C.rule,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  totalsPanelGrid: {
    borderRadius: 0,
    borderColor: C.gridRule,
    backgroundColor: "#FFFFFF",
  },
  totalsRule: {
    borderTopWidth: 0.75,
    borderTopColor: C.ruleStrong,
    marginTop: 3,
    marginBottom: 5,
  },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  grandLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  grandValue: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  words: { flex: 1, fontSize: 8, color: C.ink, paddingRight: 12, lineHeight: 1.25 },
  wordsLabel: { color: C.muted, letterSpacing: 0.6, fontSize: 7 },

  // ── the reverse-charge statement ──
  // Rule 46(o) wants this stated, and it is the one line on the page whose
  // answer is usually "no" and which is therefore easy to leave off. It gets
  // its own ruled line rather than a slot in a paragraph so it cannot be
  // missed.
  reverseChargeLine: {
    flexDirection: "row",
    marginTop: 7,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
  },
  reverseChargeLabel: { fontSize: 7.5, color: C.muted },
  reverseChargeValue: {
    fontSize: 7.5,
    color: C.ink,
    fontFamily: "Helvetica-Bold",
    marginLeft: 4,
  },

  // The two figures a payer acts on, full width under the totals panel. See
  // the manual invoice for why they are not inside it.
  dueStrip: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
  },
  dueLabel: { fontSize: 8, color: C.muted, paddingRight: 8 },
  dueValue: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },
  paymentNote: { fontSize: 8, marginTop: 4, textAlign: "right" },
  paymentNoteAlert: { color: C.alert, fontFamily: "Helvetica-Bold" },

  // ── footer ──
  footerText: { fontSize: 7.5, color: C.ink, lineHeight: 1.4 },
  footerGap: { marginTop: 5 },
  signature: { alignItems: "flex-end", marginTop: 5 },
  signatureFor: { fontSize: 8, color: C.muted },
  signatureName: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    lineHeight: 1.25,
  },
  signatureRole: { fontSize: 8, color: C.muted, marginTop: 6 },
  declaration: {
    fontSize: 7.5,
    color: C.ink,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.2,
    lineHeight: 1.35,
    marginBottom: 5,
  },

  // ── fixed foot of page ──
  // Two separately positioned elements, each measured from the bottom edge, so
  // nothing here depends on the flow above it having ended anywhere.
  pageFootRule: {
    position: "absolute",
    bottom: 34,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
  },
  pageFootText: {
    position: "absolute",
    bottom: 30,
    left: 36,
    right: 36,
    fontSize: 7,
    color: C.muted,
    textAlign: "center",
  },
  contact: {
    position: "absolute",
    bottom: 21,
    left: 36,
    right: 36,
    fontSize: 7,
    color: C.ink,
    textAlign: "center",
  },
  jurisdiction: {
    position: "absolute",
    bottom: 12,
    left: 36,
    right: 36,
    fontSize: 6.5,
    color: C.muted,
    letterSpacing: 0.4,
    textAlign: "center",
  },
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function dimensions(box: PackageSnapshot): string {
  return `${trim(box.lengthCm)} x ${trim(box.widthCm)} x ${trim(box.heightCm)}`;
}

/**
 * The volumetric weight of the whole shipment, or null when it cannot be known.
 *
 * Derived here rather than stored, because it is not a fact about the shipment:
 * it is arithmetic on facts already in the snapshot, and deriving it means an
 * invoice issued before anybody thought to print it still prints it correctly.
 * Null when the snapshot predates the cargo (version 1) or when a booking was
 * taken without dimensions, and null prints nothing at all rather than 0.00 kg,
 * which would be a claim rather than a gap.
 */
function volumetricWeightOf(boxes: PackageSnapshot[]): number | null {
  if (boxes.length === 0) return null;

  const total = boxes.reduce((sum, box) => {
    const volume = box.lengthCm * box.widthCm * box.heightCm;
    if (!(volume > 0)) return sum;
    return sum + (volume / VOLUMETRIC_DIVISOR) * box.quantity;
  }, 0);

  return total > 0 ? total : null;
}

/**
 * True when naming the state after the city says the same thing twice.
 *
 * India has several where it does, and "Delhi, Delhi" reads as a data entry
 * error rather than as a place. Containment either way, so Delhi inside New
 * Delhi and Chandigarh inside Chandigarh both collapse.
 */
function restatesCity(city: string | null, state: string | null): boolean {
  const cityKey = city?.trim().toLowerCase() ?? "";
  const stateKey = state?.trim().toLowerCase() ?? "";
  if (!cityKey || !stateKey) return false;
  return cityKey.includes(stateKey) || stateKey.includes(cityKey);
}

/**
 * One end of the route, in the terms that end of the route is identified by.
 *
 * Domestic: city and state, because "Gurugram, India to Jaipur, India" says
 * India twice and locates nothing. International: city and country, because
 * the destination's state means nothing to a reader here.
 */
function routeEnd(party: PartySnapshot, mode: ShipmentMode): string {
  const city = party.city?.trim();
  const country = party.country?.trim();

  if (mode === ShipmentMode.DOMESTIC) {
    const state = restatesCity(party.city, party.state)
      ? null
      : party.state?.trim();
    return (
      [city, state].filter(Boolean).join(", ") || country || "Not recorded"
    );
  }

  return [city, country].filter(Boolean).join(", ") || "Not recorded";
}

/**
 * What was in a piece, as one line: "Cotton shirts x 40 (HSN 610510)".
 *
 * Quantities are multiplied by the number of identical pieces the row stands
 * for, so the line describes the row it sits under rather than one piece of it.
 */
function contentsLine(box: PackageSnapshot): string | null {
  if (box.contents.length === 0) return null;

  return box.contents
    .map((item) => {
      const quantity = item.quantity * box.quantity;
      const hs = item.hsCode ? ` (HSN ${item.hsCode})` : "";
      return `${item.description} x ${quantity}${hs}`;
    })
    .join("   ·   ");
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function TaxInvoiceDocument({
  data,
  variant = DEFAULT_INVOICE_VARIANT,
}: {
  data: InvoiceDocumentData;
  variant?: InvoiceVariant;
}) {
  const { seller, buyer, shipment } = data;
  const grid = variant === "grid";
  const cur = data.currency;

  const isCreditNote = data.docType === "CREDIT_NOTE";
  const title = isCreditNote ? "CREDIT NOTE" : "TAX INVOICE";

  const sellerNameLines = splitLegalName(seller.legalName);

  const gstColumnHead =
    data.taxRatePercent > 0 ? `GST @ ${data.taxRatePercent}%` : "GST";

  const lineTax = (line: (typeof data.lineItems)[number]) =>
    line.cgstAmount + line.sgstAmount + line.igstAmount;

  // ── Cargo ───────────────────────────────────────────────────────────────
  // Absent on invoices issued before snapshot version 2, so every use is
  // guarded rather than assumed.
  const boxes = shipment.packages ?? [];

  // All three weights, in the order the arithmetic runs: what it weighed, what
  // its size came to, and which of the two it was billed on. See the header.
  const actualWeight = kg(shipment.actualWeightKg);
  const chargeableWeight = kg(shipment.chargeableWeightKg);

  // Which of the two the chargeable weight was taken from, said in three words
  // under the figure. "Why is this more than my parcel weighs" is the single
  // most asked question about a freight invoice, and the answer is otherwise
  // only on the page as two numbers the reader has to compare themselves.
  //
  // ── ONLY WHEN IT IS TRUE ──────────────────────────────────────────────────
  // The note names one of the two weights, so it is printed ONLY when the
  // chargeable weight actually IS that weight. Carriers commonly bill a slabbed
  // figure, rounding up to the next half or whole kilo, and a contract rate can
  // bill something agreed instead: in either case the chargeable weight matches
  // neither number beside it, and a caption asserting that it is the volumetric
  // one is then a false statement on a tax invoice. It says nothing at all in
  // that case, and the band note above already gives the rule.
  const chargeableMatches = (weight: number | null): boolean =>
    weight !== null &&
    shipment.chargeableWeightKg !== null &&
    Math.abs(shipment.chargeableWeightKg - weight) < 0.005;

  const volumetricKg = volumetricWeightOf(boxes);

  const chargeableNote = chargeableMatches(volumetricKg)
    ? "the volumetric weight, being the higher"
    : chargeableMatches(shipment.actualWeightKg)
      ? "the actual weight, being the higher"
      : null;

  const declaredValue = boxes.reduce(
    (sum, box) => sum + (box.declaredValue ?? 0) * box.quantity,
    0,
  );
  const declaredCurrency =
    boxes.find((box) => box.declaredCurrency)?.declaredCurrency ?? "INR";

  // A column of blanks under a heading reads as missing data rather than as
  // inapplicable, and domestic bookings routinely declare no value.
  const showValues = declaredValue > 0;
  const multiPiece = boxes.some((box) => box.quantity > 1);

  // Fall back rather than print "undefined": invoices issued before these were
  // added to the issuer config still have to render from their own snapshot.
  const jurisdiction = seller.jurisdiction ?? "Delhi and Gurgaon";
  // The setting accepts several, comma separated. Normalised here rather than
  // trusted as typed: "a@x.com,b@x.com" with no space runs together on the
  // page and reads as one malformed address.
  const billingEmails = (seller.billingEmail ?? seller.email)
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .join(", ");

  const bookedOn = shipment.bookedAt
    ? formatInvoiceDate(new Date(shipment.bookedAt))
    : null;

  // The SAC every line on this invoice carries. A booking invoice is one
  // supply of one service, so there is exactly one, and stating it in the
  // party panel answers "what was this bill for" where the reader asks it.
  const sacCode =
    data.lineItems[0]?.sacCode ?? taxTreatmentFor(shipment.mode).sacCode;

  // `as` carries the printed wording where it differs from the head's name:
  // the state half is "SGST/UTGST", because a union territory supply is
  // charged UTGST under the same half and a document naming only SGST is wrong
  // for it. A zero-rated invoice names no rate at all, since "@ 0%" against a
  // zero figure reads as a rate that was applied rather than one that was not.
  const taxLabel = (head: "CGST" | "SGST" | "IGST", as: string = head) => {
    if (data.taxRatePercent === 0) return as;
    const rate = head === "IGST" ? data.taxRatePercent : data.taxRatePercent / 2;
    return `${as} @ ${trim(rate)}%`;
  };

  const sellerContact = [seller.email, seller.phone]
    .filter(Boolean)
    .join("    ");

  const headCell = grid ? s.headCellGrid : s.headCell;

  return (
    <Document
      title={`${title} ${data.invoiceNumber}`}
      author={seller.legalName}
      subject={`${title} for shipment ${shipment.shipmentNumber}`}
    >
      <Page size="A4" style={s.page}>
        {/* ── Masthead ─────────────────────────────────────────────────
            Mark and the issuer's full identity on the left, the document's
            own identity on the right. */}
        <View style={s.masthead}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image style={s.logo} src={ARENA_LOGO_DATA_URI} />
            <Text style={s.sellerName}>{seller.legalName}</Text>
            <Text style={s.sellerLine}>
              {[
                ...seller.addressLines.filter((l) => !!l?.trim()),
                seller.city,
                seller.stateName,
                seller.postalCode,
              ]
                .filter(Boolean)
                .join(", ")}
            </Text>
            {/* GSTIN, PAN and CIN on one line. CIN is guarded: an invoice
                issued before the field existed carries none in its frozen
                seller snapshot, and a bare "CIN" with nothing after it is
                worse than no CIN at all. */}
            <Text style={s.sellerIds}>
              {[
                `GSTIN ${seller.gstin}`,
                `PAN ${seller.pan}`,
                seller.cin ? `CIN ${seller.cin}` : null,
              ]
                .filter(Boolean)
                .join("    ")}
            </Text>
            {/* The issuer's own contact details, at content weight. Somebody
                querying a charge reads these off the page. An empty Text still
                takes a line's height, so an issuer with neither gets no row. */}
            {sellerContact ? (
              <Text style={s.sellerIds}>{sellerContact}</Text>
            ) : null}
          </View>

          <View style={s.mastheadRight}>
            <Text style={s.docTitle}>{title}</Text>
            <Text style={s.docCopy}>ORIGINAL FOR RECIPIENT</Text>
            <Text style={s.docNumber}>{data.invoiceNumber}</Text>
            <Text style={s.docDate}>
              {formatInvoiceDate(new Date(data.issueDate))}
            </Text>
            {data.status === "UNPAID" && (
              <Text style={s.statusMark}>UNPAID</Text>
            )}
            {data.status === "CANCELLED" && (
              <Text style={s.statusMark}>CANCELLED</Text>
            )}
          </View>
        </View>

        {/* ── Billed to, and the shipment ──────────────────────────────
            The two questions every reader arrives with, side by side in the
            one panel at the top of the page. The waybill and the two ends of
            the route are labelled facts here rather than a sentence: they are
            checked against other paperwork, not read. */}
        <Band label="Invoice details" variant={variant} keepTogether>
          <View style={grid ? t.panelGrid : t.panel}>
            <View style={t.panelColumn}>
              <Text style={t.panelLabel}>DETAILS OF RECEIVER (BILL TO)</Text>
              <Text style={s.partyName}>{buyer.legalName}</Text>
              <Text style={s.detail}>
                {[
                  ...buyer.addressLines,
                  [buyer.city, buyer.stateName, buyer.postalCode]
                    .filter(Boolean)
                    .join(", "),
                ]
                  .filter((l) => !!l?.trim())
                  .join("\n")}
              </Text>
              <Text style={s.detailInk}>
                GSTIN {buyer.gstin ?? "Unregistered"}
              </Text>
              {/* Spelled out AND coded. The name is what a person reads; the
                  two-digit code is what decides IGST against the CGST/SGST
                  split and what the recipient's own filing is checked
                  against. */}
              {buyer.stateName || buyer.stateCode ? (
                <Text style={s.detail}>
                  State{" "}
                  {[
                    buyer.stateName,
                    buyer.stateCode ? `(${buyer.stateCode})` : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </Text>
              ) : null}
              {buyer.email ? (
                <Text style={s.detail}>{buyer.email}</Text>
              ) : null}
              <Text style={s.detail}>
                Place of supply {data.placeOfSupplyCode}{" "}
                {data.placeOfSupplyName}
              </Text>
              <Text style={s.detail}>
                SAC {sacCode} {taxTreatmentFor(shipment.mode).sacDescription}
              </Text>
            </View>

            <View style={t.panelColumn}>
              <Text style={t.panelLabel}>SHIPMENT</Text>
              <Text style={s.shipmentNumber}>{shipment.shipmentNumber}</Text>

              {/* The waybill, set heavier than the facts around it. It is the
                  number a customer quotes back at us and the one their own
                  system files the shipment under. */}
              <View style={t.factLine}>
                <Text style={t.factLabel}>Waybill</Text>
                <Text style={s.awbValue}>
                  {shipment.awbNumber ?? "Issued on dispatch"}
                </Text>
              </View>

              <View style={t.factLine}>
                <Text style={t.factLabel}>From</Text>
                <Text style={s.routeValue}>
                  {routeEnd(shipment.origin, shipment.mode)}
                </Text>
              </View>
              <View style={t.factLine}>
                <Text style={t.factLabel}>To</Text>
                <Text style={s.routeValue}>
                  {routeEnd(shipment.destination, shipment.mode)}
                </Text>
              </View>

              <Fact
                label="Service"
                value={shipment.serviceName ?? "Arena freight service"}
                strong
              />
              <Fact
                label="Booked"
                value={
                  [
                    bookedOn,
                    shipment.mode === ShipmentMode.DOMESTIC
                      ? "domestic"
                      : `export${shipment.shipmentType ? `, ${shipment.shipmentType}` : ""}`,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Not recorded"
                }
              />
              {shipment.consignor && (
                <Fact
                  label="Shipper"
                  value={
                    shipment.consignor.companyName ??
                    shipment.consignor.name ??
                    "Not recorded"
                  }
                />
              )}
            </View>
          </View>
        </Band>

        {/* ── Cargo ──────────────────────────────────────────────────────
            The metrics, then one row per piece with its contents beneath.
            This is what the freight was charged on, so it belongs on the
            document that charges for it. */}
        <Band
          label="Cargo"
          variant={variant}
          note={
            showValues
              ? "Declared values are the shipper's, not amounts charged"
              : "Freight is charged on chargeable weight"
          }
        >
          <View style={t.metrics}>
            <Metric
              label="Pieces"
              value={`${shipment.packageCount} ${shipment.packageCount === 1 ? "piece" : "pieces"}`}
            />
            <Metric label="Actual weight" value={actualWeight} />
            <Metric label="Volumetric weight" value={kg(volumetricKg)} />
            <Metric
              label="Chargeable weight"
              value={chargeableWeight}
              note={chargeableNote}
            />
            {/* The currency rides in the value rather than the label. As
                "Declared value, INR" the label was the widest thing in the row
                and wrapped the metrics onto a second line, which the page
                cannot afford. */}
            {showValues && (
              <Metric
                label="Declared value"
                value={`${money(declaredValue, declaredCurrency)} ${declaredCurrency}`}
              />
            )}
          </View>

          {boxes.length > 0 && (
            <>
              <View style={grid ? s.cargoHeadGrid : s.cargoHead}>
                <Text style={[headCell, { width: CARGO.index }]}>#</Text>
                <Text style={[headCell, { flex: 1, paddingRight: 12 }]}>
                  DESCRIPTION AND CONTENTS
                </Text>
                <Text
                  style={[
                    headCell,
                    { width: CARGO.dimensions, textAlign: "right" },
                  ]}
                >
                  {multiPiece ? "SIZE PER PIECE, CM" : "SIZE, CM"}
                </Text>
                {multiPiece && (
                  <Text
                    style={[
                      headCell,
                      { width: CARGO.pieces, textAlign: "right" },
                    ]}
                  >
                    PIECES
                  </Text>
                )}
                <Text
                  style={[
                    headCell,
                    { width: CARGO.weight, textAlign: "right" },
                  ]}
                >
                  WEIGHT
                </Text>
                {showValues && (
                  <Text
                    style={[
                      headCell,
                      { width: CARGO.value, textAlign: "right" },
                    ]}
                  >
                    VALUE
                  </Text>
                )}
              </View>

              {!grid && <View style={t.rule} />}

              {boxes.map((box, i) => {
                const contents = contentsLine(box);

                return (
                  <View
                    key={i}
                    wrap={false}
                    style={
                      grid ? [s.rowRuled, i % 2 === 1 ? s.rowZebra : {}] : {}
                    }
                  >
                    <View style={grid ? s.boxRowGrid : s.boxRow}>
                      <Text style={s.boxIndex}>{i + 1}</Text>
                      <Text style={s.boxName}>{box.description}</Text>
                      <Text
                        style={[s.boxCellMuted, { width: CARGO.dimensions }]}
                      >
                        {dimensions(box)}
                      </Text>
                      {multiPiece && (
                        <Text style={[s.boxCell, { width: CARGO.pieces }]}>
                          {box.quantity}
                        </Text>
                      )}
                      <Text style={[s.boxCell, { width: CARGO.weight }]}>
                        {(box.weightKg * box.quantity).toFixed(2)} kg
                      </Text>
                      {showValues && (
                        <Text style={[s.boxCell, { width: CARGO.value }]}>
                          {box.declaredValue
                            ? money(
                                box.declaredValue * box.quantity,
                                declaredCurrency,
                              )
                            : ""}
                        </Text>
                      )}
                    </View>
                    {contents && (
                      <Text style={grid ? s.boxContentsGrid : s.boxContents}>
                        {contents}
                      </Text>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </Band>

        {/* ── Charges ────────────────────────────────────────────────────
            The breakdown the customer actually asked for: every component
            they were charged, what it was worth before tax, the tax on it,
            and what it cost them. Amounts are the tax-inclusive figures, so
            the last column adds up to the number that left their wallet.

            The tax column is headed with the heads the tax actually falls
            under, CGST+SGST within the state and IGST across it, so the
            column reconciles against the totals panel without a reader
            having to work out which supply this was. */}
        <Band
          label="Charges"
          variant={variant}
          note="Amounts include GST"
          // Kept whole at ordinary length: a charges table split across a page
          // break loses its column heads on the second half, and a column of
          // unlabelled figures on a tax invoice is worse than a page that ends
          // early. Long ones still wrap, since a block taller than a page
          // would be clipped rather than moved.
          keepTogether={data.lineItems.length <= 10}
        >
          <View style={grid ? s.tableHeadGrid : s.tableHead}>
            <Text style={[headCell, { width: COL.sno, paddingRight: 4 }]}>
              S.NO
            </Text>
            <View style={s.rowDescription}>
              <Text style={headCell}>DESCRIPTION</Text>
            </View>
            <Text style={[headCell, { width: COL.sac, textAlign: "right" }]}>
              SAC
            </Text>
            <Text
              style={[headCell, { width: COL.taxable, textAlign: "right" }]}
            >
              TAXABLE
            </Text>
            <Text style={[headCell, { width: COL.gst, textAlign: "right" }]}>
              {data.taxRatePercent > 0
                ? data.isIntraState
                  ? "CGST+SGST"
                  : "IGST"
                : gstColumnHead.toUpperCase()}
            </Text>
            <Text style={[headCell, { width: COL.amount, textAlign: "right" }]}>
              AMOUNT
            </Text>
          </View>

          {!grid && <View style={t.rule} />}

          {data.lineItems.map((line, i) => (
            <View
              key={i}
              style={grid ? [s.rowGrid, i % 2 === 1 ? s.rowZebra : {}] : s.row}
              wrap={false}
            >
              <Text style={[s.cellIndex, { width: COL.sno }]}>{i + 1}</Text>
              <View style={s.rowDescription}>
                <Text style={s.descriptionText}>{line.description}</Text>
              </View>
              <Text style={[s.cellMuted, { width: COL.sac }]}>
                {line.sacCode}
              </Text>
              <Text style={[s.cell, { width: COL.taxable }]}>
                {money(line.taxableValue, cur)}
              </Text>
              <Text style={[s.cell, { width: COL.gst }]}>
                {money(lineTax(line), cur)}
              </Text>
              <Text style={[s.cellStrong, { width: COL.amount }]}>
                {money(line.lineTotal, cur)}
              </Text>
            </View>
          ))}
        </Band>

        {/* Rule 46(o). Stated in words rather than left to be inferred from
            the absence of tax, and stated on every invoice including the
            ordinary ones where the answer is no. */}
        <View style={s.reverseChargeLine} wrap={false}>
          <Text style={s.reverseChargeLabel}>
            Whether tax is payable under reverse charge:
          </Text>
          <Text style={s.reverseChargeValue}>NO</Text>
        </View>

        {/* ── Payment, terms and the total ───────────────────────────── */}
        <View style={s.bottomRow} wrap={false}>
          <View style={s.bottomLeft}>
            <Text style={s.declaration}>{seller.declaration}</Text>

            {/* Where to send the money, in the one tinted block on the page.
                See C.payPanel in the shared theme for why this is allowed to
                stand out when everything around it is deliberately quiet. */}
            <PaymentPanel
              bank={seller.bank}
              issuerName={seller.legalName}
              variant={variant}
            />

            {/* The terms carry no heading of their own. The tinted block above
                is the anchor this column needed, and a second label under it
                was fifteen points the page does not have. */}
            <View style={{ marginTop: seller.bank ? 7 : 0 }}>
              {/* Numbered and in two columns, through the shared block, so the
                  clauses read identically on this invoice and on a manual one
                  the same customer receives in the same month. */}
              {/* Built from the SNAPSHOT, never from the live issuer config.
                  Clause 1 names the payee, and reading that from the
                  environment would print today's company name on an invoice
                  issued under the old one, or "REPLACE ME PRIVATE LIMITED" on
                  a machine where the issuer variables are not set. */}
              <TermsBlock terms={invoiceTermsFor(shipment.mode, seller)} />

              {data.taxNote && (
                <Text style={[s.footerText, s.footerGap]}>{data.taxNote}</Text>
              )}

              {/* Cash on delivery is the courier collecting the goods value
                  from the receiver on the shipper's behalf. It is not how this
                  invoice is settled, and saying so is cheaper than answering
                  the question every time it is asked. */}
              {shipment.codAmount ? (
                <Text style={[s.footerText, s.footerGap]}>
                  Cash on delivery of {money(shipment.codAmount, cur)} {cur} is
                  collected from the consignee by the courier and remitted to
                  the shipper. It is not part of this invoice.
                </Text>
              ) : null}
            </View>
          </View>

          <View style={s.bottomRight}>
            <View style={[s.totalsPanel, ...(grid ? [s.totalsPanelGrid] : [])]}>
              {/* No separate "service amount" row here, unlike the manual
                  invoice. A booking invoice has no discount to subtract, so
                  the gross of the charges IS the taxable value, and two rows
                  carrying the identical figure teach a reader that one of them
                  means nothing. */}
              <TotalsRow
                label="Taxable value"
                value={money(data.taxableValue, cur)}
              />

              {/* ── EVERY HEAD, EVERY TIME ──────────────────────────────
                Within the state the tax splits half to the centre and half to
                the state; across a state border it is one IGST line. Only one
                of those can carry a figure, and the other heads are printed at
                zero rather than omitted.

                Stating them is what makes the document reconcile without
                arithmetic: a reader who finds CGST, SGST and IGST all present
                knows which one was charged, whereas a reader who finds only
                IGST cannot tell a cross-border supply from a template that
                dropped a row. Cess is on the same footing and is always zero
                today: courier and freight services attract none, and there is
                no cess field anywhere in the money engine. */}
              <TotalsRow
                label={taxLabel("CGST")}
                value={money(data.cgstAmount, cur)}
              />
              <TotalsRow
                label={taxLabel("SGST", "SGST/UTGST")}
                value={money(data.sgstAmount, cur)}
              />
              <TotalsRow
                label={taxLabel("IGST")}
                value={money(data.igstAmount, cur)}
              />
              <TotalsRow label="CESS" value={money(0, cur)} />
              <TotalsRow label="Currency" value={cur} />

              <View style={s.totalsRule} />

              <View style={s.grandRow}>
                <Text style={s.grandLabel}>TOTAL {cur}</Text>
                <Text style={s.grandValue}>{money(data.total, cur)}</Text>
              </View>

              <Text
                style={[
                  s.paymentNote,
                  ...(data.status === "UNPAID" ? [s.paymentNoteAlert] : []),
                ]}
              >
                {data.paymentNote}
              </Text>
            </View>

            {/* ── Signature ────────────────────────────────────────────
              Directly under the total, which is both where an Indian tax
              invoice conventionally signs and the only place it fits. It used
              to sit in a full-width row of its own below this one; that row
              was the last sixty points on the page and it was pushing the
              whole block onto a second sheet. The declaration went with it,
              down into the terms column on the left, where it reads as the
              statement it is rather than as a caption to the signature. */}
            <View style={s.signature}>
              <Text style={s.signatureFor}>For</Text>
              {sellerNameLines.map((line, i) => (
                <Text key={i} style={s.signatureName}>
                  {line}
                </Text>
              ))}
              <Text style={s.signatureRole}>Authorised signatory</Text>
            </View>
          </View>
        </View>

        {/* ── the two figures a payer acts on ──────────────────────────────
            Full width and under the panel rather than inside it. The amount in
            words is a long line and wraps to three inside the totals column,
            and the amount due is the number an accounts department looks for
            first: neither belongs squeezed into the narrowest column on the
            page. */}
        <View style={s.dueStrip} wrap={false}>
          <Text style={s.words}>
            <Text style={s.wordsLabel}>TOTAL IN WORDS   </Text>
            {amountInWords(data.total, cur)}
          </Text>
          <Text style={s.dueLabel}>Amount due for payment</Text>
          <Text style={s.dueValue}>{money(data.total, cur)}</Text>
        </View>

        {/* Separately positioned fixed elements with static text.
            Not a preference: on a page this full, react-pdf silently drops both
            a fixed wrapper View holding these as children and any Text using
            the `render` callback, so the whole footer, or just the clause,
            renders as nothing at all. It fails without an error, which is why
            it is worth a comment. A jurisdiction clause that is missing from
            the document is not a clause.

            The waybill rides in the footer alongside the invoice and shipment
            numbers, so a second sheet that comes loose can still be put back
            against the right consignment. */}
        <View style={s.pageFootRule} fixed />
        <Text style={s.pageFootText} fixed>
          {[
            data.invoiceNumber,
            `Shipment ${shipment.shipmentNumber}`,
            shipment.awbNumber ? `AWB ${shipment.awbNumber}` : null,
          ]
            .filter(Boolean)
            .join("   ")}
        </Text>
        {/* Where a billing question goes, and where the rest of the story is.
            Every mailbox in the setting is printed: billing at Arena reaches
            more than one person, and an invoice naming one of them sends half
            the queries to somebody who cannot answer them. */}
        <Text style={s.contact} fixed>
          {[
            `Computer generated invoice. Billing queries: ${billingEmails}`,
            seller.website ? `More at ${seller.website}` : null,
          ]
            .filter(Boolean)
            .join("    ")}
        </Text>
        <Text style={s.jurisdiction} fixed>
          E. &amp; O.E.   SUBJECT TO THE JURISDICTION OF THE COURTS OF{" "}
          {jurisdiction.toUpperCase()} ONLY
        </Text>
      </Page>
    </Document>
  );
}
