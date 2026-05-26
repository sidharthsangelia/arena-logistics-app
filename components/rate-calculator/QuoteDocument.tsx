import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { RateQuote, RateRequest } from "@/lib/types";
import { ClientInfo } from "./QuoteSheet";

// ─── props ───────────────────────────────────────────────────────────────────

interface Props {
  quote: RateQuote;
  request: RateRequest;
  client: ClientInfo;
  markupPercent: number;
  quoteNumber: string;
}

// ─── colour palette ──────────────────────────────────────────────────────────

const C = {
  navy:        "#1B2A4A",  // primary brand
  navyMid:     "#2D4270",  // header rows
  navyLight:   "#E8EEF7",  // light tint for alternating rows / boxes
  accent:      "#0F6FBF",  // hyperlinks, highlights
  text:        "#1E293B",  // body
  muted:       "#64748B",  // labels, subtext
  border:      "#CBD5E1",  // table borders, separators
  bg:          "#F8FAFC",  // section backgrounds
  white:       "#FFFFFF",
  green:       "#15803D",
  greenLight:  "#DCFCE7",
  greenBorder: "#86EFAC",
  red:         "#B91C1C",
};

// ─── styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // PAGE
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.text,
    paddingTop: 44,
    paddingBottom: 64,
    paddingHorizontal: 44,
    backgroundColor: C.white,
    lineHeight: 1.35,
  },

  // HEADER
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 14,
    marginBottom: 18,
    borderBottomWidth: 2,
    borderBottomColor: C.navy,
  },
  coName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    color: C.navy,
    marginBottom: 3,
  },
  coSub: {
    fontSize: 8,
    color: C.muted,
    marginBottom: 1.5,
  },
  quoteTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    color: C.navy,
    textAlign: "right",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 2.5,
    justifyContent: "flex-end",
  },
  metaLabel: {
    fontSize: 7.5,
    color: C.muted,
    width: 60,
    textAlign: "right",
  },
  metaValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: C.text,
    minWidth: 90,
    textAlign: "left",
  },

  // BILL-TO / ROUTE ROW
  infoRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  infoBox: {
    flex: 1,
    padding: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
  },
  infoBoxBlue: {
    flex: 1,
    padding: 10,
    backgroundColor: C.navyLight,
    borderWidth: 1,
    borderColor: "#93B4D8",
    borderRadius: 4,
  },
  boxLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  boxLabelBlue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: C.navyMid,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  clientName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: C.text,
    marginBottom: 2.5,
  },
  clientLine: {
    fontSize: 8.5,
    color: C.muted,
    marginBottom: 2,
  },

  // ROUTE
  routeCols: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  routeCol: { flex: 1 },
  routePointLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: C.navyMid,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  routeCity: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: C.navy,
  },
  routeCountry: {
    fontSize: 7.5,
    color: C.muted,
    marginTop: 1,
  },
  routeArrow: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: C.navyMid,
  },
  routeDetail: {
    fontSize: 7.5,
    color: C.muted,
    marginBottom: 2,
  },

  // TABLE
  tableSection: { marginBottom: 16 },
  sectionHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 5,
  },
  table: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: C.navyMid,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  thCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: C.white,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRowAlt: { backgroundColor: C.navyLight },
  tableRowLast: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  tdCell: {
    fontSize: 8.5,
    color: C.text,
  },
  tdCellMuted: {
    fontSize: 8.5,
    color: C.muted,
  },
  tdRight: { textAlign: "right" },

  // Column widths
  cDesc:   { flex: 3 },
  cCarrier:{ flex: 1.5 },
  cTAT:    { flex: 1 },
  cAmt:    { flex: 1.3 },

  // TOTALS
  totalsWrapper: {
    alignItems: "flex-end",
    marginBottom: 14,
  },
  totalsBox: {
    width: 230,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  totalsLabel: { fontSize: 8.5, color: C.muted },
  totalsValue: { fontSize: 8.5, color: C.text },
  totalsFinalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: C.navy,
  },
  totalsFinalLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: C.white,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  totalsFinalValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: C.white,
  },

  // VALIDITY STRIP
  validityStrip: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    backgroundColor: C.greenLight,
    borderWidth: 1,
    borderColor: C.greenBorder,
    borderRadius: 4,
    marginBottom: 14,
  },
  validityText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: C.green,
  },

  // TERMS
  termsBox: {
    padding: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    marginBottom: 14,
  },
  termsHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  termLine: {
    fontSize: 7.5,
    color: C.muted,
    marginBottom: 3,
    lineHeight: 1.4,
  },

  // BANK / PAYMENT BOX (optional)
  paymentBox: {
    padding: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    marginBottom: 14,
  },

  // FOOTER
  footer: {
    position: "absolute",
    bottom: 22,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 7,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: { fontSize: 7, color: C.muted },
  footerBold: { fontFamily: "Helvetica-Bold", color: C.text },
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const TERMS = [
  "1. All rates quoted are indicative and subject to confirmation at time of booking. Final charges may vary based on actual weight and dimensions verified at the point of shipment.",
  "2. Transit times are estimated only and are not guaranteed. Delays due to customs examination, weather conditions, national holidays, or force majeure events are not the carrier's responsibility.",
  "3. Fuel surcharges (FSC), security surcharges, and peak season surcharges are subject to change without prior notice and will be billed at the rate applicable on the date of shipment.",
  "4. Customs duties, import taxes, VAT, and destination clearance fees are not included unless explicitly stated. These are the consignee's responsibility.",
  "5. Cargo insurance is not included. We strongly recommend all-risk marine cargo insurance. Please contact us for a separate insurance quotation.",
  "6. Liability is limited per the carrier's standard trading conditions, which are available on request. Sub-COGSA limits apply for sea freight.",
  "7. Payment terms: Net 30 days from invoice date unless agreed otherwise in writing. A late payment fee of 1.5% per month applies on overdue balances.",
  "8. This quotation is valid for 30 days from the date issued, subject to space and rate availability at time of booking.",
];

// ─── document ────────────────────────────────────────────────────────────────

export default function QuoteDocument({
  quote,
  request,
  client,
  markupPercent,
  quoteNumber,
}: Props) {
  const today    = new Date();
  const validity = new Date(today);
  validity.setDate(validity.getDate() + 30);

  const factor = 1 + markupPercent / 100;

  // Apply markup to all amounts
  const adjustedCharges = quote.charges.map((c) => ({
    ...c,
    amount:    c.amount    * factor,
    taxAmount: c.taxAmount != null ? c.taxAmount * factor : c.taxAmount,
  }));
  const adjExcl = quote.totalWithoutTax * factor;
  const adjIncl = quote.totalWithTax    * factor;
  const adjTax  = adjIncl - adjExcl;

  if (!request) {
  throw new Error("QuoteDocument: request prop is missing");
}

  const { origin, destination, shipment } = request;

  // Volumetric weight
  const volWt =
    (shipment.dimensions.length *
      shipment.dimensions.width *
      shipment.dimensions.height) /
    (shipment.dimensions.unit === "cm" ? 5000 : 139);

  const chargeable = Math.max(shipment.weight, volWt);

  return (
    <Document
      title={`Freight Quote ${quoteNumber}`}
      author="SwiftFreight"
      creator="SwiftFreight Logistics Platform"
      producer="@react-pdf/renderer"
    >
      <Page size="A4" style={s.page}>
        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <View style={s.headerRow} fixed>
          {/* left: company branding */}
          <View>
            <Text style={s.coName}>SwiftFreight</Text>
            <Text style={s.coSub}>International Freight Forwarding &amp; Logistics Solutions</Text>
            <Text style={s.coSub}>info@swiftfreight.com  ·  +91 11 4567 8900  ·  www.swiftfreight.com</Text>
          </View>

          {/* right: quote reference */}
          <View>
            <Text style={s.quoteTitle}>Rate Quotation</Text>
            {(
              [
                ["Quote No.", quoteNumber],
                ["Date",      fmtDate(today)],
                ["Valid Until", fmtDate(validity)],
                ["Currency",  quote.currency],
              ] as [string, string][]
            ).map(([label, value]) => (
              <View key={label} style={s.metaRow}>
                <Text style={s.metaLabel}>{label}</Text>
                <Text style={s.metaValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── BILL-TO + ROUTE ────────────────────────────────────────── */}
        <View style={s.infoRow}>
          {/* bill to */}
          <View style={s.infoBox}>
            <Text style={s.boxLabel}>Bill To</Text>
            <Text style={s.clientName}>{client.name}</Text>
            <Text style={s.clientLine}>{client.company}</Text>
            {client.email   ? <Text style={s.clientLine}>{client.email}</Text>   : null}
            {client.phone   ? <Text style={s.clientLine}>{client.phone}</Text>   : null}
            {client.address ? <Text style={s.clientLine}>{client.address}</Text> : null}
          </View>

          {/* shipment route */}
          <View style={s.infoBoxBlue}>
            <Text style={s.boxLabelBlue}>Shipment Route</Text>

            <View style={s.routeCols}>
              <View style={s.routeCol}>
                <Text style={s.routePointLabel}>Origin</Text>
                <Text style={s.routeCity}>{origin.city}</Text>
                <Text style={s.routeCountry}>{origin.countryCode}</Text>
              </View>
              <Text style={s.routeArrow}>→</Text>
              <View style={s.routeCol}>
                <Text style={s.routePointLabel}>Destination</Text>
                <Text style={s.routeCity}>{destination.city}</Text>
                <Text style={s.routeCountry}>
                  {destination.country ?? destination.countryCode}
                </Text>
              </View>
            </View>

            <Text style={s.routeDetail}>
              Gross weight: {shipment.weight} kg  |  Vol. weight: {volWt.toFixed(2)} kg  |  Chargeable: {chargeable.toFixed(2)} kg
            </Text>
            <Text style={s.routeDetail}>
              Dimensions: {shipment.dimensions.length} × {shipment.dimensions.width} × {shipment.dimensions.height} {shipment.dimensions.unit}
            </Text>
            <Text style={s.routeDetail}>
              Pieces: {shipment.quantity}  |  Contents: {shipment.description}
            </Text>
          </View>
        </View>

        {/* ── CHARGES TABLE ──────────────────────────────────────────── */}
        <View style={s.tableSection}>
          <Text style={s.sectionHeading}>Rate Breakdown — {quote.vendorName} · {quote.productName}</Text>

          <View style={s.table}>
            {/* table header */}
            <View style={s.tableHead}>
              <Text style={[s.thCell, s.cDesc]}>Charge Description</Text>
              <Text style={[s.thCell, s.cCarrier]}>Carrier</Text>
              <Text style={[s.thCell, s.cTAT]}>Transit</Text>
              <Text style={[s.thCell, s.cAmt, s.tdRight]}>Amount ({quote.currency})</Text>
            </View>

            {/* rows */}
            {adjustedCharges.map((charge, i) => {
              const isLast = i === adjustedCharges.length - 1;
              const rowStyle = isLast
                ? s.tableRowLast
                : [s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}];
              return (
                <View key={i} style={rowStyle}>
                  <Text style={[s.tdCell, s.cDesc]}>{charge.name}</Text>
                  <Text style={[s.tdCellMuted, s.cCarrier]}>{quote.vendorName}</Text>
                  <Text style={[s.tdCellMuted, s.cTAT]}>
                    {i === 0
                      ? quote.tatDays > 0
                        ? `${quote.tatDays} days`
                        : "TBD"
                      : "—"}
                  </Text>
                  <Text style={[s.tdCell, s.cAmt, s.tdRight]}>
                    {fmt(charge.amount, charge.currency)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── TOTALS ─────────────────────────────────────────────────── */}
        <View style={s.totalsWrapper}>
          <View style={s.totalsBox}>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Subtotal (excl. tax)</Text>
              <Text style={s.totalsValue}>{fmt(adjExcl, quote.currency)}</Text>
            </View>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Tax / GST / Levies</Text>
              <Text style={s.totalsValue}>{fmt(adjTax, quote.currency)}</Text>
            </View>
            <View style={s.totalsFinalRow}>
              <Text style={s.totalsFinalLabel}>Total Due</Text>
              <Text style={s.totalsFinalValue}>{fmt(adjIncl, quote.currency)}</Text>
            </View>
          </View>
        </View>

        {/* ── VALIDITY STRIP ─────────────────────────────────────────── */}
        <View style={s.validityStrip}>
          <Text style={s.validityText}>
            ✓  This quotation is valid for 30 days, until {fmtDate(validity)}.
            Rates are subject to availability at time of booking.
          </Text>
        </View>

        {/* ── TERMS & CONDITIONS ─────────────────────────────────────── */}
        <View style={s.termsBox}>
          <Text style={s.termsHeading}>Terms &amp; Conditions</Text>
          {TERMS.map((t, i) => (
            <Text key={i} style={s.termLine}>{t}</Text>
          ))}
        </View>

        {/* ── FOOTER ─────────────────────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            <Text style={s.footerBold}>SwiftFreight</Text>
            {"  ·  Confidential Rate Quotation  ·  "}
            {quoteNumber}
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}