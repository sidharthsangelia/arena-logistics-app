import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

import { RateQuote, RateRequest } from "@/lib/types";
import { ClientInfo } from "./QuoteSheet";
import { displayServiceName } from "@/lib/branding/serviceName";

interface Props {
  quote: RateQuote;
  request: RateRequest;
  client: ClientInfo;
  markupPercent: number;
  quoteNumber: string;
  /** Arena staff only. Never true for a customer-facing quote. */
  showVendor?: boolean;
}

const C = {
  navy: "#183153",
  text: "#111827",
  gray: "#6B7280",
  lightGray: "#F3F4F6",
  border: "#C7CDD4",
  darkBorder: "#94A3B8",
  white: "#FFFFFF",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    color: C.text,
    paddingTop: 30,
    paddingBottom: 42,
    paddingHorizontal: 34,
    backgroundColor: C.white,
    lineHeight: 1.25,
  },

  // ======================================================
  // HEADER
  // ======================================================

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1.2,
    borderBottomColor: C.navy,
    paddingBottom: 14,
    marginBottom: 18,
  },

  companyLeft: {
  width: "62%",
  alignItems: "flex-start",
},

logoWrap: {
  width: 120,
  height: 58,
  marginBottom: 10,
},

logo: {
  width: "100%",
  height: "100%",
  objectFit: "contain",
},

companyInfo: {
  width: "100%",
},

companyName: {
  fontFamily: "Helvetica-Bold",
  fontSize: 13,
  color: C.navy,
  lineHeight: 1.2,
  marginBottom: 6,
  letterSpacing: 0.2,
},

  companySub: {
    fontSize: 7,
    color: C.gray,
    marginBottom: 2,
    lineHeight: 1.35,
  },

  quoteMetaBox: {
    width: "30%",
    borderWidth: 1,
    borderColor: C.darkBorder,
  },

  quoteMetaHeader: {
    backgroundColor: C.navy,
    paddingVertical: 5,
    paddingHorizontal: 7,
  },

  quoteMetaHeaderText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: C.white,
    letterSpacing: 0.8,
  },

  quoteMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.8,
    borderBottomColor: C.border,
    paddingVertical: 5,
    paddingHorizontal: 7,
  },

  metaLabel: {
    fontSize: 7,
    color: C.gray,
  },

  metaValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: C.text,
  },

  // ======================================================
  // SECTION TITLE
  // ======================================================

  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.2,
    color: C.navy,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 5,
  },

  // ======================================================
  // SHIPMENT TABLE
  // ======================================================

  infoTable: {
    borderWidth: 1,
    borderColor: C.darkBorder,
    marginBottom: 12,
  },

  infoRow: {
    flexDirection: "row",
    borderBottomWidth: 0.8,
    borderBottomColor: C.border,
  },

  infoLabel: {
    width: "18%",
    backgroundColor: C.lightGray,
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: C.text,
  },

  infoValue: {
    width: "32%",
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 7,
    color: C.text,
  },

  // ======================================================
  // FREIGHT TABLE
  // ======================================================

  table: {
    borderWidth: 1,
    borderColor: C.darkBorder,
    marginBottom: 14,
  },

  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.lightGray,
    borderBottomWidth: 1,
    borderBottomColor: C.darkBorder,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },

  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.8,
    borderBottomColor: C.border,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },

  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.8,
    textTransform: "uppercase",
    color: C.text,
  },

  td: {
    fontSize: 7,
    color: C.text,
  },

  right: {
    textAlign: "right",
  },

  center: {
    textAlign: "center",
  },

  // columns

  cDesc: {
    width: "31%",
  },

  cBasis: {
    width: "16%",
  },

  cQty: {
    width: "8%",
  },

  cTransit: {
    width: "14%",
  },

  cCurr: {
    width: "10%",
  },

  cAmount: {
    width: "18%",
  },

  // ======================================================
  // TOTALS
  // ======================================================

  totalsWrap: {
    alignItems: "flex-end",
    marginBottom: 14,
  },

  totalsBox: {
    width: 220,
    borderWidth: 1,
    borderColor: C.darkBorder,
  },

  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.8,
    borderBottomColor: C.border,
    paddingVertical: 5,
    paddingHorizontal: 7,
  },

  totalsLabel: {
    fontSize: 7,
    color: C.gray,
  },

  totalsValue: {
    fontSize: 7,
    color: C.text,
  },

  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: C.navy,
    paddingVertical: 7,
    paddingHorizontal: 7,
  },

  grandLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: C.white,
    letterSpacing: 0.5,
  },

  grandValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: C.white,
  },

  // ======================================================
  // NOTES
  // ======================================================

  noteBox: {
    borderWidth: 1,
    borderColor: C.border,
    padding: 7,
    marginBottom: 10,
  },

  noteText: {
    fontSize: 6.7,
    color: C.gray,
    marginBottom: 2.5,
    lineHeight: 1.35,
  },

  // ======================================================
  // TERMS
  // ======================================================

  termsBox: {
    borderWidth: 1,
    borderColor: C.border,
    padding: 7,
    marginBottom: 14,
  },

  termsGrid: {
    flexDirection: "row",
    gap: 12,
  },

  termCol: {
    flex: 1,
  },

  term: {
    fontSize: 6.2,
    color: C.gray,
    marginBottom: 2.5,
    lineHeight: 1.35,
  },

  // ======================================================
  // SIGNATURE
  // ======================================================

  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 10,
  },

  signBox: {
    width: 220,
  },

  signLine: {
    borderTopWidth: 0.8,
    borderTopColor: C.darkBorder,
    marginBottom: 4,
  },

  signText: {
    fontSize: 6.8,
    color: C.gray,
  },

  signatureImage: {
  width: 120,
  height: 42,
  objectFit: "contain",
  marginBottom: 6,
},

signatureName: {
  fontFamily: "Helvetica-Bold",
  fontSize: 7,
  color: C.text,
  marginBottom: 2,
},

  // ======================================================
  // FOOTER
  // ======================================================

  footer: {
    position: "absolute",
    bottom: 18,
    left: 34,
    right: 34,
    borderTopWidth: 0.8,
    borderTopColor: C.border,
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  footerText: {
    fontSize: 6,
    color: C.gray,
  },
});

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
  "Rates subject to carrier confirmation and available capacity at time of booking.",
  "Transit times are indicative only and may vary due to operational or customs delays.",
  "Duties, taxes, VAT, customs clearance, and destination charges are excluded unless specified.",
  "Remote area, dangerous goods, oversized cargo, and restricted commodity surcharges may apply.",
  "Shipment billing will be based on actual chargeable weight confirmed at cargo acceptance.",
  "Cargo insurance is not included unless specifically requested in writing.",
  "Payment terms: Net 7 days from invoice date unless otherwise agreed.",
  "Subject to Delhi / Gurgaon jurisdiction only.",
];

export default function QuoteDocument({
  quote,
  request,
  client,
  markupPercent,
  quoteNumber,
  showVendor = false,
}: Props) {
  if (!request) {
    throw new Error("QuoteDocument: request prop is missing");
  }

  const today = new Date();

  const validity = new Date(today);
  validity.setDate(validity.getDate() + 7);

  const factor = 1 + markupPercent / 100;

  const adjustedCharges = quote.charges.map((c) => ({
    ...c,
    amount: c.amount * factor,
  }));

  const subtotal = quote.totalWithoutTax * factor;
  const total = quote.totalWithTax * factor;
  const tax = total - subtotal;

  const { origin, destination, shipment } = request;

  const volWt =
    (shipment.dimensions.length *
      shipment.dimensions.width *
      shipment.dimensions.height) /
    (shipment.dimensions.unit === "cm" ? 5000 : 139);

  const chargeable = Math.max(shipment.weight, volWt);

  return (
    <Document
      title={`Freight Quote ${quoteNumber}`}
      author="Arena Cargo And Logistics India Private Limited"
      producer="Arena Cargo Logistics"
    >
      <Page size="A4" style={s.page}>
        {/* ===================================================== */}
        {/* HEADER */}
        {/* ===================================================== */}

        <View style={s.header}>
          <View style={s.companyLeft}>
            <View style={s.logoWrap}>
              <Image src="/arena_logo.png" style={s.logo} />
            </View>

            <View style={s.companyInfo}>
              <Text style={s.companyName}>
                ARENA CARGO AND LOGISTICS INDIA PRIVATE LIMITED
              </Text>

              <Text style={s.companySub}>
                International Freight Forwarding | Customs Clearance |
                Warehousing
              </Text>

              <Text style={s.companySub}>
                A3-401 Signature Global Solera 1, Sector 107, Gurgaon Haryana
                122006
              </Text>

              <Text style={s.companySub}>GSTIN: 06AALCA3833B1Z2</Text>

              <Text style={s.companySub}>
                Email: adnan@arenalogistics.co.in
              </Text>
            </View>
          </View>

          <View style={s.quoteMetaBox}>
            <View style={s.quoteMetaHeader}>
              <Text style={s.quoteMetaHeaderText}>FREIGHT RATE QUOTATION</Text>
            </View>

            {[
              ["Quotation No.", quoteNumber],
              ["Quotation Date", fmtDate(today)],
              ["Validity", fmtDate(validity)],
              ["Currency", quote.currency],
            ].map(([label, value]) => (
              <View key={label} style={s.quoteMetaRow}>
                <Text style={s.metaLabel}>{label}</Text>
                <Text style={s.metaValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ===================================================== */}
        {/* SHIPMENT INFO */}
        {/* ===================================================== */}

        <Text style={s.sectionTitle}>Shipment Information</Text>

        <View style={s.infoTable}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Client</Text>
            <Text style={s.infoValue}>{client.company}</Text>

            <Text style={s.infoLabel}>Contact</Text>
            <Text style={s.infoValue}>{client.name}</Text>
          </View>

          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Origin</Text>
            <Text style={s.infoValue}>
              {origin.city}, {origin.countryCode}
            </Text>

            <Text style={s.infoLabel}>Destination</Text>
            <Text style={s.infoValue}>
              {destination.city},{" "}
              {destination.country || destination.countryCode}
            </Text>
          </View>

          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Service Type</Text>

            <Text style={s.infoValue}>
              {displayServiceName(quote.productName, showVendor)}
            </Text>

            {showVendor && (
              <>
                <Text style={s.infoLabel}>Carrier</Text>
                <Text style={s.infoValue}>{quote.vendorName}</Text>
              </>
            )}
          </View>

          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Chargeable Weight</Text>

            <Text style={s.infoValue}>{chargeable.toFixed(2)} KG</Text>

            <Text style={s.infoLabel}>Transit Time</Text>

            <Text style={s.infoValue}>
              {quote.tatDays > 0 ? `${quote.tatDays} Days` : "TBA"}
            </Text>
          </View>

          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Commodity</Text>

            <Text style={s.infoValue}>{shipment.description}</Text>

            <Text style={s.infoLabel}>Dimensions</Text>

            <Text style={s.infoValue}>
              {shipment.dimensions.length} × {shipment.dimensions.width} ×{" "}
              {shipment.dimensions.height} {shipment.dimensions.unit}
            </Text>
          </View>
        </View>

        {/* ===================================================== */}
        {/* FREIGHT TABLE */}
        {/* ===================================================== */}

        <Text style={s.sectionTitle}>Freight Charges</Text>

        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.th, s.cDesc]}>Description</Text>

            <Text style={[s.th, s.cBasis]}>Basis</Text>

            <Text style={[s.th, s.cQty, s.center]}>Qty</Text>

            <Text style={[s.th, s.cTransit]}>Transit</Text>

            <Text style={[s.th, s.cCurr]}>Curr.</Text>

            <Text style={[s.th, s.cAmount, s.right]}>Amount</Text>
          </View>

          {adjustedCharges.map((charge, i) => (
            <View key={i} style={s.tableRow}>
              <Text style={[s.td, s.cDesc]}>{charge.name.toUpperCase()}</Text>

              <Text style={[s.td, s.cBasis]}>Per Shipment</Text>

              <Text style={[s.td, s.cQty, s.center]}>1</Text>

              <Text style={[s.td, s.cTransit]}>
                {i === 0 ? `${quote.tatDays} Days` : "-"}
              </Text>

              <Text style={[s.td, s.cCurr]}>{quote.currency}</Text>

              <Text style={[s.td, s.cAmount, s.right]}>
                {fmt(charge.amount, charge.currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* ===================================================== */}
        {/* TOTALS */}
        {/* ===================================================== */}

        <View style={s.totalsWrap}>
          <View style={s.totalsBox}>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Subtotal</Text>

              <Text style={s.totalsValue}>{fmt(subtotal, quote.currency)}</Text>
            </View>

            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>GST / Taxes</Text>

              <Text style={s.totalsValue}>{fmt(tax, quote.currency)}</Text>
            </View>

            <View style={s.grandTotal}>
              <Text style={s.grandLabel}>TOTAL QUOTED</Text>

              <Text style={s.grandValue}>{fmt(total, quote.currency)}</Text>
            </View>
          </View>
        </View>

        {/* ===================================================== */}
        {/* NOTES */}
        {/* ===================================================== */}

        <View style={s.noteBox}>
          <Text style={s.sectionTitle}>Operational Notes</Text>

          <Text style={s.noteText}>
            Rates valid until {fmtDate(validity)} subject to carrier approval and available capacity.
          </Text>

          <Text style={s.noteText}>
            Additional surcharges may apply for remote areas, oversized cargo,
            and restricted commodities.
          </Text>

          <Text style={s.noteText}>
            Final billing shall be based on actual chargeable weight verified at
            shipment acceptance.
          </Text>
        </View>

        {/* ===================================================== */}
        {/* TERMS */}
        {/* ===================================================== */}

        <View style={s.termsBox}>
          <Text style={s.sectionTitle}>Terms & Conditions</Text>

          <View style={s.termsGrid}>
            <View style={s.termCol}>
              {TERMS.slice(0, 4).map((term, i) => (
                <Text key={i} style={s.term}>
                  {i + 1}. {term}
                </Text>
              ))}
            </View>

            <View style={s.termCol}>
              {TERMS.slice(4).map((term, i) => (
                <Text key={i} style={s.term}>
                  {i + 5}. {term}
                </Text>
              ))}
            </View>
          </View>
        </View>

        {/* ===================================================== */}
        {/* SIGNATURE */}
        {/* ===================================================== */}

     <View style={s.signatureRow}>
  <View style={s.signBox}>

    <Image
      src="/s_i_g.png"
      style={s.signatureImage}
    />

    <View style={s.signLine} />

    <Text style={s.signatureName}>
      Authorised Signatory
    </Text>

    <Text style={s.signText}>
      Arena Cargo And Logistics India Private Limited
    </Text>
  </View>
</View>

        {/* ===================================================== */}
        {/* FOOTER */}
        {/* ===================================================== */}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            This quotation is confidential and intended solely for the named
            recipient.
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
