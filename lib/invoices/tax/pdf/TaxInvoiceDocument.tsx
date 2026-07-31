/**
 * lib/invoices/tax/pdf/TaxInvoiceDocument.tsx
 *
 * The tax invoice, as a document.
 *
 * ── DESIGN RULES, AND WHY ───────────────────────────────────────────────────
 * Minimal typographic. No table chrome, no boxes, no fills, no gradients.
 * Structure comes from whitespace, alignment and one weight change; the only
 * rule on the page is the hairline above the total, which is the single place a
 * line genuinely helps the eye. Borders around everything are what make an
 * invoice look like it came out of 2004 accounting software.
 *
 * Colour is functional only: near-black for content, grey for labels, and one
 * muted red reserved for the UNPAID and CANCELLED marks. Nothing is coloured to
 * look nice.
 *
 * Typography does the work, so the details matter: labels are small, letter-
 * spaced and grey; amounts are right-aligned and tabular so columns line up as
 * digits rather than as text; the total is the only large thing on the page.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Renders from InvoiceDocumentData ONLY, never from a live record. Every value
 * here was frozen when the invoice was issued.
 *
 * Helvetica throughout: it is built into @react-pdf/renderer, so the render has
 * no font fetch to fail on, which matters for something running in a background
 * job.
 */

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { formatInvoiceDate } from "../gst";
import { amountInWords } from "../money";
import { INVOICE_TERMS } from "../config";
import type { InvoiceDocumentData } from "../types";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const C = {
  ink: "#101828", // body
  muted: "#667085", // labels and secondary text
  faint: "#98A2B3", // the quietest tier, used sparingly
  rule: "#D0D5DD", // the one hairline
  alert: "#B42318", // unpaid / cancelled only
};

const s = StyleSheet.create({
  // Margins are generous but not extravagant. The whole document has to fit on
  // one page for a shipment with five charge lines, which is the realistic
  // worst case; a tax invoice that runs onto a second page for no reason looks
  // careless, and the footer (bank details, declaration, signature) is exactly
  // what ends up stranded there.
  page: {
    paddingTop: 44,
    paddingBottom: 44,
    paddingHorizontal: 48,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: C.ink,
    lineHeight: 1.45,
  },

  // ── header ──
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 26,
  },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold", letterSpacing: 0.2 },
  brandSub: { fontSize: 8, color: C.muted, marginTop: 2 },
  docTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.4,
    textAlign: "right",
  },
  docNumber: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    marginTop: 4,
  },
  unpaidMark: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    color: C.alert,
    textAlign: "right",
    marginTop: 4,
  },

  // ── two-column grid ──
  // Every fact block on the page sits in the same two columns, so the eye has
  // one left edge and one midpoint to track rather than a new alignment per
  // section. No rules or boxes are needed to hold it together.
  columns: { flexDirection: "row", marginBottom: 16 },
  column: { width: "50%", paddingRight: 16 },
  lastColumns: { marginBottom: 22 },

  label: {
    fontSize: 7,
    color: C.muted,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  valueText: { fontSize: 9 },
  valueStrong: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  valueMuted: { fontSize: 8.5, color: C.muted },

  // ── line items ──
  lineItem: { flexDirection: "row", marginBottom: 9 },
  lineBody: { flex: 1, paddingRight: 16 },
  lineDescription: { fontSize: 9 },
  lineMeta: { fontSize: 7.5, color: C.faint, marginTop: 1 },
  lineAmount: {
    width: 96,
    fontSize: 9,
    textAlign: "right",
  },

  // ── totals ──
  totalsBlock: { marginTop: 16, alignItems: "flex-end" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 6,
  },
  totalsLabel: { fontSize: 8.5, color: C.muted, textAlign: "right" },
  totalsValue: { width: 96, fontSize: 9, textAlign: "right" },

  rule: {
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
    marginTop: 8,
    marginBottom: 10,
    width: 268,
    alignSelf: "flex-end",
  },

  grandLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },
  grandValue: {
    width: 96,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },

  words: {
    marginTop: 12,
    fontSize: 8,
    color: C.muted,
    textAlign: "right",
    maxWidth: 300,
    alignSelf: "flex-end",
  },
  paymentNote: {
    marginTop: 6,
    fontSize: 8,
    textAlign: "right",
  },
  paymentNoteAlert: { color: C.alert, fontFamily: "Helvetica-Bold" },

  // ── footer ──
  footer: { marginTop: 24 },
  footerColumns: { flexDirection: "row", justifyContent: "space-between" },
  footerColumn: { width: "46%" },
  footerLabel: {
    fontSize: 7,
    color: C.muted,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  footerText: { fontSize: 7.5, color: C.muted, lineHeight: 1.6 },
  declarationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 18,
  },
  declaration: { width: "56%" },
  signature: { alignItems: "flex-end" },
  signatureName: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  signatureRole: { fontSize: 7.5, color: C.muted, marginTop: 2 },

  pageNumber: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 7,
    color: C.faint,
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

/** Join the parts of a place, skipping the ones that are missing. */
function place(party: {
  city: string | null;
  state?: string | null;
  country: string | null;
}): string {
  return [party.city, party.state, party.country]
    .filter((p) => !!p?.trim())
    .join(", ");
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Column({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.column}>
      <Text style={s.label}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function TotalsRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
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

  const route = [
    place(shipment.origin) || null,
    place(shipment.destination) || null,
  ].filter(Boolean);

  const shipmentFacts = [
    `${shipment.packageCount} ${shipment.packageCount === 1 ? "package" : "packages"}`,
    weight(shipment.chargeableWeightKg ?? shipment.actualWeightKg),
  ].filter(Boolean) as string[];

  return (
    <Document
      title={`${title} ${data.invoiceNumber}`}
      author={seller.legalName}
      subject={`${title} for shipment ${shipment.shipmentNumber}`}
    >
      <Page size="A4" style={s.page}>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}>{seller.tradeName ?? seller.legalName}</Text>
            {seller.tradeName && seller.tradeName !== seller.legalName && (
              <Text style={s.brandSub}>{seller.legalName}</Text>
            )}
          </View>

          <View>
            <Text style={s.docTitle}>{title}</Text>
            <Text style={s.docNumber}>{data.invoiceNumber}</Text>
            {data.status === "UNPAID" && (
              <Text style={s.unpaidMark}>UNPAID</Text>
            )}
            {data.status === "CANCELLED" && (
              <Text style={s.unpaidMark}>CANCELLED</Text>
            )}
          </View>
        </View>

        {/* ── Parties and shipment ───────────────────────────────────────
            A two-column grid, not a stack of label-over-value rows. Stacking
            reads fine but runs the page long enough to push the declaration
            and signature onto a second sheet, and paired facts (who is billed
            / who issued) belong side by side anyway. */}
        <View style={s.columns}>
          <Column label="Billed to">
            <Text style={s.valueStrong}>{buyer.legalName}</Text>
            {buyer.addressLines.map((line, i) => (
              <Text key={i} style={s.valueMuted}>
                {line}
              </Text>
            ))}
            {(buyer.city || buyer.postalCode) && (
              <Text style={s.valueMuted}>
                {[buyer.city, buyer.stateName, buyer.postalCode]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
            )}
            <Text style={s.valueMuted}>
              GSTIN {buyer.gstin ?? "Unregistered"}
            </Text>
          </Column>

          <Column label="Issued by">
            <Text style={s.valueText}>{seller.legalName}</Text>
            {seller.addressLines.map((line, i) => (
              <Text key={i} style={s.valueMuted}>
                {line}
              </Text>
            ))}
            <Text style={s.valueMuted}>
              {[seller.city, seller.stateName, seller.postalCode]
                .filter(Boolean)
                .join(", ")}
            </Text>
            <Text style={s.valueMuted}>GSTIN {seller.gstin}</Text>
            <Text style={s.valueMuted}>PAN {seller.pan}</Text>
          </Column>
        </View>

        <View style={s.columns}>
          <Column label="Shipment">
            <Text style={s.valueStrong}>{shipment.shipmentNumber}</Text>
            {route.length === 2 && (
              <Text style={s.valueMuted}>
                {route[0]} to {route[1]}
              </Text>
            )}
            {shipmentFacts.length > 0 && (
              <Text style={s.valueMuted}>{shipmentFacts.join(" · ")}</Text>
            )}
            {shipment.serviceName && (
              <Text style={s.valueMuted}>{shipment.serviceName}</Text>
            )}
          </Column>

          {/* A business associate books for their own client. The invoice is
              billed to the BA, who paid it, so the client is named here as the
              sender rather than in the bill-to block. */}
          {shipment.consignor ? (
            <Column label="Shipper">
              <Text style={s.valueText}>
                {shipment.consignor.companyName ??
                  shipment.consignor.name ??
                  "Not recorded"}
              </Text>
              {place(shipment.consignor) && (
                <Text style={s.valueMuted}>{place(shipment.consignor)}</Text>
              )}
            </Column>
          ) : (
            <View style={s.column} />
          )}
        </View>

        <View style={[s.columns, s.lastColumns]}>
          <Column label="Invoice date">
            <Text style={s.valueText}>
              {formatInvoiceDate(new Date(data.issueDate))}
            </Text>
          </Column>

          <Column label="Place of supply">
            <Text style={s.valueText}>
              {data.placeOfSupplyName} ({data.placeOfSupplyCode})
            </Text>
          </Column>
        </View>

        {/* ── Charges ────────────────────────────────────────────────── */}
        <View>
          {data.lineItems.map((line, i) => (
            <View key={i} style={s.lineItem} wrap={false}>
              <View style={s.lineBody}>
                <Text style={s.lineDescription}>{line.description}</Text>
                <Text style={s.lineMeta}>SAC {line.sacCode}</Text>
              </View>
              <Text style={s.lineAmount}>{money(line.taxableValue)}</Text>
            </View>
          ))}
        </View>

        {/* ── Totals ─────────────────────────────────────────────────── */}
        <View style={s.totalsBlock}>
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

          <View style={s.rule} />

          <View style={s.totalsRow}>
            <Text style={s.grandLabel}>Total {data.currency}</Text>
            <Text style={s.grandValue}>{money(data.total)}</Text>
          </View>

          <Text style={s.words}>{amountInWords(data.total, data.currency)}</Text>

          <Text
            style={[
              s.paymentNote,
              ...(data.status === "UNPAID" ? [s.paymentNoteAlert] : []),
            ]}
          >
            {data.paymentNote}
          </Text>
        </View>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <View style={s.footer}>
          {data.taxNote && (
            <Text style={[s.footerText, { marginBottom: 12 }]}>
              {data.taxNote}
            </Text>
          )}

          <View style={s.footerColumns}>
            <View style={s.footerColumn}>
              {seller.bank && (
                <>
                  <Text style={s.footerLabel}>BANK DETAILS</Text>
                  <Text style={s.footerText}>
                    {seller.bank.accountName}
                    {"\n"}
                    {seller.bank.bankName}
                    {seller.bank.branch ? `, ${seller.bank.branch}` : ""}
                    {"\n"}
                    A/C {seller.bank.accountNumber}
                    {"\n"}
                    IFSC {seller.bank.ifsc}
                  </Text>
                </>
              )}
            </View>

            <View style={s.footerColumn}>
              <Text style={s.footerLabel}>TERMS</Text>
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
              <Text style={s.signatureName}>For {seller.legalName}</Text>
              <Text style={s.signatureRole}>Authorised signatory</Text>
            </View>
          </View>
        </View>

        <Text
          style={s.pageNumber}
          render={({ pageNumber, totalPages }) =>
            totalPages > 1
              ? `${data.invoiceNumber} · Page ${pageNumber} of ${totalPages}`
              : `${data.invoiceNumber} · This is a computer generated document.`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
