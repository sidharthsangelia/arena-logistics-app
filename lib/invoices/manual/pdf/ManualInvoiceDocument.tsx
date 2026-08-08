/**
 * lib/invoices/manual/pdf/ManualInvoiceDocument.tsx
 *
 * The manual invoice, as a document. Two variants of one document, chosen by
 * the `variant` prop, so the content, the money and the wrap rules are written
 * once and only the presentation differs:
 *
 *   "arena"  the restrained house style, matching the booking tax invoice.
 *            Structure from whitespace, alignment and weight; two filled
 *            panels and hairlines everywhere else.
 *   "grid"   the denser bordered grid freight customers are used to, closer to
 *            the format Arena works to today: banded heads, ruled cells.
 *
 * Both are held to the same rules, because those are about the document being
 * correct rather than about how it looks:
 *
 *   - Rule 46 of the CGST Rules: supplier identity and GSTIN, a consecutive
 *     serial, the date, the recipient's identity and GSTIN, place of supply,
 *     SAC, description, taxable value, rate, tax amount, whether tax is payable
 *     on reverse charge, and a signature.
 *   - Reimbursements are shown BELOW the taxed lines and subtotalled
 *     separately, labelled as amounts paid on the customer's behalf. They are
 *     in the total and outside the tax, and a reader must be able to see that
 *     without doing arithmetic.
 *   - Anything absent is not printed, rather than printed empty. An invoice for
 *     warehousing has no AWB and no route, and a row of dashes where they would
 *     be reads as missing data rather than as a different kind of job.
 *
 * ── HOW IT WRAPS ────────────────────────────────────────────────────────────
 * Unlike the booking invoice, this one is NOT held to a single page. A monthly
 * bill with fifteen consignments genuinely needs more, and squeezing it would
 * make the common case worse to serve the rare one. What is controlled is where
 * the break falls:
 *
 *   - the masthead, the party band and the totals row are `wrap={false}`, so a
 *     section label is never stranded at the foot of a page,
 *   - each consignment travels with its own charges,
 *   - the invoice and party names repeat in the page footer, so a loose second
 *     sheet still belongs to an invoice.
 *
 * ── A @react-pdf/renderer TRAP ──────────────────────────────────────────────
 * A `fixed` wrapper View holding the footer as children renders as nothing on a
 * full page, and so does any Text using the `render` callback. Both work in
 * isolation, which is what makes it worth writing down. The footer is therefore
 * separately positioned `fixed` elements with static text, and there is no page
 * numbering for that reason rather than a design one. See invoicingSystem.md §3.
 */

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { ManualInvoiceDocType, TaxMode } from "@/generated/prisma";

import { ARENA_LOGO_DATA_URI } from "../../tax/pdf/logo";
import type {
  ManualConsignmentSnapshot,
  ManualInvoiceDocumentData,
} from "../types";

export type ManualInvoiceVariant = "arena" | "grid";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const C = {
  ink: "#101828",
  muted: "#667085",
  faint: "#98A2B3",
  rule: "#E4E7EC",
  ruleStrong: "#98A2B3",
  panel: "#F8FAFB",
  alert: "#B42318",
  /** The grid variant's banded heads. Structural, not decorative. */
  band: "#1D4E89",
  bandInk: "#FFFFFF",
  gridRule: "#C6CDD5",
  gridZebra: "#F4F6F8",
};

/** Charges table columns. Shared by the head and the rows in both variants. */
const COL = {
  sac: 44,
  qty: 30,
  rate: 58,
  taxable: 62,
  gstRate: 30,
  gst: 58,
  amount: 66,
};

const s = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 46,
    paddingHorizontal: 34,
    fontSize: 8.5,
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
  logo: { width: 112, marginBottom: 6 },
  sellerName: { fontSize: 9, fontFamily: "Helvetica-Bold", lineHeight: 1.3 },
  sellerLine: { fontSize: 7.5, color: C.muted, lineHeight: 1.5 },
  sellerIds: { fontSize: 7.5, color: C.ink, lineHeight: 1.5 },

  mastheadRight: { alignItems: "flex-end", paddingLeft: 20 },
  docTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", letterSpacing: 2, textAlign: "right" },
  docCopy: { fontSize: 6.5, color: C.faint, letterSpacing: 0.9, textAlign: "right", marginTop: 3 },
  docNumber: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: 8 },
  docDate: { fontSize: 8, color: C.muted, textAlign: "right", marginTop: 2 },
  statusMark: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    color: C.alert,
    textAlign: "right",
    marginTop: 4,
  },

  // ── bands ──
  band: { marginTop: 10 },
  bandHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  label: { fontSize: 7, color: C.muted, letterSpacing: 1.1 },
  labelNote: { fontSize: 7, color: C.faint, letterSpacing: 0.4 },
  rule: { borderTopWidth: 0.5, borderTopColor: C.rule },

  // The grid variant's filled section head.
  gridBandHead: {
    backgroundColor: C.band,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginBottom: 0,
  },
  gridBandLabel: {
    fontSize: 7,
    color: C.bandInk,
    letterSpacing: 1.1,
    fontFamily: "Helvetica-Bold",
  },

  // ── party panel ──
  panel: {
    marginTop: 8,
    flexDirection: "row",
    backgroundColor: C.panel,
    borderWidth: 0.5,
    borderColor: C.rule,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  panelGrid: {
    marginTop: 0,
    flexDirection: "row",
    borderWidth: 0.5,
    borderColor: C.gridRule,
    borderRadius: 0,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  panelColumn: { width: "50%", paddingRight: 12 },
  panelLabel: { fontSize: 6.5, color: C.faint, letterSpacing: 0.9, marginBottom: 4 },
  partyName: { fontSize: 9.5, fontFamily: "Helvetica-Bold", lineHeight: 1.3 },
  detail: { fontSize: 7.5, color: C.muted, lineHeight: 1.5 },

  factLine: { flexDirection: "row", marginTop: 2 },
  factLabel: { width: 62, fontSize: 7, color: C.faint },
  factValue: { flex: 1, fontSize: 7.5, lineHeight: 1.35 },
  factValueStrong: { flex: 1, fontSize: 7.5, fontFamily: "Helvetica-Bold" },

  // ── consignments ──
  consignment: { marginTop: 7 },
  consignmentHead: { flexDirection: "row", alignItems: "baseline" },
  consignmentIndex: { width: 16, fontSize: 8, color: C.muted },
  consignmentAwb: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  consignmentRoute: { fontSize: 8, marginLeft: 6, color: C.ink },
  consignmentNet: { marginLeft: "auto", fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  consignmentFacts: { flexDirection: "row", flexWrap: "wrap", marginLeft: 16, marginTop: 2 },
  chip: { paddingRight: 16, paddingTop: 2 },
  chipLabel: { fontSize: 6, color: C.faint, letterSpacing: 0.8 },
  chipValue: { fontSize: 7.5, lineHeight: 1.3 },

  consignmentGrid: {
    marginTop: 0,
    borderWidth: 0.5,
    borderTopWidth: 0,
    borderColor: C.gridRule,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },

  // ── charges table ──
  tableHead: { flexDirection: "row", paddingTop: 6, paddingBottom: 5 },
  tableHeadGrid: {
    flexDirection: "row",
    backgroundColor: C.band,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  headCell: { fontSize: 6.5, color: C.muted, letterSpacing: 0.8 },
  headCellGrid: {
    fontSize: 6.5,
    color: C.bandInk,
    letterSpacing: 0.6,
    fontFamily: "Helvetica-Bold",
  },
  row: { flexDirection: "row", paddingTop: 5, paddingBottom: 1 },
  rowGrid: {
    flexDirection: "row",
    paddingVertical: 3.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: C.gridRule,
  },
  rowZebra: { backgroundColor: C.gridZebra },
  rowDescription: { flex: 1, paddingRight: 10 },
  descriptionText: { fontSize: 8.5, lineHeight: 1.3 },
  descriptionNote: { fontSize: 6.5, color: C.faint, lineHeight: 1.3 },
  cell: { fontSize: 8, textAlign: "right" },
  cellMuted: { fontSize: 7.5, color: C.muted, textAlign: "right" },

  subtotalRow: {
    flexDirection: "row",
    paddingTop: 6,
    marginTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
  },
  reimbursementNote: { fontSize: 7, color: C.muted, marginTop: 4, lineHeight: 1.4 },

  // ── bottom ──
  bottomRow: { flexDirection: "row", marginTop: 11, alignItems: "flex-start" },
  bottomLeft: { flex: 1, paddingRight: 20 },
  totalsPanel: {
    width: 250,
    backgroundColor: C.panel,
    borderWidth: 0.5,
    borderColor: C.rule,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  totalsPanelGrid: { borderRadius: 0, borderColor: C.gridRule, backgroundColor: "#FFFFFF" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  totalsLabel: { fontSize: 8, color: C.muted },
  totalsValue: { fontSize: 8, textAlign: "right" },
  totalsRule: {
    borderTopWidth: 0.75,
    borderTopColor: C.ruleStrong,
    marginTop: 4,
    marginBottom: 7,
  },
  grandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  grandLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  grandValue: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "right" },
  words: { fontSize: 7, color: C.muted, marginTop: 5, textAlign: "right" },
  taxNote: { fontSize: 7.5, color: C.muted, marginTop: 6, textAlign: "right", lineHeight: 1.4 },

  bankLine: { fontSize: 7.5, color: C.muted, lineHeight: 1.5 },
  termLine: { fontSize: 7, color: C.muted, lineHeight: 1.5, marginTop: 2 },

  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 12,
  },
  signature: { alignItems: "flex-end" },
  signatureFor: { fontSize: 7.5, color: C.muted },
  signatureName: { fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "right", lineHeight: 1.3 },
  signatureRole: { fontSize: 7.5, color: C.muted, marginTop: 16 },
  declaration: { width: "58%", fontSize: 7, color: C.faint, lineHeight: 1.5 },

  // ── fixed foot ──
  pageFootRule: {
    position: "absolute",
    bottom: 36,
    left: 34,
    right: 34,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
  },
  pageFootText: {
    position: "absolute",
    bottom: 27,
    left: 34,
    right: 34,
    fontSize: 6.5,
    color: C.faint,
    textAlign: "center",
  },
  jurisdiction: {
    position: "absolute",
    bottom: 17,
    left: 34,
    right: 34,
    fontSize: 6.5,
    color: C.muted,
    letterSpacing: 0.9,
    textAlign: "center",
  },
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** 1,23,456.78 for INR; plain grouping for everything else. */
function money(amount: number, currency: string): string {
  const negative = amount < 0;
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, fraction] = fixed.split(".");

  const grouped =
    currency === "INR"
      ? (() => {
          const last3 = whole.slice(-3);
          const rest = whole.slice(0, -3);
          return rest
            ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`
            : last3;
        })()
      : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function trim(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/**
 * An IRN is 64 unbroken hex characters, and @react-pdf/renderer will not break
 * a word without a break opportunity in it: left alone it runs straight out of
 * the panel and off the page. Grouping into eights inserts the break
 * opportunities and is also how the portal displays it, so it stays checkable
 * against the source by eye.
 */
function chunked(value: string | null, size = 8): string | null {
  if (!value) return null;
  return value.replace(new RegExp(`(.{${size}})`, "g"), "$1 ").trim();
}

/**
 * Only the ends that exist. "Gurugram, Haryana to Dubai", or nothing at all.
 *
 * Reads the stored label, falling back to the structured fields when an older
 * invoice carries them and no label. Never composes from the pincode: a bare
 * six-digit number on the route line of a tax invoice locates nothing for the
 * person reading it.
 */
function routeEndLabel(
  label: string | null,
  city: string | null,
  state: string | null,
  country: string | null,
): string | null {
  const explicit = label?.trim();
  if (explicit) return explicit;

  const parts =
    country && country !== "India"
      ? [city?.trim(), country.trim()]
      : [city?.trim(), state?.trim()];

  return parts.filter(Boolean).join(", ") || null;
}

function route(c: ManualConsignmentSnapshot): string | null {
  const from = routeEndLabel(
    c.origin,
    c.originCity ?? null,
    c.originState ?? null,
    c.originCountry ?? null,
  );
  const to = routeEndLabel(
    c.destination,
    c.destinationCity ?? null,
    c.destinationState ?? null,
    c.destinationCountry ?? null,
  );

  if (from && to) return `${from} to ${to}`;
  return from ?? to ?? null;
}

function splitLegalName(name: string): [string] | [string, string] {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return [name.trim()];

  let bestIndex = 1;
  let bestDelta = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const delta = Math.abs(
      words.slice(0, i).join(" ").length - words.slice(i).join(" ").length,
    );
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }
  return [words.slice(0, bestIndex).join(" "), words.slice(bestIndex).join(" ")];
}

/**
 * The total in words. Indian numbering, because that is what a rupee invoice is
 * read in, and because "amount in words" is the line a bank clerk checks.
 */
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty",
  "Ninety",
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t} ${o}` : t;
}

function inWords(value: number): string {
  const whole = Math.floor(Math.abs(value));
  const paise = Math.round((Math.abs(value) - whole) * 100);
  if (whole === 0 && paise === 0) return "Zero";

  const parts: string[] = [];
  const push = (n: number, unit: string) => {
    if (n > 0) parts.push(`${twoDigits(n)} ${unit}`.trim());
  };

  push(Math.floor(whole / 10_000_000), "Crore");
  push(Math.floor((whole % 10_000_000) / 100_000), "Lakh");
  push(Math.floor((whole % 100_000) / 1000), "Thousand");
  push(Math.floor((whole % 1000) / 100), "Hundred");

  const tail = whole % 100;
  if (tail > 0) parts.push(twoDigits(tail));

  const rupees = parts.join(" ") || "Zero";
  return paise > 0 ? `${rupees} and ${twoDigits(paise)} Paise` : rupees;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Band({
  label,
  note,
  variant,
  keepTogether,
  children,
}: {
  label: string;
  note?: string | null;
  variant: ManualInvoiceVariant;
  keepTogether?: boolean;
  children: React.ReactNode;
}) {
  if (variant === "grid") {
    return (
      <View style={s.band} wrap={!keepTogether}>
        <View style={s.gridBandHead}>
          <Text style={s.gridBandLabel}>{label.toUpperCase()}</Text>
        </View>
        {children}
      </View>
    );
  }

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
  value: string | null;
  strong?: boolean;
}) {
  if (!value) return null;
  return (
    <View style={s.factLine}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={strong ? s.factValueStrong : s.factValue}>{value}</Text>
    </View>
  );
}

function Chip({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={s.chip}>
      <Text style={s.chipLabel}>{label.toUpperCase()}</Text>
      <Text style={s.chipValue}>{value}</Text>
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

export function ManualInvoiceDocument({
  data,
  variant = "arena",
}: {
  data: ManualInvoiceDocumentData;
  variant?: ManualInvoiceVariant;
}) {
  const { seller, buyer } = data;
  const grid = variant === "grid";
  const cur = data.currency;

  const isCreditNote = data.docType === ManualInvoiceDocType.CREDIT_NOTE;
  const title = isCreditNote ? "CREDIT NOTE" : "TAX INVOICE";

  const taxedLines = data.lineItems.filter((l) => !l.reimbursement);
  const recoveries = data.lineItems.filter((l) => l.reimbursement);

  // Columns that would be empty or meaningless for the whole document are not
  // printed at all.
  //
  // QTY is gated on RATE rather than judged on its own. A folded line sums the
  // quantities of every row behind it, so an invoice whose rows priced freight
  // per kg at three different rates prints one line with a quantity of 459 and
  // no rate. That figure multiplies out to nothing on the page, and a number a
  // reader cannot reconcile is worse than a column that is not there.
  const showRate = taxedLines.some((l) => l.rate !== null && l.rate > 0);
  const showQty = showRate && taxedLines.some((l) => l.quantity !== 1);

  const sellerAddress = [
    ...seller.addressLines,
    [seller.city, seller.stateName, seller.postalCode].filter(Boolean).join(" "),
  ].filter(Boolean);

  const buyerAddress = [
    ...buyer.addressLines,
    [buyer.city, buyer.stateName, buyer.postalCode].filter(Boolean).join(" "),
    buyer.country && buyer.country !== "India" ? buyer.country : null,
  ].filter(Boolean);

  const legalNameLines = splitLegalName(seller.legalName);

  return (
    <Document
      title={`${title} ${data.invoiceNumber}`}
      author={seller.legalName}
      subject={`${title} for ${buyer.legalName}`}
    >
      <Page size="A4" style={s.page}>
        {/* ── masthead ─────────────────────────────────────────────────── */}
        <View style={s.masthead} wrap={false}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image src={ARENA_LOGO_DATA_URI} style={s.logo} />
            <Text style={s.sellerName}>{seller.legalName}</Text>
            {sellerAddress.map((line, i) => (
              <Text key={i} style={s.sellerLine}>
                {line}
              </Text>
            ))}
            <Text style={s.sellerIds}>GSTIN {seller.gstin}</Text>
            <Text style={s.sellerIds}>PAN {seller.pan}</Text>
          </View>

          <View style={s.mastheadRight}>
            <Text style={s.docTitle}>{title}</Text>
            <Text style={s.docCopy}>ORIGINAL FOR RECIPIENT</Text>
            <Text style={s.docNumber}>{data.invoiceNumber}</Text>
            <Text style={s.docDate}>{formatDate(data.issueDate)}</Text>
            {data.dueDate ? (
              <Text style={s.docDate}>Due {formatDate(data.dueDate)}</Text>
            ) : null}
            {data.cancelled ? <Text style={s.statusMark}>CANCELLED</Text> : null}
            {/* A preview renders the real template on purpose, so the only
                thing separating it from an issued invoice is this line and the
                placeholder in the number slot. Both have to be there. */}
            {data.draft ? (
              <Text style={s.statusMark}>PREVIEW ONLY, NOT ISSUED</Text>
            ) : null}
            {isCreditNote && data.relatedInvoiceNumber ? (
              <Text style={s.docDate}>Against {data.relatedInvoiceNumber}</Text>
            ) : null}
          </View>
        </View>

        {/* ── who and what ─────────────────────────────────────────────── */}
        <Band label="Invoice details" variant={variant} keepTogether>
          <View style={grid ? s.panelGrid : s.panel}>
            <View style={s.panelColumn}>
              <Text style={s.panelLabel}>BILLED TO</Text>
              <Text style={s.partyName}>{buyer.legalName}</Text>
              {buyer.tradeName ? (
                <Text style={s.detail}>{buyer.tradeName}</Text>
              ) : null}
              {buyerAddress.map((line, i) => (
                <Text key={i} style={s.detail}>
                  {line}
                </Text>
              ))}
              {/* A company with no GSTIN is meaningfully unregistered and the
                  document should say so. A person has no GSTIN to be missing,
                  so the row is dropped rather than filled with a word that
                  reports the absence of something never expected. */}
              {buyer.kind === "INDIVIDUAL" ? null : (
                <Fact
                  label="GSTIN"
                  value={buyer.gstin ?? "Unregistered"}
                  strong={!!buyer.gstin}
                />
              )}
              <Fact label="PAN" value={buyer.pan} />
              <Fact label="CIN" value={buyer.cin} />
              <Fact
                label="Place of supply"
                value={
                  data.placeOfSupplyName
                    ? `${data.placeOfSupplyName} (${data.placeOfSupplyCode})`
                    : data.placeOfSupplyCode
                }
              />
              <Fact label="Customer code" value={buyer.customerCode} />
            </View>

            <View style={s.panelColumn}>
              <Text style={s.panelLabel}>INVOICE</Text>
              <Fact label="Reference" value={data.reference} />
              <Fact label="Terms" value={data.paymentTermsLabel} />
              <Fact label="Category" value={data.csbLabel} />
              <Fact
                label="Reverse charge"
                value={data.reverseCharge ? "Yes" : "No"}
              />
              <Fact
                label="Pricing"
                value={
                  data.taxMode === TaxMode.INCLUSIVE
                    ? "Amounts include GST"
                    : "GST charged on the amounts shown"
                }
              />
              <Fact label="IRN" value={chunked(data.irn)} />
              <Fact label="Ack no." value={data.irnAckNo} />
              <Fact label="Ack date" value={formatDate(data.irnAckDate)} />
            </View>
          </View>
        </Band>

        {/* ── consignments ─────────────────────────────────────────────── */}
        {data.consignments.length > 0 ? (
          <Band
            label={data.consignments.length === 1 ? "Consignment" : "Consignments"}
            note={
              data.consignments.length > 1
                ? `${data.consignments.length} on this invoice`
                : null
            }
            variant={variant}
          >
            <View style={grid ? s.consignmentGrid : undefined}>
              {data.consignments.map((c, index) => (
                // Each consignment travels with its own facts. A break through
                // one would separate an AWB from its route and weights.
                <View key={index} style={s.consignment} wrap={false}>
                  <View style={s.consignmentHead}>
                    {data.consignments.length > 1 ? (
                      <Text style={s.consignmentIndex}>{index + 1}</Text>
                    ) : null}
                    <Text style={s.consignmentAwb}>
                      {c.awbNumber ?? c.jobNumber ?? c.referenceNo ?? "Services"}
                    </Text>
                    {route(c) ? (
                      <Text style={s.consignmentRoute}>{route(c)}</Text>
                    ) : null}
                    <Text style={s.consignmentNet}>
                      {money(c.netAmount, cur)}
                    </Text>
                  </View>

                  <View style={s.consignmentFacts}>
                    <Chip label="Service" value={c.serviceType} />
                    <Chip label="Booked" value={formatDate(c.bookingDate)} />
                    <Chip label="MAWB" value={c.mawbNumber} />
                    <Chip label="Flight" value={c.flightNumber} />
                    <Chip label="Airline" value={c.airlineName} />
                    <Chip
                      label="Ports"
                      value={
                        c.originPort && c.destinationPort
                          ? `${c.originPort} / ${c.destinationPort}`
                          : (c.originPort ?? c.destinationPort)
                      }
                    />
                    <Chip label="Pcs" value={c.pieces === null ? null : String(c.pieces)} />
                    <Chip
                      label="Gross wt"
                      value={c.grossWeightKg === null ? null : `${trim(c.grossWeightKg)} kg`}
                    />
                    <Chip
                      label="Ch. wt"
                      value={
                        c.chargeableWeightKg === null
                          ? null
                          : `${trim(c.chargeableWeightKg)} kg`
                      }
                    />
                    <Chip
                      label="Packing"
                      value={
                        [
                          c.boxCount ? `${c.boxCount} box` : null,
                          c.palletCount ? `${c.palletCount} pallet` : null,
                          c.cartonCount ? `${c.cartonCount} carton` : null,
                        ]
                          .filter(Boolean)
                          .join(", ") || null
                      }
                    />
                    <Chip label="Container" value={c.containerNumber} />
                    <Chip label="Job" value={c.jobNumber} />
                    <Chip label="Ref" value={c.referenceNo} />
                    <Chip label="Shipper" value={c.shipperName} />
                    <Chip label="Consignee" value={c.consigneeName} />
                    <Chip label="Forwarder" value={c.forwarderName} />
                    <Chip label="Sub agent" value={c.subAgent} />
                    <Chip label="Export inv." value={c.exportInvoiceNo} />
                    <Chip label="Goods" value={c.goodsDescription} />
                    <Chip label="Particulars" value={c.particulars} />
                  </View>
                </View>
              ))}
            </View>
          </Band>
        ) : null}

        {/* ── charges ──────────────────────────────────────────────────── */}
        <Band
          label="Charges"
          note={
            data.consignments.length > 1
              ? "totalled across all consignments"
              : null
          }
          variant={variant}
        >
          <View style={grid ? s.tableHeadGrid : s.tableHead}>
            <View style={s.rowDescription}>
              <Text style={grid ? s.headCellGrid : s.headCell}>DESCRIPTION</Text>
            </View>
            <Text style={[grid ? s.headCellGrid : s.headCell, { width: COL.sac, textAlign: "right" }]}>
              SAC
            </Text>
            {showQty ? (
              <Text style={[grid ? s.headCellGrid : s.headCell, { width: COL.qty, textAlign: "right" }]}>
                QTY
              </Text>
            ) : null}
            {showRate ? (
              <Text style={[grid ? s.headCellGrid : s.headCell, { width: COL.rate, textAlign: "right" }]}>
                RATE
              </Text>
            ) : null}
            <Text style={[grid ? s.headCellGrid : s.headCell, { width: COL.taxable, textAlign: "right" }]}>
              TAXABLE
            </Text>
            <Text style={[grid ? s.headCellGrid : s.headCell, { width: COL.gstRate, textAlign: "right" }]}>
              GST
            </Text>
            <Text style={[grid ? s.headCellGrid : s.headCell, { width: COL.gst, textAlign: "right" }]}>
              {data.isIntraState ? "CGST+SGST" : "IGST"}
            </Text>
            <Text style={[grid ? s.headCellGrid : s.headCell, { width: COL.amount, textAlign: "right" }]}>
              AMOUNT
            </Text>
          </View>

          {taxedLines.map((line, index) => (
            <View
              key={index}
              style={
                grid
                  ? [s.rowGrid, index % 2 === 1 ? s.rowZebra : {}]
                  : s.row
              }
              wrap={false}
            >
              <View style={s.rowDescription}>
                <Text style={s.descriptionText}>{line.description}</Text>
              </View>
              <Text style={[s.cellMuted, { width: COL.sac }]}>{line.sacCode}</Text>
              {showQty ? (
                <Text style={[s.cellMuted, { width: COL.qty }]}>
                  {trim(line.quantity)}
                </Text>
              ) : null}
              {showRate ? (
                <Text style={[s.cellMuted, { width: COL.rate }]}>
                  {line.rate === null ? "" : money(line.rate, cur)}
                </Text>
              ) : null}
              <Text style={[s.cell, { width: COL.taxable }]}>
                {money(line.taxableValue, cur)}
              </Text>
              <Text style={[s.cellMuted, { width: COL.gstRate }]}>
                {line.ratePercent > 0 ? `${trim(line.ratePercent)}%` : "-"}
              </Text>
              <Text style={[s.cell, { width: COL.gst }]}>
                {money(
                  line.cgstAmount + line.sgstAmount + line.igstAmount,
                  cur,
                )}
              </Text>
              <Text style={[s.cell, { width: COL.amount }]}>
                {money(line.lineTotal, cur)}
              </Text>
            </View>
          ))}

          {/* Recoveries sit BELOW the taxed lines and outside the tax columns,
              so a reader scanning the GST column reaches the end of it cleanly
              and can see these are not part of it. */}
          {recoveries.length > 0 ? (
            <View wrap={false}>
              <View style={s.subtotalRow}>
                <View style={s.rowDescription}>
                  <Text style={[s.descriptionText, { fontFamily: "Helvetica-Bold" }]}>
                    Amounts paid on your behalf
                  </Text>
                </View>
              </View>
              {recoveries.map((line, index) => (
                <View
                  key={index}
                  style={
                    grid
                      ? [s.rowGrid, index % 2 === 1 ? s.rowZebra : {}]
                      : s.row
                  }
                  wrap={false}
                >
                  <View style={s.rowDescription}>
                    <Text style={s.descriptionText}>{line.description}</Text>
                  </View>
                  <Text style={[s.cellMuted, { width: COL.sac }]}>-</Text>
                  {showQty ? <Text style={[s.cellMuted, { width: COL.qty }]} /> : null}
                  {showRate ? <Text style={[s.cellMuted, { width: COL.rate }]} /> : null}
                  <Text style={[s.cellMuted, { width: COL.taxable }]}>-</Text>
                  <Text style={[s.cellMuted, { width: COL.gstRate }]}>-</Text>
                  <Text style={[s.cellMuted, { width: COL.gst }]}>-</Text>
                  <Text style={[s.cell, { width: COL.amount }]}>
                    {money(line.lineTotal, cur)}
                  </Text>
                </View>
              ))}
              <Text style={s.reimbursementNote}>
                Recovered at cost as your agent. No GST is charged on these
                amounts and they form no part of the taxable value above.
              </Text>
            </View>
          ) : null}
        </Band>

        {/* ── terms and total ──────────────────────────────────────────── */}
        <View style={s.bottomRow} wrap={false}>
          <View style={s.bottomLeft}>
            {seller.bank ? (
              <>
                <Text style={s.label}>PAYMENT</Text>
                <View style={[s.rule, { marginBottom: 4 }]} />
                <Text style={s.bankLine}>{seller.bank.accountName}</Text>
                <Text style={s.bankLine}>
                  {seller.bank.bankName}
                  {seller.bank.branch ? `, ${seller.bank.branch}` : ""}
                </Text>
                <Text style={s.bankLine}>A/C {seller.bank.accountNumber}</Text>
                <Text style={s.bankLine}>IFSC {seller.bank.ifsc}</Text>
              </>
            ) : null}

            {data.terms.length > 0 ? (
              <View style={{ marginTop: seller.bank ? 9 : 0 }}>
                <Text style={s.label}>TERMS</Text>
                <View style={[s.rule, { marginBottom: 4 }]} />
                {data.terms.map((term, i) => (
                  <Text key={i} style={s.termLine}>
                    {term}
                  </Text>
                ))}
              </View>
            ) : null}

            {data.notes ? (
              <View style={{ marginTop: 9 }}>
                <Text style={s.label}>NOTES</Text>
                <View style={[s.rule, { marginBottom: 4 }]} />
                <Text style={s.termLine}>{data.notes}</Text>
              </View>
            ) : null}
          </View>

          <View style={[s.totalsPanel, ...(grid ? [s.totalsPanelGrid] : [])]}>
            <TotalsRow
              label="Taxable value"
              value={money(data.taxableValue, cur)}
            />
            {data.isIntraState ? (
              <>
                <TotalsRow label="CGST" value={money(data.cgstAmount, cur)} />
                <TotalsRow label="SGST" value={money(data.sgstAmount, cur)} />
              </>
            ) : (
              <TotalsRow label="IGST" value={money(data.igstAmount, cur)} />
            )}
            {data.reimbursements > 0 ? (
              <TotalsRow
                label="Paid on your behalf"
                value={money(data.reimbursements, cur)}
              />
            ) : null}

            <View style={s.totalsRule} />

            <View style={s.grandRow}>
              <Text style={s.grandLabel}>TOTAL {cur}</Text>
              <Text style={s.grandValue}>{money(data.total, cur)}</Text>
            </View>

            {cur === "INR" ? (
              <Text style={s.words}>{inWords(data.total)} Rupees only</Text>
            ) : null}

            {data.taxNote ? (
              <Text style={s.taxNote}>{data.taxNote}</Text>
            ) : null}
          </View>
        </View>

        {/* ── declaration and signature ────────────────────────────────── */}
        <View style={s.signatureRow} wrap={false}>
          <Text style={s.declaration}>{seller.declaration}</Text>
          <View style={s.signature}>
            <Text style={s.signatureFor}>For</Text>
            {legalNameLines.map((line, i) => (
              <Text key={i} style={s.signatureName}>
                {line}
              </Text>
            ))}
            <Text style={s.signatureRole}>Authorised signatory</Text>
          </View>
        </View>

        {/* ── fixed foot. Separate positioned elements: see the header. ── */}
        <View style={s.pageFootRule} fixed />
        <Text style={s.pageFootText} fixed>
          {`${data.invoiceNumber}    ${buyer.legalName}    ${seller.billingEmail}`}
        </Text>
        <Text style={s.jurisdiction} fixed>
          {`SUBJECT TO ${seller.jurisdiction.toUpperCase()} JURISDICTION`}
        </Text>
      </Page>
    </Document>
  );
}
