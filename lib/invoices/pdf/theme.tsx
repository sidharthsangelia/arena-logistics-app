/**
 * lib/invoices/pdf/theme.tsx
 *
 * The presentation layer both invoice templates are drawn with.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * There are two invoice documents, and there will go on being two: the booking
 * invoice describes one shipment and its boxes, the manual invoice describes a
 * month of consignments, and forcing either into the other's shape loses real
 * content. What there must NOT be two of is a house style. This module is the
 * half they share: the palette, the repeated shapes, the number formatting and
 * the two variants. Each document keeps its own StyleSheet for the things that
 * genuinely differ, which is column widths and a point or two of type size.
 *
 * The rule for deciding where something belongs: if changing it in one document
 * and not the other would make the pair look like two companies, it lives here.
 *
 * ── THE TWO VARIANTS ────────────────────────────────────────────────────────
 * "grid"   bordered and banded. Blue section heads, ruled cells, zebra rows.
 *          What freight customers are used to reading, and the default.
 * "arena"  typographic and quiet. Structure from whitespace, alignment and
 *          weight; hairlines instead of borders.
 *
 * Both are held to the same correctness rules, because those are about the
 * document being a tax invoice rather than about how it looks. See
 * ManualInvoiceDocument's header for the Rule 46 checklist.
 *
 * ── A @react-pdf/renderer TRAP ──────────────────────────────────────────────
 * A `fixed` wrapper View holding a page footer as children renders as nothing
 * on a full page, and so does any Text using the `render` callback. Both work
 * in isolation, which is what makes it worth writing down. Footers are
 * therefore separately positioned `fixed` elements with static text, and there
 * is no page numbering for that reason rather than a design one.
 */

import { StyleSheet, Text, View } from "@react-pdf/renderer";

import type { InvoiceVariant } from "./variant";

export type { InvoiceVariant };

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export const C = {
  ink: "#101828", // the content
  muted: "#667085", // labels and support
  faint: "#98A2B3", // the quietest tier, used sparingly
  rule: "#E4E7EC", // section rules, deliberately lighter than the eye expects
  ruleStrong: "#98A2B3", // the one rule above the total
  panel: "#F8FAFB", // the filled panels. Barely a fill, on purpose
  alert: "#B42318", // unpaid / cancelled / preview only

  /** The grid variant's banded heads. Structural, not decorative. */
  band: "#1D4E89",
  bandInk: "#FFFFFF",
  gridRule: "#C6CDD5",
  gridZebra: "#F4F6F8",

  /**
   * The payment block's tint, and its left edge.
   *
   * A wash of the band blue rather than the neutral grey the other panels use.
   * This is the one block on the page a reader goes looking for rather than
   * reads in order: somebody with the invoice open and their banking app in the
   * other hand needs to find the account number without reading the terms above
   * it. Tinting it is what makes it findable, and tying the tint to the band
   * colour is what stops it reading as a third unrelated panel.
   */
  payPanel: "#EEF3F9",
  payEdge: "#1D4E89",
} as const;

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export const t = StyleSheet.create({
  // ── section band ──
  // Every band opens the same way, so the reader learns the page once. In the
  // arena variant that is a grey letter-spaced label over a hairline; in grid
  // it is a filled blue strip. Same shape, different weight.
  // 8 rather than the 10 the rhythm started at. The booking invoice is held to
  // a single A4 sheet and three bands at 10 was two points a band it did not
  // have. Raise it only with a page-count check on both sample invoices.
  band: { marginTop: 8 },
  bandHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  label: { fontSize: 7, color: C.muted, letterSpacing: 1.1 },
  labelNote: { fontSize: 7, color: C.faint, letterSpacing: 0.4 },
  rule: { borderTopWidth: 0.5, borderTopColor: C.rule },

  gridBandHead: {
    backgroundColor: C.band,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginBottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gridBandLabel: {
    fontSize: 7,
    color: C.bandInk,
    letterSpacing: 1.1,
    fontFamily: "Helvetica-Bold",
  },
  gridBandNote: { fontSize: 6.5, color: C.bandInk, letterSpacing: 0.4 },

  // ── panels ──
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
    backgroundColor: "#FFFFFF",
    borderWidth: 0.5,
    borderColor: C.gridRule,
    borderRadius: 0,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  panelColumn: { width: "50%", paddingRight: 12 },
  panelLabel: {
    fontSize: 6.5,
    color: C.faint,
    letterSpacing: 0.9,
    marginBottom: 4,
  },

  // ── labelled lines ──
  // A grey label at a fixed width with the value beside it. Reads as a list of
  // answers rather than a paragraph, and costs one line each.
  factLine: { flexDirection: "row", marginTop: 2 },
  factLabel: { width: 62, fontSize: 7, color: C.faint },
  factValue: { flex: 1, fontSize: 7.5, lineHeight: 1.35 },
  factValueStrong: { flex: 1, fontSize: 7.5, fontFamily: "Helvetica-Bold" },

  // ── chips ──
  // Short label-and-value pairs flowing across a line. Read across as a
  // summary, not scanned down as a column, so the width is auto.
  chip: { paddingRight: 16, paddingTop: 2 },
  chipLabel: { fontSize: 6, color: C.faint, letterSpacing: 0.8 },
  chipValue: { fontSize: 7.5, lineHeight: 1.3 },

  // ── metrics ──
  // The louder cousin of a chip, for the three or four figures the cargo is
  // actually judged on.
  // Auto width rather than a fixed grid, because these are read across as a
  // summary rather than scanned down as a column. The gutter is tight on
  // purpose: five metrics have to sit on ONE line, and a sixth wrapping to a
  // second row costs the booking invoice its single page. Widen it and check
  // the page count before deciding it looks cramped.
  metrics: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  metric: { paddingRight: 18, paddingBottom: 2 },
  metricLabel: { fontSize: 6.5, color: C.faint, letterSpacing: 0.9 },
  metricValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 2,
    lineHeight: 1.25,
  },
  metricNote: { fontSize: 6.5, color: C.faint, marginTop: 1 },

  // ── totals ──
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  totalsLabel: { fontSize: 8, color: C.muted },
  totalsValue: { fontSize: 8, textAlign: "right" },

  // ── payment block ──
  // Tinted, with a blue left edge. See C.payPanel for why this one block is
  // allowed to stand out when the rest of the page is deliberately quiet.
  payPanel: {
    marginTop: 4,
    backgroundColor: C.payPanel,
    borderLeftWidth: 2,
    borderLeftColor: C.payEdge,
    borderRadius: 2,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  payPanelGrid: { borderRadius: 0 },
  payHead: {
    fontSize: 6.5,
    color: C.band,
    letterSpacing: 1,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  payLine: { flexDirection: "row", marginTop: 1 },
  payLabel: { width: 42, fontSize: 7, color: C.muted },
  /** The account number and IFSC are transcribed, so they are set to read
      digit by digit rather than as a word. */
  payValue: { flex: 1, fontSize: 8, color: C.ink, lineHeight: 1.35 },
  payValueStrong: {
    flex: 1,
    fontSize: 8.5,
    color: C.ink,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.4,
  },
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * 1,23,456.78 for rupees, 123,456.78 for everything else.
 *
 * Indian grouping is not decoration: it is how the figure is read back over the
 * phone by the person paying it, and a rupee total grouped in thousands is
 * misread as a different number.
 */
export function money(amount: number, currency = "INR"): string {
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

/** 40.5 → "40.5", 40 → "40". For figures that are read, not totalled. */
export function trim(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** A weight as it is printed everywhere on both documents. */
export function kg(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : `${value.toFixed(2)} kg`;
}

/**
 * Break a company's legal name across two lines at the word boundary that makes
 * the two halves closest in length.
 *
 * Used above the signature, where the column is narrow. Balancing rather than
 * filling matters because a 40 character line over a 6 character line reads as
 * a typo, not a design.
 */
export function splitLegalName(name: string): [string] | [string, string] {
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
 * Insert break opportunities into a long unbroken string.
 *
 * An IRN is 64 unbroken hex characters and @react-pdf/renderer will not break a
 * word that has no break opportunity in it: left alone it runs straight out of
 * the panel and off the page. Grouping into eights is also how the portal
 * displays it, so it stays checkable against the source by eye.
 */
export function chunked(value: string | null, size = 8): string | null {
  if (!value) return null;
  return value.replace(new RegExp(`(.{${size}})`, "g"), "$1 ").trim();
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * A section: a head, then content. The page's one repeated shape.
 *
 * `keepTogether` moves the whole band to the next page rather than let a break
 * fall inside it. For the short, indivisible ones: a section label stranded at
 * the foot of a page with its content overleaf is what makes an invoice that
 * does overflow look like an accident. Never set it on a band that can outgrow
 * a page, since a block taller than the page is clipped rather than moved.
 */
export function Band({
  label,
  note,
  variant,
  keepTogether,
  children,
}: {
  label: string;
  note?: string | null;
  variant: InvoiceVariant;
  keepTogether?: boolean;
  children: React.ReactNode;
}) {
  if (variant === "grid") {
    return (
      <View style={t.band} wrap={!keepTogether}>
        <View style={t.gridBandHead}>
          <Text style={t.gridBandLabel}>{label.toUpperCase()}</Text>
          {note ? <Text style={t.gridBandNote}>{note}</Text> : null}
        </View>
        {children}
      </View>
    );
  }

  return (
    <View style={t.band} wrap={!keepTogether}>
      <View style={t.bandHead}>
        <Text style={t.label}>{label.toUpperCase()}</Text>
        {note ? <Text style={t.labelNote}>{note}</Text> : null}
      </View>
      <View style={t.rule} />
      {children}
    </View>
  );
}

/** A labelled line inside a panel. Absent values print nothing at all. */
export function Fact({
  label,
  value,
  strong,
}: {
  label: string;
  value: string | null | undefined;
  strong?: boolean;
}) {
  if (!value) return null;
  return (
    <View style={t.factLine}>
      <Text style={t.factLabel}>{label}</Text>
      <Text style={strong ? t.factValueStrong : t.factValue}>{value}</Text>
    </View>
  );
}

/** A short label-and-value pair in a flowing row. */
export function Chip({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <View style={t.chip}>
      <Text style={t.chipLabel}>{label.toUpperCase()}</Text>
      <Text style={t.chipValue}>{value}</Text>
    </View>
  );
}

/** A headline figure, optionally with a line of explanation under it. */
export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string | null | undefined;
  note?: string | null;
}) {
  if (!value) return null;
  return (
    <View style={t.metric}>
      <Text style={t.metricLabel}>{label.toUpperCase()}</Text>
      <Text style={t.metricValue}>{value}</Text>
      {note ? <Text style={t.metricNote}>{note}</Text> : null}
    </View>
  );
}

export function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={t.totalsRow}>
      <Text style={t.totalsLabel}>{label}</Text>
      <Text style={t.totalsValue}>{value}</Text>
    </View>
  );
}

/** The bank details a reader has to transcribe, in the one tinted block. */
export interface InvoiceBank {
  accountName?: string | null;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch?: string | null;
}

/**
 * The bank block.
 *
 * `issuerName` suppresses the beneficiary line when it merely repeats the
 * issuer's own legal name, which is the usual case and which the masthead and
 * the signature already state twice. A beneficiary that DIFFERS from the party
 * raising the invoice is the one a payer genuinely has to be told about, and
 * that is the case the row survives for. It also costs two wrapped lines in a
 * column this narrow, which is the difference between the booking invoice
 * fitting on one page and not.
 */
export function PaymentPanel({
  bank,
  issuerName,
  variant,
}: {
  bank: InvoiceBank | null | undefined;
  issuerName?: string | null;
  variant: InvoiceVariant;
}) {
  if (!bank) return null;

  const normalise = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
  const showBeneficiary =
    !!bank.accountName &&
    (!issuerName || normalise(bank.accountName) !== normalise(issuerName));

  return (
    <View
      style={
        variant === "grid" ? [t.payPanel, t.payPanelGrid] : [t.payPanel]
      }
      wrap={false}
    >
      <Text style={t.payHead}>BANK DETAILS FOR PAYMENT</Text>

      {showBeneficiary ? (
        <View style={t.payLine}>
          <Text style={t.payLabel}>Name</Text>
          <Text style={t.payValue}>{bank.accountName}</Text>
        </View>
      ) : null}

      <View style={t.payLine}>
        <Text style={t.payLabel}>Bank</Text>
        <Text style={t.payValue}>
          {bank.bankName}
          {bank.branch ? `, ${bank.branch}` : ""}
        </Text>
      </View>

      {/* The two lines somebody is copying into a payment form, set heavier
          than the rest of the block so the eye lands on them first. */}
      <View style={t.payLine}>
        <Text style={t.payLabel}>A/C no.</Text>
        <Text style={t.payValueStrong}>{bank.accountNumber}</Text>
      </View>
      <View style={t.payLine}>
        <Text style={t.payLabel}>IFSC</Text>
        <Text style={t.payValueStrong}>{bank.ifsc}</Text>
      </View>
    </View>
  );
}
