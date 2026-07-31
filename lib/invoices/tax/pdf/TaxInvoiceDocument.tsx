/**
 * lib/invoices/tax/pdf/TaxInvoiceDocument.tsx
 *
 * The tax invoice, as a document.
 *
 * ── DESIGN RULES, AND WHY ───────────────────────────────────────────────────
 * Minimal typographic. No boxes, no fills, no zebra striping, no gradients.
 * Structure comes from whitespace, alignment and weight; rules are used only
 * where they do work the whitespace cannot, which is separating one band of the
 * document from the next and anchoring the columns of the charges table.
 * Borders around everything are what make an invoice look like it came out of
 * 2004 accounting software.
 *
 * ── HIERARCHY ───────────────────────────────────────────────────────────────
 * Four tiers, and everything on the page is in exactly one of them, so a reader
 * scanning for a single fact knows where to stop looking:
 *
 *   1. The total, and the mark and logo. Largest, read from across a desk.
 *   2. Section labels. Small, letter-spaced, grey, above a hairline. These are
 *      signposts, not content, so they are quiet but unmissable.
 *   3. The answer to each section: company name, shipment number, charge
 *      description, amount. Near-black, normal size, bold where it is the one
 *      thing that section exists to say.
 *   4. Supporting detail: addresses, SAC codes, terms. Grey and smaller.
 *
 * Colour is functional only: near-black for content, grey for support, and one
 * muted red reserved for the UNPAID and CANCELLED marks. Nothing is coloured to
 * look nice.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Renders from InvoiceDocumentData ONLY, never from a live record. Every value
 * here was frozen when the invoice was issued.
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

import { formatInvoiceDate } from "../gst";
import { amountInWords } from "../money";
import { INVOICE_TERMS } from "../config";
import type { InvoiceDocumentData } from "../types";
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
  alert: "#B42318", // unpaid / cancelled only
};

/** Right-hand columns of the charges table. Shared by the head and the rows. */
const COL = {
  sac: 46,
  taxable: 66,
  gst: 62,
  amount: 74,
};

const s = StyleSheet.create({
  // The whole document has to fit on one page for a shipment with six charge
  // lines, which is the realistic worst case. A tax invoice that runs onto a
  // second page for no reason looks careless, and the footer (bank details,
  // declaration, signature) is exactly what ends up stranded there.
  page: {
    paddingTop: 38,
    paddingBottom: 46,
    paddingHorizontal: 44,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: C.ink,
    lineHeight: 1.4,
  },

  // ── masthead ──
  masthead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  logo: { width: 132, marginBottom: 6 },
  // The legal name sits under the mark in two lines: it is long, and set on one
  // line it either shrinks below the size of the address beneath it or crowds
  // the document title on the right.
  legalName: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    lineHeight: 1.3,
  },
  mastheadRight: { alignItems: "flex-end" },
  docTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    textAlign: "right",
  },
  docNumber: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    marginTop: 6,
  },
  docDate: { fontSize: 8.5, color: C.muted, textAlign: "right", marginTop: 2 },
  statusMark: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    color: C.alert,
    textAlign: "right",
    marginTop: 5,
  },

  // ── section band ──
  // Every band opens the same way: a grey letter-spaced label, then a hairline,
  // then content. One repeated shape means the reader learns the page once.
  band: { marginTop: 16 },
  bandHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  label: { fontSize: 7, color: C.muted, letterSpacing: 1.1 },
  labelNote: { fontSize: 7, color: C.faint, letterSpacing: 0.4 },
  rule: { borderTopWidth: 0.5, borderTopColor: C.rule },

  // ── two-column grid ──
  columns: { flexDirection: "row", marginTop: 7 },
  column: { width: "50%", paddingRight: 18 },
  columnLabel: {
    fontSize: 7,
    color: C.muted,
    letterSpacing: 1.1,
    marginBottom: 3,
  },

  partyName: { fontSize: 9.5, fontFamily: "Helvetica-Bold", lineHeight: 1.3 },
  detail: { fontSize: 8, color: C.muted, lineHeight: 1.45 },
  detailInk: { fontSize: 8.5, color: C.ink },

  // ── shipment strip ──
  // A row of facts rather than a stack of labelled rows. Same information,
  // roughly a third of the height, and it reads as one statement about one
  // shipment instead of five unrelated fields.
  factRow: { flexDirection: "row", marginTop: 7 },
  fact: { paddingRight: 22 },
  factLabel: { fontSize: 6.5, color: C.faint, letterSpacing: 0.9 },
  factValue: { fontSize: 8.5, marginTop: 1.5 },
  factValueStrong: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginTop: 1.5 },

  // ── charges table ──
  // The only place on the page with columns, so the only place that needs
  // alignment help. Two hairlines: one under the column heads, one above the
  // total. Nothing between the rows, which is what keeps it from looking like a
  // spreadsheet.
  tableHead: { flexDirection: "row", paddingBottom: 5 },
  tableHeadCell: { fontSize: 6.5, color: C.muted, letterSpacing: 0.9 },
  row: { flexDirection: "row", paddingTop: 7, paddingBottom: 1 },
  rowDescription: { flex: 1, paddingRight: 14 },
  descriptionText: { fontSize: 9, lineHeight: 1.3 },
  cell: { fontSize: 8.5, textAlign: "right" },
  cellMuted: { fontSize: 8, color: C.muted, textAlign: "right" },
  cellStrong: { fontSize: 9, textAlign: "right" },

  // ── totals ──
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
  totals: { width: 268 },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalsLabel: { fontSize: 8.5, color: C.muted },
  totalsValue: { fontSize: 8.5, textAlign: "right" },
  totalsRule: {
    borderTopWidth: 0.75,
    borderTopColor: C.ruleStrong,
    marginTop: 6,
    marginBottom: 8,
  },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  grandLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  grandValue: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "right" },
  words: { fontSize: 7.5, color: C.muted, marginTop: 6, textAlign: "right" },
  paymentNote: { fontSize: 8, marginTop: 5, textAlign: "right" },
  paymentNoteAlert: { color: C.alert, fontFamily: "Helvetica-Bold" },

  // ── footer ──
  footerColumns: { flexDirection: "row", justifyContent: "space-between", marginTop: 7 },
  footerColumn: { width: "47%" },
  footerText: { fontSize: 7, color: C.muted, lineHeight: 1.55 },
  declarationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 14,
  },
  declaration: { width: "58%" },
  signature: { alignItems: "flex-end" },
  signatureFor: { fontSize: 8, color: C.muted },
  signatureName: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    lineHeight: 1.3,
  },
  signatureRole: { fontSize: 7.5, color: C.muted, marginTop: 16 },

  // ── fixed foot of page ──
  // Three separately positioned elements, each measured from the bottom edge,
  // so nothing here depends on the flow above it having ended anywhere in
  // particular.
  pageFootRule: {
    position: "absolute",
    bottom: 42,
    left: 44,
    right: 44,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
  },
  pageFootText: {
    position: "absolute",
    bottom: 30,
    left: 44,
    right: 44,
    fontSize: 6.5,
    color: C.faint,
    textAlign: "center",
  },
  jurisdiction: {
    position: "absolute",
    bottom: 19,
    left: 44,
    right: 44,
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

/**
 * Join the parts of a place, skipping the ones that are missing.
 *
 * The state is dropped when it restates the city, because India has several
 * where it does and "New Delhi, Delhi, India" reads as a data entry error
 * rather than as a place. Containment either way, so Delhi inside New Delhi and
 * Chandigarh inside Chandigarh both collapse.
 */
function place(party: {
  city: string | null;
  state?: string | null;
  country: string | null;
}): string {
  const city = party.city?.trim();
  const state = party.state?.trim();

  const cityKey = city?.toLowerCase() ?? "";
  const stateKey = state?.toLowerCase() ?? "";
  const restated =
    !!stateKey &&
    !!cityKey &&
    (cityKey.includes(stateKey) || stateKey.includes(cityKey));

  return [city, restated ? null : state, party.country?.trim()]
    .filter(Boolean)
    .join(", ");
}

/**
 * Break a company's legal name across two lines at the word boundary that makes
 * the two halves closest in length.
 *
 * "Arena Cargo And Logistics India Private Limited" set on one line either has
 * to shrink below the address under it or crowd the document title beside it;
 * broken at the midpoint it sits under the mark at a readable size. Balancing
 * rather than filling matters because a 40 character line over a 6 character
 * line reads as a typo, not a design.
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

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** A section: grey label, hairline, content. The page's one repeated shape. */
function Band({
  label,
  note,
  children,
}: {
  label: string;
  note?: string | null;
  children: React.ReactNode;
}) {
  return (
    <View style={s.band}>
      <View style={s.bandHead}>
        <Text style={s.label}>{label.toUpperCase()}</Text>
        {note ? <Text style={s.labelNote}>{note}</Text> : null}
      </View>
      <View style={s.rule} />
      {children}
    </View>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.fact}>
      <Text style={s.factLabel}>{label.toUpperCase()}</Text>
      <Text style={strong ? s.factValueStrong : s.factValue}>{value}</Text>
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

  const origin = place(shipment.origin);
  const destination = place(shipment.destination);

  const chargeableWeight = weight(
    shipment.chargeableWeightKg ?? shipment.actualWeightKg,
  );

  const gstColumnHead =
    data.taxRatePercent > 0 ? `GST @ ${data.taxRatePercent}%` : "GST";

  const lineTax = (line: (typeof data.lineItems)[number]) =>
    line.cgstAmount + line.sgstAmount + line.igstAmount;

  // Fall back rather than print "undefined": invoices issued before these were
  // added to the issuer config still have to render from their own snapshot.
  const jurisdiction = seller.jurisdiction ?? "Delhi and Gurgaon";
  const billingEmail = seller.billingEmail ?? seller.email;

  return (
    <Document
      title={`${title} ${data.invoiceNumber}`}
      author={seller.legalName}
      subject={`${title} for shipment ${shipment.shipmentNumber}`}
    >
      <Page size="A4" style={s.page}>
        {/* ── Masthead ───────────────────────────────────────────────── */}
        <View style={s.masthead}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image style={s.logo} src={ARENA_LOGO_DATA_URI} />
            {sellerNameLines.map((line, i) => (
              <Text key={i} style={s.legalName}>
                {line}
              </Text>
            ))}
          </View>

          <View style={s.mastheadRight}>
            <Text style={s.docTitle}>{title}</Text>
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

        {/* ── Parties ────────────────────────────────────────────────── */}
        <Band label="Parties" note={`Place of supply  ${data.placeOfSupplyName} (${data.placeOfSupplyCode})`}>
          <View style={s.columns}>
            <View style={s.column}>
              <Text style={s.columnLabel}>BILLED TO</Text>
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
            </View>

            <View style={s.column}>
              <Text style={s.columnLabel}>ISSUED BY</Text>
              <Text style={s.partyName}>{sellerNameLines.join(" ")}</Text>
              <Text style={s.detail}>
                {[
                  ...seller.addressLines,
                  [seller.city, seller.stateName, seller.postalCode]
                    .filter(Boolean)
                    .join(", "),
                ]
                  .filter((l) => !!l?.trim())
                  .join("\n")}
              </Text>
              <Text style={s.detailInk}>
                GSTIN {seller.gstin}   PAN {seller.pan}
              </Text>
            </View>
          </View>
        </Band>

        {/* ── Shipment ───────────────────────────────────────────────── */}
        <Band label="Shipment" note={shipment.serviceName}>
          <View style={s.factRow}>
            <Fact label="Reference" value={shipment.shipmentNumber} strong />
            {origin && destination && (
              <Fact label="Route" value={`${origin}  to  ${destination}`} />
            )}
          </View>

          <View style={s.factRow}>
            <Fact
              label="Packages"
              value={String(shipment.packageCount)}
            />
            {chargeableWeight && (
              <Fact label="Chargeable weight" value={chargeableWeight} />
            )}
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
        </Band>

        {/* ── Charges ────────────────────────────────────────────────────
            The breakdown the customer actually asked for: every component
            they were charged, what it was worth before tax, the tax on it,
            and what it cost them. Amounts are the tax-inclusive figures, so
            the last column adds up to the number that left their wallet. */}
        <Band label="Charges" note="Amounts include GST">
          <View style={s.tableHead}>
            <View style={s.rowDescription}>
              <Text style={[s.tableHeadCell, { marginTop: 5 }]}>DESCRIPTION</Text>
            </View>
            <Text style={[s.tableHeadCell, { width: COL.sac, textAlign: "right", marginTop: 5 }]}>
              SAC
            </Text>
            <Text style={[s.tableHeadCell, { width: COL.taxable, textAlign: "right", marginTop: 5 }]}>
              TAXABLE
            </Text>
            <Text style={[s.tableHeadCell, { width: COL.gst, textAlign: "right", marginTop: 5 }]}>
              {gstColumnHead.toUpperCase()}
            </Text>
            <Text style={[s.tableHeadCell, { width: COL.amount, textAlign: "right", marginTop: 5 }]}>
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

        {/* ── Totals ─────────────────────────────────────────────────── */}
        <View style={s.totalsWrap}>
          <View style={s.totals}>
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

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <Band label="Payment and terms">
          {data.taxNote && (
            <Text style={[s.footerText, { marginTop: 7 }]}>{data.taxNote}</Text>
          )}

          <View style={s.footerColumns}>
            <View style={s.footerColumn}>
              {seller.bank && (
                <Text style={s.footerText}>
                  {seller.bank.accountName}
                  {"\n"}
                  {seller.bank.bankName}
                  {seller.bank.branch ? `, ${seller.bank.branch}` : ""}
                  {"\n"}
                  A/C {seller.bank.accountNumber}   IFSC {seller.bank.ifsc}
                </Text>
              )}
            </View>

            <View style={s.footerColumn}>
              <Text style={s.footerText}>{INVOICE_TERMS.join("\n")}</Text>
            </View>
          </View>

          {/* Declaration and signature share a row rather than stacking. Both
              belong at the foot of the page, neither needs full width, and
              stacking them is what pushed the signature onto a second sheet. */}
          <View style={s.declarationRow}>
            <Text style={[s.footerText, s.declaration]}>
              {seller.declaration}
            </Text>

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
        </Band>

        {/* Three separate fixed elements, each with static text.
            Not a preference: on a page this full, react-pdf silently drops both
            a fixed wrapper View holding these as children and any Text using
            the `render` callback, so the whole footer, or just the clause,
            renders as nothing at all. It fails without an error, which is why
            it is worth a comment. A jurisdiction clause that is missing from
            the document is not a clause. */}
        <View style={s.pageFootRule} fixed />
        <Text style={s.pageFootText} fixed>
          This is a computer generated invoice. Please contact Arena Billing for
          more information at {billingEmail}.
        </Text>
        <Text style={s.jurisdiction} fixed>
          SUBJECT TO {jurisdiction.toUpperCase()} JURISDICTION
        </Text>
      </Page>
    </Document>
  );
}
