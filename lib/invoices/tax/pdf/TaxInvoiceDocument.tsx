/**
 * lib/invoices/tax/pdf/TaxInvoiceDocument.tsx
 *
 * The tax invoice, as a document.
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
 *   - The route is one line, not a diagram. It is a fact, not a feature.
 *   - The cargo is four metrics and a table with one row per box.
 *
 * Before adding anything, render both samples and check the page count:
 *   npx tsx scripts/renderSampleInvoice.tsx
 * A shipment with more boxes or a longer breakdown will still flow onto a
 * second page. That is correct, and the wrap rules below make the break fall
 * between blocks rather than through one.
 *
 * ── DESIGN RULES, AND WHY ───────────────────────────────────────────────────
 * Minimal typographic. Structure comes from whitespace, alignment and weight.
 * Rules and fills do only the work whitespace cannot.
 *
 * There are exactly TWO filled panels, and the count is the rule:
 *
 *   1. Who is billed, and for which shipment. The two questions every reader
 *      arrives with.
 *   2. The total. The one figure the invoice exists to state.
 *
 * A third would make both ordinary. Everything else is separated by air and
 * hairlines. Borders around every block are what make an invoice look like it
 * came out of 2004 accounting software.
 *
 * ── HIERARCHY ───────────────────────────────────────────────────────────────
 * Four tiers, and everything on the page is in exactly one of them, so a reader
 * scanning for a single fact knows where to stop looking:
 *
 *   1. The total, and the mark and title. Largest, read from across a desk.
 *   2. Section labels. Small, letter-spaced, grey, above a hairline. Signposts,
 *      not content, so they are quiet but unmissable.
 *   3. The answer to each section: company name, shipment number, cargo
 *      metrics, charge description, amount.
 *   4. Supporting detail: addresses, SAC codes, dimensions, terms. Grey and
 *      smaller.
 *
 * Colour is functional only: near-black for content, grey for support, one
 * near-white fill for the two panels, and one muted red for the UNPAID and
 * CANCELLED marks. Nothing is coloured to look nice.
 *
 * ── WHAT THE PAGE MUST CARRY ────────────────────────────────────────────────
 * Rule 46 of the CGST Rules: supplier identity and GSTIN, a consecutive serial,
 * the date, the recipient's identity and GSTIN, place of supply, SAC,
 * description, taxable value, rate, tax amount, whether tax is payable on
 * reverse charge, and a signature. On top of that, what a logistics invoice is
 * actually queried about: the route, the service bought, the waybill, and the
 * boxes with what was in them.
 *
 * Declared values of cargo are printed but never added to anything. They are
 * the shipper's statement for customs, not money Arena charged, and the section
 * says so where the number appears.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Renders from InvoiceDocumentData ONLY, never from a live record. Every value
 * here was frozen when the invoice was issued. Fields added at snapshot version
 * 2 (the cargo, the waybill, the customs category) are optional and every one
 * is guarded: an invoice issued at version 1 still renders, just without the
 * sections it never knew about.
 *
 * Helvetica throughout: it is built into @react-pdf/renderer, so the render has
 * no font fetch to fail on, which matters for something running in a background
 * job. The logo is embedded for the same reason; see ./logo.ts.
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

import { formatInvoiceDate } from "../gst";
import { amountInWords } from "../money";
import { invoiceTermsFor } from "../config";
import type {
  InvoiceDocumentData,
  PackageSnapshot,
  PartySnapshot,
} from "../types";
import { ARENA_LOGO_DATA_URI } from "./logo";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const C = {
  ink: "#101828", // tier 3, the content
  muted: "#667085", // tier 2 and 4, labels and support
  faint: "#98A2B3", // the quietest tier, used sparingly
  rule: "#E4E7EC", // section rules, deliberately lighter than the eye expects
  ruleStrong: "#98A2B3", // the one rule above the total
  panel: "#F8FAFB", // the two panels. Barely a fill, on purpose
  panelRule: "#E4E7EC",
  alert: "#B42318", // unpaid / cancelled only
};

/** Right-hand columns of the charges table. Shared by the head and the rows. */
const COL = {
  sac: 46,
  taxable: 66,
  gst: 62,
  amount: 74,
};

/** Columns of the cargo table. Shared by the head and the box rows. */
const CARGO = {
  index: 24,
  dimensions: 88,
  boxes: 34,
  weight: 56,
  value: 74,
};

const s = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 44,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: C.ink,
    lineHeight: 1.4,
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
  logo: { width: 118, marginBottom: 6 },
  sellerName: { fontSize: 9, fontFamily: "Helvetica-Bold", lineHeight: 1.3 },
  sellerLine: { fontSize: 7.5, color: C.muted, lineHeight: 1.5 },
  sellerIds: { fontSize: 7.5, color: C.ink, lineHeight: 1.5 },

  mastheadRight: { alignItems: "flex-end", paddingLeft: 20 },
  docTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    textAlign: "right",
  },
  docCopy: {
    fontSize: 6.5,
    color: C.faint,
    letterSpacing: 0.9,
    textAlign: "right",
    marginTop: 3,
  },
  docNumber: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    marginTop: 8,
  },
  docDate: { fontSize: 8, color: C.muted, textAlign: "right", marginTop: 2 },
  statusMark: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    color: C.alert,
    textAlign: "right",
    marginTop: 4,
  },

  // ── section band ──
  // Every band opens the same way: a grey letter-spaced label, then a hairline,
  // then content. One repeated shape means the reader learns the page once.
  band: { marginTop: 11 },
  bandHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  label: { fontSize: 7, color: C.muted, letterSpacing: 1.1 },
  labelNote: { fontSize: 7, color: C.faint, letterSpacing: 0.4 },
  rule: { borderTopWidth: 0.5, borderTopColor: C.rule },

  // ── panel ──
  panel: {
    marginTop: 8,
    flexDirection: "row",
    backgroundColor: C.panel,
    borderWidth: 0.5,
    borderColor: C.panelRule,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  panelColumn: { width: "50%", paddingRight: 14 },
  panelLabel: {
    fontSize: 6.5,
    color: C.faint,
    letterSpacing: 0.9,
    marginBottom: 4,
  },
  partyName: { fontSize: 9.5, fontFamily: "Helvetica-Bold", lineHeight: 1.3 },
  detail: { fontSize: 8, color: C.muted, lineHeight: 1.5 },
  detailInk: { fontSize: 8, color: C.ink, lineHeight: 1.5 },

  // A labelled line: grey label at a fixed width, value beside it. Reads as a
  // list of answers rather than a paragraph, and costs one line each.
  factLine: { flexDirection: "row", marginTop: 2 },
  factLabel: { width: 52, fontSize: 7.5, color: C.faint },
  factValue: { flex: 1, fontSize: 8, lineHeight: 1.35 },
  factValueStrong: { flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold" },
  // The route. One line, at content weight: it is a fact like the others, and
  // setting it any larger was making the top of the page shout.
  routeLine: { fontSize: 8.5, marginTop: 3, lineHeight: 1.35 },
  shipmentNumber: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },

  // ── cargo metrics ──
  // Four or five short label-and-value pairs on one line. Auto width rather
  // than a fixed grid, because these are read across as a summary, not scanned
  // down as a column.
  metrics: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  metric: { paddingRight: 30, paddingBottom: 2 },
  metricLabel: { fontSize: 6.5, color: C.faint, letterSpacing: 0.9 },
  metricValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 2,
    lineHeight: 1.25,
  },

  // ── cargo table ──
  // One row per box, with its contents on a grey line beneath. Nesting a second
  // table inside the first was accurate and hard to read; this says the same
  // thing in half the height.
  cargoHead: { flexDirection: "row", paddingTop: 8, paddingBottom: 5 },
  headCell: { fontSize: 6.5, color: C.muted, letterSpacing: 0.9 },
  boxRow: { flexDirection: "row", paddingTop: 6 },
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

  // ── charges table ──
  tableHead: { flexDirection: "row", paddingTop: 5, paddingBottom: 5 },
  row: { flexDirection: "row", paddingTop: 5.5, paddingBottom: 1 },
  rowDescription: { flex: 1, paddingRight: 14 },
  descriptionText: { fontSize: 9, lineHeight: 1.3 },
  cell: { fontSize: 8.5, textAlign: "right" },
  cellMuted: { fontSize: 8, color: C.muted, textAlign: "right" },
  cellStrong: { fontSize: 9, textAlign: "right" },

  // ── the bottom block ──
  // Terms on the left, the total on the right, on one row. The charges table
  // leaves the bottom left of the page empty and the footer used to sit below
  // it; putting the two side by side is what buys the last hundred points and
  // it is where an invoice reader looks for both anyway.
  bottomRow: { flexDirection: "row", marginTop: 11, alignItems: "flex-start" },
  bottomLeft: { flex: 1, paddingRight: 22 },
  totalsPanel: {
    width: 268,
    backgroundColor: C.panel,
    borderWidth: 0.5,
    borderColor: C.panelRule,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  totalsLabel: { fontSize: 8.5, color: C.muted },
  totalsValue: { fontSize: 8.5, textAlign: "right" },
  totalsRule: {
    borderTopWidth: 0.75,
    borderTopColor: C.ruleStrong,
    marginTop: 4,
    marginBottom: 7,
  },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  grandLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  grandValue: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "right" },
  words: { fontSize: 7.5, color: C.muted, marginTop: 5, textAlign: "right" },
  paymentNote: { fontSize: 8, marginTop: 5, textAlign: "right" },
  paymentNoteAlert: { color: C.alert, fontFamily: "Helvetica-Bold" },

  // ── footer ──
  footerText: { fontSize: 7, color: C.muted, lineHeight: 1.55 },
  footerGap: { marginTop: 6 },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 12,
  },
  signature: { alignItems: "flex-end" },
  signatureFor: { fontSize: 7.5, color: C.muted },
  signatureName: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    lineHeight: 1.3,
  },
  signatureRole: { fontSize: 7.5, color: C.muted, marginTop: 16 },
  declaration: { width: "58%", fontSize: 7, color: C.faint, lineHeight: 1.5 },

  // ── fixed foot of page ──
  // Two separately positioned elements, each measured from the bottom edge, so
  // nothing here depends on the flow above it having ended anywhere.
  pageFootRule: {
    position: "absolute",
    bottom: 36,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
  },
  pageFootText: {
    position: "absolute",
    bottom: 27,
    left: 40,
    right: 40,
    fontSize: 6.5,
    color: C.faint,
    textAlign: "center",
  },
  jurisdiction: {
    position: "absolute",
    bottom: 17,
    left: 40,
    right: 40,
    fontSize: 6.5,
    color: C.muted,
    letterSpacing: 0.9,
    textAlign: "center",
  },
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** 1,23,456.78 — Indian grouping, which is what the reader expects. */
function money(amount: number): string {
  const negative = amount < 0;
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, fraction] = fixed.split(".");

  // Last three digits, then pairs.
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest
    ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`
    : last3;

  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

function weight(kg: number | null): string | null {
  return kg === null ? null : `${kg.toFixed(2)} kg`;
}

/** 40.5 → "40.5", 40 → "40". Dimensions are read, not totalled. */
function trim(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function dimensions(box: PackageSnapshot): string {
  return `${trim(box.lengthCm)} x ${trim(box.widthCm)} x ${trim(box.heightCm)}`;
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
    return [city, state].filter(Boolean).join(", ") || country || "Not recorded";
  }

  return [city, country].filter(Boolean).join(", ") || "Not recorded";
}

/**
 * Break a company's legal name across two lines at the word boundary that makes
 * the two halves closest in length.
 *
 * Used above the signature, where the column is narrow. Balancing rather than
 * filling matters because a 40 character line over a 6 character line reads as
 * a typo, not a design.
 */
function splitLegalName(name: string): [string] | [string, string] {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return [name.trim()];

  let bestIndex = 1;
  let bestDelta = Infinity;

  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(" ").length;
    const right = words.slice(i).join(" ").length;
    const delta = Math.abs(left - right);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }

  return [words.slice(0, bestIndex).join(" "), words.slice(bestIndex).join(" ")];
}

/**
 * What was in a box, as one line: "Cotton shirts x 40 (HSN 610510)".
 *
 * Quantities are multiplied by the number of identical boxes the row stands
 * for, so the line describes the row it sits under rather than one box of it.
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
// Pieces
// ---------------------------------------------------------------------------

/** A section: grey label, hairline, content. The page's one repeated shape. */
function Band({
  label,
  note,
  keepTogether,
  children,
}: {
  label: string;
  note?: string | null;
  /**
   * Move the whole band to the next page rather than let a break fall inside
   * it. For the short, indivisible ones: a section label stranded at the foot
   * of a page with its content overleaf is what makes an invoice that does
   * overflow look like an accident. Never set on a band that can outgrow a
   * page, since a block taller than the page is clipped rather than moved.
   */
  keepTogether?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={s.band} wrap={!keepTogether}>
      <View style={s.bandHead}>
        <Text style={s.label}>{label.toUpperCase()}</Text>
        {note ? <Text style={s.labelNote}>{note}</Text> : null}
      </View>
      <View style={s.rule} />
      {children}
    </View>
  );
}

function Fact({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={s.factLine}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={strong ? s.factValueStrong : s.factValue}>{value}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metric}>
      <Text style={s.metricLabel}>{label.toUpperCase()}</Text>
      <Text style={s.metricValue}>{value}</Text>
    </View>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.totalsRow}>
      <Text style={s.totalsLabel}>{label}</Text>
      <Text style={s.totalsValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function TaxInvoiceDocument({ data }: { data: InvoiceDocumentData }) {
  const { seller, buyer, shipment } = data;

  const isCreditNote = data.docType === "CREDIT_NOTE";
  const title = isCreditNote ? "CREDIT NOTE" : "TAX INVOICE";

  const sellerNameLines = splitLegalName(seller.legalName);

  const chargeableWeight = weight(shipment.chargeableWeightKg);
  const actualWeight = weight(shipment.actualWeightKg);

  const gstColumnHead =
    data.taxRatePercent > 0 ? `GST @ ${data.taxRatePercent}%` : "GST";

  const lineTax = (line: (typeof data.lineItems)[number]) =>
    line.cgstAmount + line.sgstAmount + line.igstAmount;

  // ── Cargo ───────────────────────────────────────────────────────────────
  // Absent on invoices issued before snapshot version 2, so every use is
  // guarded rather than assumed.
  const packages = shipment.packages ?? [];

  const declaredValue = packages.reduce(
    (sum, box) => sum + (box.declaredValue ?? 0) * box.quantity,
    0,
  );
  const declaredCurrency =
    packages.find((box) => box.declaredCurrency)?.declaredCurrency ?? "INR";

  // A column of blanks under a heading reads as missing data rather than as
  // inapplicable, and domestic bookings routinely declare no value.
  const showValues = declaredValue > 0;
  const multiBox = packages.some((box) => box.quantity > 1);

  // Fall back rather than print "undefined": invoices issued before these were
  // added to the issuer config still have to render from their own snapshot.
  const jurisdiction = seller.jurisdiction ?? "Delhi and Gurgaon";
  const billingEmail = seller.billingEmail ?? seller.email;

  const bookedOn = shipment.bookedAt
    ? formatInvoiceDate(new Date(shipment.bookedAt))
    : null;

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
            <Text style={s.sellerIds}>
              GSTIN {seller.gstin}   PAN {seller.pan}
            </Text>
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
            one panel at the top of the page. The route is a line here, not a
            diagram: it is a fact like the waybill and the service. */}
        <Band label="Invoice details" keepTogether>
          <View style={s.panel}>
            <View style={s.panelColumn}>
              <Text style={s.panelLabel}>BILLED TO</Text>
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
              <Text style={s.detail}>
                Place of supply {data.placeOfSupplyName} (
                {data.placeOfSupplyCode})
              </Text>
            </View>

            <View style={s.panelColumn}>
              <Text style={s.panelLabel}>SHIPMENT</Text>
              <Text style={s.shipmentNumber}>{shipment.shipmentNumber}</Text>
              <Text style={s.routeLine}>
                {routeEnd(shipment.origin, shipment.mode)}  to{"  "}
                {routeEnd(shipment.destination, shipment.mode)}
              </Text>

              <Fact
                label="Service"
                value={shipment.serviceName ?? "Arena freight service"}
                strong
              />
              <Fact
                label="Waybill"
                value={shipment.awbNumber ?? "Issued on dispatch"}
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
            Four metrics, then one row per box with its contents beneath.
            This is what the freight was charged on, so it belongs on the
            document that charges for it. */}
        <Band
          label="Cargo"
          note={
            showValues
              ? "Declared values are the shipper's, not amounts charged"
              : "Freight is charged on chargeable weight"
          }
        >
          <View style={s.metrics}>
            <Metric
              label="Packages"
              value={`${shipment.packageCount} ${shipment.packageCount === 1 ? "box" : "boxes"}`}
            />
            {actualWeight && <Metric label="Actual weight" value={actualWeight} />}
            {chargeableWeight && (
              <Metric label="Chargeable weight" value={chargeableWeight} />
            )}
            {showValues && (
              <Metric
                label={`Declared value, ${declaredCurrency}`}
                value={money(declaredValue)}
              />
            )}
          </View>

          {packages.length > 0 && (
            <>
              <View style={s.cargoHead}>
                <Text style={[s.headCell, { width: CARGO.index }]}>BOX</Text>
                <Text style={[s.headCell, { flex: 1, paddingRight: 12 }]}>
                  DESCRIPTION AND CONTENTS
                </Text>
                <Text
                  style={[
                    s.headCell,
                    { width: CARGO.dimensions, textAlign: "right" },
                  ]}
                >
                  {multiBox ? "SIZE PER BOX, CM" : "SIZE, CM"}
                </Text>
                {multiBox && (
                  <Text
                    style={[s.headCell, { width: CARGO.boxes, textAlign: "right" }]}
                  >
                    BOXES
                  </Text>
                )}
                <Text
                  style={[s.headCell, { width: CARGO.weight, textAlign: "right" }]}
                >
                  WEIGHT
                </Text>
                {showValues && (
                  <Text
                    style={[s.headCell, { width: CARGO.value, textAlign: "right" }]}
                  >
                    VALUE
                  </Text>
                )}
              </View>

              <View style={s.rule} />

              {packages.map((box, i) => {
                const contents = contentsLine(box);

                return (
                  <View key={i} wrap={false}>
                    <View style={s.boxRow}>
                      <Text style={s.boxIndex}>{i + 1}</Text>
                      <Text style={s.boxName}>{box.description}</Text>
                      <Text
                        style={[s.boxCellMuted, { width: CARGO.dimensions }]}
                      >
                        {dimensions(box)}
                      </Text>
                      {multiBox && (
                        <Text style={[s.boxCell, { width: CARGO.boxes }]}>
                          {box.quantity}
                        </Text>
                      )}
                      <Text style={[s.boxCell, { width: CARGO.weight }]}>
                        {(box.weightKg * box.quantity).toFixed(2)} kg
                      </Text>
                      {showValues && (
                        <Text style={[s.boxCell, { width: CARGO.value }]}>
                          {box.declaredValue
                            ? money(box.declaredValue * box.quantity)
                            : ""}
                        </Text>
                      )}
                    </View>
                    {contents && <Text style={s.boxContents}>{contents}</Text>}
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
            the last column adds up to the number that left their wallet. */}
        <Band
          label="Charges"
          note="Amounts include GST"
          // Kept whole at ordinary length: a charges table split across a page
          // break loses its column heads on the second half, and a column of
          // unlabelled figures on a tax invoice is worse than a page that ends
          // early. Long ones still wrap, since a block taller than a page
          // would be clipped rather than moved.
          keepTogether={data.lineItems.length <= 10}
        >
          <View style={s.tableHead}>
            <View style={s.rowDescription}>
              <Text style={s.headCell}>DESCRIPTION</Text>
            </View>
            <Text style={[s.headCell, { width: COL.sac, textAlign: "right" }]}>
              SAC
            </Text>
            <Text style={[s.headCell, { width: COL.taxable, textAlign: "right" }]}>
              TAXABLE
            </Text>
            <Text style={[s.headCell, { width: COL.gst, textAlign: "right" }]}>
              {gstColumnHead.toUpperCase()}
            </Text>
            <Text style={[s.headCell, { width: COL.amount, textAlign: "right" }]}>
              AMOUNT
            </Text>
          </View>

          <View style={s.rule} />

          {data.lineItems.map((line, i) => (
            <View key={i} style={s.row} wrap={false}>
              <View style={s.rowDescription}>
                <Text style={s.descriptionText}>{line.description}</Text>
              </View>
              <Text style={[s.cellMuted, { width: COL.sac }]}>{line.sacCode}</Text>
              <Text style={[s.cell, { width: COL.taxable }]}>
                {money(line.taxableValue)}
              </Text>
              <Text style={[s.cell, { width: COL.gst }]}>
                {money(lineTax(line))}
              </Text>
              <Text style={[s.cellStrong, { width: COL.amount }]}>
                {money(line.lineTotal)}
              </Text>
            </View>
          ))}
        </Band>

        {/* ── Terms and the total ────────────────────────────────────── */}
        <View style={s.bottomRow} wrap={false}>
          <View style={s.bottomLeft}>
            <View style={s.bandHead}>
              <Text style={s.label}>PAYMENT AND TERMS</Text>
            </View>
            <View style={s.rule} />

            {seller.bank && (
              <Text style={[s.footerText, s.footerGap]}>
                {seller.bank.bankName}
                {seller.bank.branch ? `, ${seller.bank.branch}` : ""}
                {"\n"}
                A/C {seller.bank.accountNumber}
                {"\n"}
                IFSC {seller.bank.ifsc}
              </Text>
            )}
            <Text style={s.footerText}>Tax payable on reverse charge: No</Text>

            {data.taxNote && (
              <Text style={[s.footerText, s.footerGap]}>{data.taxNote}</Text>
            )}

            <Text style={[s.footerText, s.footerGap]}>
              {invoiceTermsFor(shipment.mode).join("\n")}
            </Text>

            {/* Cash on delivery is the courier collecting the goods value from
                the receiver on the shipper's behalf. It is not how this invoice
                is settled, and saying so is cheaper than answering the question
                every time it is asked. */}
            {shipment.codAmount ? (
              <Text style={[s.footerText, s.footerGap]}>
                Cash on delivery of {money(shipment.codAmount)} {data.currency}{" "}
                is collected from the consignee by the courier and remitted to
                the shipper. It is not part of this invoice.
              </Text>
            ) : null}
          </View>

          <View style={s.totalsPanel}>
            <TotalsRow label="Taxable value" value={money(data.taxableValue)} />

            {data.taxRatePercent > 0 && data.isIntraState && (
              <>
                <TotalsRow
                  label={`CGST @ ${data.taxRatePercent / 2}%`}
                  value={money(data.cgstAmount)}
                />
                <TotalsRow
                  label={`SGST @ ${data.taxRatePercent / 2}%`}
                  value={money(data.sgstAmount)}
                />
              </>
            )}

            {data.taxRatePercent > 0 && !data.isIntraState && (
              <TotalsRow
                label={`IGST @ ${data.taxRatePercent}%`}
                value={money(data.igstAmount)}
              />
            )}

            {data.taxRatePercent === 0 && (
              <TotalsRow label="GST" value={money(0)} />
            )}

            <View style={s.totalsRule} />

            <View style={s.grandRow}>
              <Text style={s.grandLabel}>TOTAL {data.currency}</Text>
              <Text style={s.grandValue}>{money(data.total)}</Text>
            </View>

            <Text style={s.words}>
              {amountInWords(data.total, data.currency)}
            </Text>

            <Text
              style={[
                s.paymentNote,
                ...(data.status === "UNPAID" ? [s.paymentNoteAlert] : []),
              ]}
            >
              {data.paymentNote}
            </Text>
          </View>
        </View>

        {/* ── Declaration and signature ──────────────────────────────
            Both belong at the foot of the page and neither needs full width,
            so they share a row. Stacking them is what pushed the signature
            onto a second sheet. */}
        <View style={s.signatureRow} wrap={false}>
          <Text style={s.declaration}>{seller.declaration}</Text>

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

        {/* Separately positioned fixed elements with static text.
            Not a preference: on a page this full, react-pdf silently drops both
            a fixed wrapper View holding these as children and any Text using
            the `render` callback, so the whole footer, or just the clause,
            renders as nothing at all. It fails without an error, which is why
            it is worth a comment. A jurisdiction clause that is missing from
            the document is not a clause.

            Re-confirmed while restructuring: a fixed Text rendering "PAGE 1 OF
            2" from the callback printed nothing on either page of a two page
            invoice. There is no page numbering here for that reason, not for a
            design one; the invoice and shipment numbers ride in the footer
            instead, so a second sheet still belongs to an invoice. */}
        <View style={s.pageFootRule} fixed />
        <Text style={s.pageFootText} fixed>
          {data.invoiceNumber}   Shipment {shipment.shipmentNumber}   Computer
          generated invoice. Please contact Arena Billing at {billingEmail}.
        </Text>
        <Text style={s.jurisdiction} fixed>
          SUBJECT TO {jurisdiction.toUpperCase()} JURISDICTION
        </Text>
      </Page>
    </Document>
  );
}
