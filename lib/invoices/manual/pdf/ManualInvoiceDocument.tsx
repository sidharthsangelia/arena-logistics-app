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
 *   - each consignment travels with its own charges.
 *
 * The page footer used to repeat the invoice number and the customer's name so
 * that a second sheet coming loose could be put back against the right
 * document. It was removed on request, so a loose sheet now identifies itself
 * only by what happens to be printed on it. Restoring it is one Text element;
 * see the foot of this file.
 *
 * ── A @react-pdf/renderer TRAP ──────────────────────────────────────────────
 * A `fixed` wrapper View holding the footer as children renders as nothing on a
 * full page, and so does any Text using the `render` callback. Both work in
 * isolation, which is what makes it worth writing down. The footer is therefore
 * separately positioned `fixed` elements with static text, and there is no page
 * numbering for that reason rather than a design one. See invoicingSystem.md §3.
 */

import * as React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { ManualInvoiceDocType } from "@/generated/prisma";

import {
  Band,
  C,
  Fact,
  type InvoiceVariant,
  Pair,
  PaymentPanel,
  TermsBlock,
  TotalsRow,
  chunked,
  money,
  splitLegalName,
  t,
  trim,
} from "../../pdf/theme";
import { DEFAULT_INVOICE_VARIANT } from "../../pdf/variant";
import { ARENA_LOGO_DATA_URI } from "../../tax/pdf/logo";
import type {
  ManualConsignmentSnapshot,
  ManualInvoiceDocumentData,
} from "../types";

/**
 * Kept as an alias rather than a second definition: the variant is a property
 * of the house style, which both invoice documents share, and letting this one
 * drift from the shared type is exactly how the two templates end up offering
 * different sets of formats.
 */
export type ManualInvoiceVariant = InvoiceVariant;

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/**
 * Charges table columns. Shared by the head and the rows in both variants.
 *
 * Local because they are sized against THIS document's content: a manual
 * invoice carries quantity and rate columns the booking invoice has no use
 * for. The palette, the shapes and the formatting all come from the shared
 * theme, which is what keeps the two looking like one company.
 */
const COL = {
  // The S.No column. Narrow on purpose: it is an index, not data, and every
  // point it takes comes off the description, which is the column a reader
  // actually needs whole.
  sno: 24,
  sac: 46,
  qty: 30,
  rate: 58,
  taxable: 64,
  gstRate: 32,
  gst: 60,
  amount: 68,
};

const s = StyleSheet.create({
  page: {
    paddingTop: 22,
    paddingBottom: 34,
    paddingHorizontal: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: C.ink,
    lineHeight: 1.35,
  },

  // ── masthead ──
  masthead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  logo: { width: 108, marginBottom: 5 },
  sellerName: { fontSize: 10, fontFamily: "Helvetica-Bold", lineHeight: 1.25 },
  // The issuer's own address and identifiers are NOT support text. Somebody
  // matching a payment, filing a GSTR-2 or writing a cheque reads these off the
  // page digit by digit, so they are set in the content colour like everything
  // else that is read rather than skimmed.
  sellerLine: { fontSize: 8, color: C.ink, lineHeight: 1.4 },
  sellerIds: { fontSize: 8, color: C.ink, lineHeight: 1.4 },
  sellerIdLabel: { fontFamily: "Helvetica-Bold" },

  mastheadRight: { alignItems: "flex-end", paddingLeft: 20 },
  docTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", letterSpacing: 2, textAlign: "right" },
  docCopy: { fontSize: 7, color: C.muted, letterSpacing: 0.9, textAlign: "right", marginTop: 3 },
  docNumber: { fontSize: 11.5, fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: 7 },
  docDate: { fontSize: 8.5, color: C.ink, textAlign: "right", marginTop: 2 },
  statusMark: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    color: C.alert,
    textAlign: "right",
    marginTop: 4,
  },

  // The band the parties panel would have had. See the comment at its use.
  partyBand: { marginTop: 8 },

  // ── party panel content ──
  // Sizing only. The panel itself, its label and its fact lines are shared.
  partyName: { fontSize: 10, fontFamily: "Helvetica-Bold", lineHeight: 1.25 },
  detail: { fontSize: 8, color: C.ink, lineHeight: 1.4 },

  // ── consignments ──
  consignment: { marginTop: 5 },
  consignmentHead: { flexDirection: "row", alignItems: "baseline" },
  consignmentIndex: { width: 14, fontSize: 8.5, color: C.muted },
  consignmentAwb: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  consignmentRoute: { fontSize: 8.5, marginLeft: 6, color: C.ink },
  consignmentNet: { marginLeft: "auto", fontSize: 9, fontFamily: "Helvetica-Bold" },
  // ── the indent under a consignment heading ──
  //
  // Applied to the fact run and to the REFS/GOODS lines, and NOT a constant:
  // see `factIndent` in the document. It exists to clear the serial number
  // column, so it is worth 14 points on an invoice that has one and worth
  // nothing on an invoice that does not.
  //
  // On a single-consignment invoice the heading starts at the box edge, so an
  // indent here would push the facts right of the thing they belong to and
  // charge 14 points a line for the privilege. In a run that packs by content
  // width those 14 points are frequently the difference between the last fact
  // riding up onto the line above and taking a line of its own.

  // The full-width line under the grid: tracking and the goods description.
  // The goods line is the one label set BESIDE its value rather than above it,
  // because the value is a sentence that wants the full width. react-pdf's
  // baseline alignment across two font sizes leaves the smaller one sitting
  // high, so the label is nudged down onto the value's own baseline by hand.
  consignmentLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 2,
  },
  consignmentLineLabel: {
    width: 34,
    paddingTop: 1.5,
    fontSize: 6.5,
    color: C.muted,
    letterSpacing: 0.7,
  },
  consignmentLineValue: {
    flex: 1,
    fontSize: 8.5,
    color: C.ink,
    lineHeight: 1.25,
  },

  consignmentGrid: {
    marginTop: 0,
    borderWidth: 0.5,
    borderTopWidth: 0,
    borderColor: C.gridRule,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },

  // ── charges table ──
  tableHead: { flexDirection: "row", paddingTop: 4, paddingBottom: 3 },
  tableHeadGrid: {
    flexDirection: "row",
    backgroundColor: C.band,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  headCell: { fontSize: 7, color: C.muted, letterSpacing: 0.7 },
  headCellGrid: {
    fontSize: 7,
    color: C.bandInk,
    letterSpacing: 0.6,
    fontFamily: "Helvetica-Bold",
  },
  row: { flexDirection: "row", paddingTop: 4, paddingBottom: 1 },
  rowGrid: {
    flexDirection: "row",
    paddingVertical: 3.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: C.gridRule,
  },
  rowZebra: { backgroundColor: C.gridZebra },
  rowDescription: { flex: 1, paddingRight: 8 },
  descriptionText: { fontSize: 9, lineHeight: 1.25 },
  descriptionNote: { fontSize: 7, color: C.faint, lineHeight: 1.25 },
  cell: { fontSize: 8.5, color: C.ink, textAlign: "right" },
  cellMuted: { fontSize: 8, color: C.muted, textAlign: "right" },
  cellIndex: { fontSize: 8, color: C.muted, textAlign: "left" },

  subtotalRow: {
    flexDirection: "row",
    paddingTop: 5,
    marginTop: 2,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
  },
  reimbursementNote: { fontSize: 7.5, color: C.muted, marginTop: 3, lineHeight: 1.3 },

  // ── bottom ──
  // The hairline is what closes the charges table off. It used to belong to the
  // reverse-charge statement that sat here; with that gone the last row of the
  // table ran straight into the declaration underneath with nothing between
  // them, and the two read as one block.
  bottomRow: {
    flexDirection: "row",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
    alignItems: "flex-start",
  },
  bottomLeft: { flex: 1, paddingRight: 16 },
  totalsPanel: {
    width: "100%",
    backgroundColor: C.panel,
    borderWidth: 0.5,
    borderColor: C.rule,
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  totalsPanelGrid: { borderRadius: 0, borderColor: C.gridRule, backgroundColor: "#FFFFFF" },
  totalsRule: {
    borderTopWidth: 0.75,
    borderTopColor: C.ruleStrong,
    marginTop: 3,
    marginBottom: 5,
  },
  grandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  grandLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  grandValue: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "right" },
  words: { flex: 1, fontSize: 8, color: C.ink, paddingRight: 12, lineHeight: 1.25 },
  wordsLabel: { color: C.muted, letterSpacing: 0.6, fontSize: 7 },
  taxNote: { fontSize: 7.5, color: C.muted, marginTop: 5, textAlign: "right", lineHeight: 1.35 },

  // The figure the customer actually has to pay, restated under the total.
  // Identical to it today, and stated anyway: it is the line an accounts
  // department looks for, and the day an advance or a part payment is ever
  // deducted this is where that shows without the layout changing.
  dueStrip: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 4,
    paddingTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
  },
  dueLabel: { fontSize: 8, color: C.muted, paddingRight: 8 },
  dueValue: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },

  noteLine: { fontSize: 7.5, color: C.ink, lineHeight: 1.35, marginTop: 2 },

  bottomRight: { width: 236 },
  signature: { alignItems: "flex-end", marginTop: 3 },
  signatureFor: { fontSize: 8, color: C.muted },
  signatureName: { fontSize: 8.5, fontFamily: "Helvetica-Bold", textAlign: "right", lineHeight: 1.25 },
  signatureRole: { fontSize: 8, color: C.muted, marginTop: 5 },
  declaration: {
    marginBottom: 4,
    fontSize: 7.5,
    color: C.ink,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.2,
    lineHeight: 1.35,
  },

  // ── fixed foot ──
  // Two lines now, not three, and everything moved down to close the gap the
  // third left behind. The page's own paddingBottom is what keeps content off
  // it, so the two are set together: leave the padding at the old three-line
  // height and the saving is a band of blank paper rather than a line of
  // invoice.
  pageFootRule: {
    position: "absolute",
    bottom: 27,
    left: 32,
    right: 32,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
  },
  contact: {
    position: "absolute",
    bottom: 19,
    left: 32,
    right: 32,
    fontSize: 7,
    color: C.ink,
    textAlign: "center",
  },
  jurisdiction: {
    position: "absolute",
    bottom: 10,
    left: 32,
    right: 32,
    fontSize: 6.5,
    color: C.muted,
    letterSpacing: 0.4,
    textAlign: "center",
  },
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

/**
 * 23/08/26. For the consignment facts only.
 *
 * "23 Aug 2026" is 58 points and "23/08/26" is 34, and in a run that packs by
 * content width those 24 points are the difference between the pick-up date
 * riding at the end of the line above and taking a whole line of its own. Two
 * dates in a consignment therefore cost one line rather than two.
 *
 * Deliberately NOT used for the invoice date, the due date or the IRN ack date.
 * Those sit in a panel that is not short of room, they are the dates a tax
 * document is read and disputed on, and a spelled-out month cannot be misread
 * as the American order. Abbreviate where space is the constraint, not
 * everywhere the same type appears.
 *
 * Two-digit year on purpose. A consignment date on an invoice is always within
 * a few weeks of the invoice date printed in full above it, so the century is
 * never the question being asked.
 */
function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
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

/** "DEL / DXB", or whichever end exists, or nothing. */
function ports(c: ManualConsignmentSnapshot): string | null {
  if (c.originPort && c.destinationPort) {
    return `${c.originPort} / ${c.destinationPort}`;
  }
  return c.originPort ?? c.destinationPort ?? null;
}

/** "284.5 kg", or nothing. */
function kg(value: number | null): string | null {
  return value === null ? null : `${trim(value)} kg`;
}

/**
 * What moved, how it travelled and what it was, for the bracket on the heading
 * line: "12 pcs, Air, Non-documents".
 *
 * The piece count leads because it is the one of the three that is a quantity,
 * and because "12 pcs to Dubai by air" is the sentence somebody says out loud
 * about a consignment. It sits here rather than in a cell of its own for the
 * same reason the other two do: all three qualify the lane, and a quarter-width
 * cell holding the single character "12" is a quarter of a row spent on it.
 *
 * The two text fields print exactly as stored. Both take free text, so an
 * abbreviation table would shorten the six values in the picker and leave
 * anything else in full, and the same invoice would print "Non Doc" on one
 * consignment and "Refrigerated pharma samples" on the next. The shortening
 * would read as a different field rather than as the same one said briefly.
 */
function carriage(c: ManualConsignmentSnapshot): string | null {
  return (
    [
      c.pieces === null
        ? null
        : `${c.pieces} ${c.pieces === 1 ? "pc" : "pcs"}`,
      c.shipMode,
      c.parcelType,
    ]
      .filter(Boolean)
      .join(", ") || null
  );
}

/** "2 pallet, 12 carton". Only the counts that were actually taken. */
function packing(c: ManualConsignmentSnapshot): string | null {
  return (
    [
      c.boxCount ? `${c.boxCount} box` : null,
      c.palletCount ? `${c.palletCount} pallet` : null,
      c.cartonCount ? `${c.cartonCount} carton` : null,
    ]
      .filter(Boolean)
      .join(", ") || null
  );
}

/**
 * Every number this consignment can be looked up by, each prefixed with what it
 * is.
 *
 * The prefixes are not decoration. Stacked bare, "176-51234567",
 * "ARN-JOB-4412" and "MTX/EXP/2026/0188" are three strings a reader has to
 * guess the meaning of, and they are precisely the values somebody is matching
 * against other paperwork. Guessing wrong there is a misfiled consignment.
 */
function references(c: ManualConsignmentSnapshot): string[] {
  // A courier consignment is very often tracked on its own waybill, and the
  // two fields then hold the same string. Printed both ways it reads as two
  // numbers, and somebody checks whether they differ.
  const tracking =
    c.trackingNumber && c.trackingNumber.trim() !== c.awbNumber?.trim()
      ? c.trackingNumber
      : null;

  return [
    // First, because it is the one a customer chasing the consignment reaches
    // for. The waybill is already set large on the line above this block, or in
    // the header panel when there is only one consignment.
    tracking ? `Tracking ${tracking}` : null,
    c.mawbNumber ? `MAWB ${c.mawbNumber}` : null,
    c.jobNumber ? `Job ${c.jobNumber}` : null,
    c.referenceNo ? `Ref ${c.referenceNo}` : null,
    c.exportInvoiceNo ? `Shipper inv. ${c.exportInvoiceNo}` : null,
  ].filter(Boolean) as string[];
}

/**
 * What was in it.
 *
 * Goods and particulars were two fields and are now one. An invoice ISSUED
 * under the old shape has both in its frozen snapshot and must still print
 * everything it was issued with, so they are joined here rather than the
 * second one disappearing from a document somebody already holds a copy of.
 * Nothing written since the merge sets `particulars` at all.
 */
function goods(c: ManualConsignmentSnapshot): string | null {
  return (
    [c.goodsDescription, c.particulars]
      .map((v) => v?.trim())
      .filter(Boolean)
      .join(". ") || null
  );
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
// Document
// ---------------------------------------------------------------------------

export function ManualInvoiceDocument({
  data,
  variant = DEFAULT_INVOICE_VARIANT,
}: {
  data: ManualInvoiceDocumentData;
  variant?: ManualInvoiceVariant;
}) {
  const { seller, buyer } = data;

  // Whether the tinted payment block is on the page at all. The terms under it
  // are spaced off it, so the gap has to follow the block rather than the bank
  // account: an issuer that publishes only a UPI handle still gets the panel.
  const hasPaymentPanel = !!seller.bank || !!seller.upiId?.trim();
  const grid = variant === "grid";
  const cur = data.currency;

  // How far a consignment's facts sit in from the box edge. Only enough to
  // clear the serial number, and only when there is one to clear. See the
  // comment on the styles.
  const factIndent = data.consignments.length > 1 ? 14 : 0;

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

  // The SAC column is the one gate the admin sets rather than the content: some
  // customers want a plainer bill and ask for it off. Undefined reads as ON,
  // because every invoice snapshotted before the switch existed was printed
  // with the column and a re-render of one must not silently lose it.
  const showSac = data.showSacCode !== false;

  // The rate is named on the totals rows only when the whole invoice is at ONE
  // rate, which is the ordinary case. A manual invoice can mix rates across its
  // lines, and "CGST @ 9%" over a figure that is 9% of some lines and 2.5% of
  // others is a number that does not reconcile. The per-line GST column carries
  // the rates in that case, which is where a mixed-rate invoice has to be read
  // from anyway.
  const rates = new Set(
    taxedLines.filter((l) => l.ratePercent > 0).map((l) => l.ratePercent),
  );
  const singleRate = rates.size === 1 ? [...rates][0] : null;

  // `as` carries the printed wording where it differs from the head's name:
  // the state half is "SGST/UTGST", because a union territory supply is charged
  // UTGST under the same half and a document naming only SGST is wrong for it.
  const taxLabel = (head: "CGST" | "SGST" | "IGST", as: string = head) => {
    if (singleRate === null) return as;
    const rate = head === "IGST" ? singleRate : singleRate / 2;
    return `${as} @ ${trim(rate)}%`;
  };
  const showQty = showRate && taxedLines.some((l) => l.quantity !== 1);

  const serviceAmount = taxedLines.reduce((sum, l) => sum + l.grossAmount, 0);
  const discount = taxedLines.reduce((sum, l) => sum + l.discount, 0);

  const sellerAddress = [
    ...seller.addressLines,
    [seller.city, seller.stateName, seller.postalCode].filter(Boolean).join(" "),
  ].filter(Boolean);

  const buyerAddress = [
    ...buyer.addressLines,
    [buyer.city, buyer.stateName, buyer.postalCode].filter(Boolean).join(" "),
    buyer.country && buyer.country !== "India" ? buyer.country : null,
  ].filter(Boolean);

  // The env value accepts several, comma separated. Normalised here rather than
  // trusted as typed, because "a@x.com,b@x.com" with no space runs together on
  // the page and reads as one malformed address.
  const billingContacts = seller.billingEmail
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .join(", ");

  // The waybill is a per-consignment fact, so it can only be stated at the top
  // of the document when the document is about ONE consignment. On a monthly
  // bill carrying ten of them there is no single right answer to print, and a
  // header naming the first would be read as naming all of them. In that case
  // it stays null and each waybill heads its own block instead.
  const singleAwb =
    data.consignments.length === 1
      ? data.consignments[0]?.awbNumber?.trim() || null
      : null;

  // Only the ones that exist, so an issuer with no phone gets no gap where the
  // separator would have been.
  const sellerContact = [
    { label: "Email", value: seller.email },
    { label: "Phone", value: seller.phone },
    { label: "Website", value: seller.website },
  ].filter((p): p is { label: string; value: string } => !!p.value);

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
            {/* GSTIN, PAN and CIN on one line rather than three. All three are
                looked up rather than read, the labels carry the weight, and
                three separate lines pushed the party panel down the page for no
                gain. CIN is guarded: an invoice issued before the field existed
                has none, and a bare "CIN" with nothing after it is worse than
                no CIN at all. */}
            <Text style={s.sellerIds}>
              <Text style={s.sellerIdLabel}>GSTIN </Text>
              {seller.gstin}
              <Text style={s.sellerIdLabel}>   PAN </Text>
              {seller.pan}
              {seller.cin ? (
                <>
                  <Text style={s.sellerIdLabel}>   CIN </Text>
                  {seller.cin}
                </>
              ) : null}
            </Text>
            {/* Labelled, unlike the run of identifiers above. GSTIN, PAN and
                CIN are self-evident from their shape; an email, a phone number
                and a domain stacked bare are three strings a reader has to sort
                out before they can use one, and the one they want depends on
                the question they arrived with.

                All three on ONE line. A second contact row here costs a line
                off the left column, which is the taller of the two and
                therefore decides where the page starts, and this document fits
                on a single sheet with about that much to spare. */}
            {sellerContact.length > 0 ? (
              <Text style={s.sellerIds}>
                {sellerContact.map((part, i) => (
                  <React.Fragment key={part.label}>
                    {i > 0 ? "   " : null}
                    <Text style={s.sellerIdLabel}>{part.label} </Text>
                    {part.value}
                  </React.Fragment>
                ))}
              </Text>
            ) : null}
          </View>

          <View style={s.mastheadRight}>
            <Text style={s.docTitle}>{title}</Text>
            <Text style={s.docCopy}>ORIGINAL FOR RECIPIENT</Text>
            <Text style={s.docNumber}>{data.invoiceNumber}</Text>
            <Text style={s.docDate}>{formatDate(data.issueDate)}</Text>
            {/* No due date here. INVOICE DETAILS states it a few centimetres
                below, beside the credit terms it is derived from, which is
                where somebody deciding when to pay is already reading. */}
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

        {/* ── who and what ─────────────────────────────────────────────────
            No section band over this one. The two panel headings inside it
            already say what each column is, and a strip reading "INVOICE
            DETAILS" directly above a column reading "INVOICE DETAILS" was a
            line of page spent saying the same thing twice, on a document whose
            fitting on one sheet is decided by exactly this kind of line. */}
        <View style={s.partyBand} wrap={false}>
          <View style={grid ? t.panelGrid : t.panel}>
            <View style={t.panelColumn}>
              <Text style={t.panelLabel}>DETAILS OF RECEIVER (BILL TO)</Text>
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
              {/* No state row. The recipient's state is already in the
                  address block two lines above, and the two-digit code that
                  decides IGST against the CGST/SGST split is printed as the
                  place of supply in the panel alongside, where the return is
                  filed from. Three statements of one fact on one sheet. */}
              <Fact label="Email" value={buyer.email} />
              <Fact label="Phone" value={buyer.phone} />
              <Fact label="Customer no." value={buyer.customerCode} />
            </View>

            <View style={t.panelColumn}>
              <Text style={t.panelLabel}>INVOICE DETAILS</Text>
              {/* The number and date are in the masthead too. Repeated here on
                  purpose: this panel is the block a filing clerk reads as a
                  unit, and a header block that starts at "Shipper invoice no."
                  makes them hunt back up the page for the two fields every
                  other line refers to. */}
              <Fact
                label="Invoice no."
                value={data.invoiceNumber}
                strong
              />
              <Fact label="Invoice date" value={formatDate(data.issueDate)} />
              {/* The waybill sits with the invoice number rather than down in
                  the consignment block: on a single-consignment invoice, which
                  is nearly all of them, these are the two numbers every query
                  about this document opens with. Only ever printed when there
                  IS one consignment; see singleAwb. */}
              <Fact label="AWB no." value={singleAwb} strong />
              <Fact label="Shipper inv." value={data.shipperInvoiceNo} />
              <Fact label="Credit terms" value={data.paymentTermsLabel} />
              <Fact label="Due date" value={formatDate(data.dueDate)} />
              <Fact label="Reference" value={data.reference} />
              <Fact
                label="Place of supply"
                value={
                  data.placeOfSupplyName
                    ? `${data.placeOfSupplyCode} ${data.placeOfSupplyName}`
                    : data.placeOfSupplyCode
                }
              />
              {/* No SAC row and no pricing row here. Every charge carries its
                  own SAC in the table below, which is where Rule 46 wants it
                  and where a mixed-code invoice has to be read from anyway, so
                  a document-level restatement was one of two codes on the page
                  claiming to be the answer. Pricing went the same way: the
                  taxable value, the tax and the total are all printed as
                  figures further down, and inclusive against exclusive is a
                  statement about how the amounts were TYPED, not about what is
                  owed: both ways reach the same taxable value, the same tax and
                  the same total, all three of which are printed. The reader was
                  being told how the sausage was made. */}
              <Fact label="Ship. type" value={data.csbLabel} />
              <Fact label="IRN" value={chunked(data.irn)} />
              <Fact label="Ack no." value={data.irnAckNo} />
              <Fact label="Ack date" value={formatDate(data.irnAckDate)} />
            </View>
          </View>
        </View>

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
              {data.consignments.map((c, index) => {
                // What heads the block. The waybill, unless it has already been
                // lifted into INVOICE DETAILS, which happens exactly when there
                // is one consignment: printing it in both places is the same
                // number twice on one sheet. With several consignments each
                // keeps its own, because that is the only thing telling two
                // otherwise identical blocks apart.
                const heading = singleAwb
                  ? null
                  : (c.awbNumber ?? c.jobNumber ?? c.referenceNo ?? null);

                // "New Delhi to Dubai (Air, Non-documents)". How it travelled
                // and what it was belong to the lane, not to a cell of their
                // own: they are read as qualifiers on the route, they are two
                // or three words each, and a quarter-width cell for them was
                // width the weights needed more. With no route they stand on
                // their own, unbracketed, since a bracket around the whole
                // line has nothing to be a bracket on.
                const how = carriage(c);
                const where = route(c);
                const lane = where
                  ? how
                    ? `${where} (${how})`
                    : where
                  : how;

                return (
                // Each consignment travels with its own facts. A break through
                // one would separate an AWB from its route and weights.
                <View key={index} style={s.consignment} wrap={false}>
                  <View style={s.consignmentHead}>
                    {data.consignments.length > 1 ? (
                      <Text style={s.consignmentIndex}>{index + 1}</Text>
                    ) : null}
                    {heading ? (
                      <Text style={s.consignmentAwb}>{heading}</Text>
                    ) : null}
                    {/* The route is promoted to the heading's own weight when
                        there is no number above it, so the block still opens
                        with something set to be read first rather than with a
                        quiet line hanging under nothing. */}
                    {lane ? (
                      <Text style={heading ? s.consignmentRoute : s.consignmentAwb}>
                        {lane}
                      </Text>
                    ) : null}
                    {!heading && !lane ? (
                      <Text style={s.consignmentAwb}>Services</Text>
                    ) : null}
                    <Text style={s.consignmentNet}>
                      {money(c.netAmount, cur)}
                    </Text>
                  </View>

                  {/* ── THE FACTS, PACKED ────────────────────────────────
                      One run, not three rows of quarter-width cells. Every
                      pair takes the width its own text needs and the next one
                      starts immediately after it, so a consignment that knows
                      four things about itself prints one line rather than
                      leaving three quarters of three rows blank. See `pairs`
                      in the shared theme for why the labels no longer have to
                      line up for this to read as data.

                      Ordered by what a reader arrives wanting. The weights
                      come first and are the only pair set bold: freight is
                      billed on the chargeable weight, the customer knows only
                      what their consignment weighed on a scale, and that pair
                      is the most queried thing on the document. Then how it
                      was packed, then who carried it and by what route, then
                      the parties and the dates.

                      Only the chargeable weight abbreviates. It is the longer
                      word and the one the trade already says short, while
                      "GROSS WT." is the figure a customer checks against their
                      own weighbridge and is worth spelling out. Asymmetric on
                      purpose. */}
                  <View style={[t.pairs, { marginLeft: factIndent }]}>
                    <Pair label="Gross wt." value={kg(c.grossWeightKg)} strong />
                    <Pair
                      label="Charg. wt."
                      value={kg(c.chargeableWeightKg)}
                      strong
                    />
                    <Pair label="Packing" value={packing(c)} />
                    {/* The cargo's code, sitting with the cargo's other
                        physical facts. It is not the SAC in the charges table
                        and must never be printed as though it were: that one
                        codes the freight SERVICE Arena is billing for, this one
                        codes the goods that moved. An invoice showing one
                        number for both is an invoice that has answered the
                        wrong question twice. */}
                    <Pair label="HSN" value={c.hsnCode ?? null} />
                    {/* Two pairs, not a carrier with its product underneath.
                        The product is the half a customer recognises: "UPS
                        Saver" is what they bought and what they will quote
                        back, and under the forwarder's own label it read as a
                        footnote to the carrier rather than as an answer of its
                        own. */}
                    <Pair label="Forwarder" value={c.forwarderName} />
                    <Pair label="Prod. type" value={c.productType} />
                    <Pair label="Service" value={c.serviceType} />
                    <Pair label="Routing" value={ports(c)} />
                    {/* Named separately rather than run together, so that a
                        consignment carrying an airline and no flight number
                        does not print the airline under the word FLIGHT. */}
                    <Pair label="Flight" value={c.flightNumber} />
                    <Pair label="Airline" value={c.airlineName} />
                    <Pair label="Container" value={c.containerNumber} />
                    <Pair label="Agent" value={c.subAgent} />
                    <Pair label="Shipper" value={c.shipperName} />
                    <Pair label="Consignee" value={c.consigneeName} />
                    {/* Two dates rather than one with the second underneath.
                        They answer different questions: booking is when the job
                        was taken, pick-up is what a customer reconciles against
                        their own dispatch register, and they are frequently
                        days apart. */}
                    <Pair label="Booked" value={shortDate(c.bookingDate)} />
                    <Pair label="Picked up" value={shortDate(c.pickupDate)} />
                  </View>

                  {/* ── THE TWO FULL-WIDTH LINES ─────────────────────────
                      Both hold something that is a run of text rather than a
                      field, and a run of text set in a quarter column wraps to
                      four lines and costs more height than the whole rest of
                      the block.

                      References used to be a grid cell with the first number as
                      its value and the rest stacked underneath, which on a
                      consignment carrying all four was a four-line cell that
                      set the height of an entire row. Across the full width
                      they are one line. Each still carries the prefix saying
                      what it is, because a run of bare numbers is unreadable
                      and these are precisely the values somebody is matching
                      against other paperwork. */}
                  {references(c).length > 0 ? (
                    <View style={[s.consignmentLine, { marginLeft: factIndent }]}>
                      <Text style={s.consignmentLineLabel}>REFS</Text>
                      <Text style={s.consignmentLineValue}>
                        {references(c).join("   ")}
                      </Text>
                    </View>
                  ) : null}
                  {goods(c) ? (
                    <View style={[s.consignmentLine, { marginLeft: factIndent }]}>
                      <Text style={s.consignmentLineLabel}>GOODS</Text>
                      <Text style={s.consignmentLineValue}>{goods(c)}</Text>
                    </View>
                  ) : null}
                </View>
                );
              })}
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
            <Text
              style={[
                grid ? s.headCellGrid : s.headCell,
                { width: COL.sno, paddingRight: 4 },
              ]}
            >
              S.NO
            </Text>
            <View style={s.rowDescription}>
              <Text style={grid ? s.headCellGrid : s.headCell}>DESCRIPTION</Text>
            </View>
            {showSac ? (
              <Text style={[grid ? s.headCellGrid : s.headCell, { width: COL.sac, textAlign: "right" }]}>
                SAC
              </Text>
            ) : null}
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
              <Text style={[s.cellIndex, { width: COL.sno }]}>{index + 1}</Text>
              <View style={s.rowDescription}>
                <Text style={s.descriptionText}>{line.description}</Text>
              </View>
              {showSac ? (
                <Text style={[s.cellMuted, { width: COL.sac }]}>
                  {line.sacCode}
                </Text>
              ) : null}
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
                <View style={{ width: COL.sno }} />
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
                  {/* The serial runs on from the taxed block rather than
                      restarting. Two lines numbered 1 on one invoice is the
                      kind of thing that gets queried. */}
                  <Text style={[s.cellIndex, { width: COL.sno }]}>
                    {taxedLines.length + index + 1}
                  </Text>
                  <View style={s.rowDescription}>
                    <Text style={s.descriptionText}>{line.description}</Text>
                  </View>
                  {showSac ? (
                    <Text style={[s.cellMuted, { width: COL.sac }]}>-</Text>
                  ) : null}
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
            <Text style={s.declaration}>{seller.declaration}</Text>

            {/* Where to send the money, in the one tinted block on the page.
                See C.payPanel in the shared theme for why this is allowed to
                stand out when everything around it is deliberately quiet. */}
            <PaymentPanel
              bank={seller.bank}
              upiId={seller.upiId}
              issuerName={seller.legalName}
              variant={variant}
            />

            {data.terms.length > 0 ? (
              <View style={{ marginTop: hasPaymentPanel ? 8 : 0 }}>
                <Text style={t.label}>DECLARATION, TERMS AND CONDITIONS</Text>
                <View style={[t.rule, { marginBottom: 2 }]} />
                <TermsBlock terms={data.terms} />
              </View>
            ) : null}

            {data.notes ? (
              <View style={{ marginTop: 8 }}>
                <Text style={t.label}>NOTES</Text>
                <View style={[t.rule, { marginBottom: 3 }]} />
                <Text style={s.noteLine}>{data.notes}</Text>
              </View>
            ) : null}
          </View>

          <View style={s.bottomRight}>
          <View style={[s.totalsPanel, ...(grid ? [s.totalsPanelGrid] : [])]}>
            {/* Service amount is the gross of the billed lines, before any
                discount. It equals the taxable value on the ordinary invoice,
                and the discount row only appears when there is one, so the two
                figures never sit there identical for no reason. */}
            <TotalsRow label="Service amount" value={money(serviceAmount, cur)} />
            {discount > 0 ? (
              <TotalsRow label="Discount" value={`-${money(discount, cur)}`} />
            ) : null}
            <TotalsRow
              label="Taxable value"
              value={money(data.taxableValue, cur)}
            />

            {/* ── EVERY HEAD, EVERY TIME ────────────────────────────────
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
                no cess field anywhere in the money engine. If one is ever
                genuinely billed, it becomes a real per-line figure and this row
                reads it, rather than a new row appearing from nowhere. */}
            <TotalsRow label={taxLabel("CGST")} value={money(data.cgstAmount, cur)} />
            <TotalsRow
              label={taxLabel("SGST", "SGST/UTGST")}
              value={money(data.sgstAmount, cur)}
            />
            <TotalsRow label={taxLabel("IGST")} value={money(data.igstAmount, cur)} />
            <TotalsRow label="CESS" value={money(0, cur)} />

            {data.reimbursements > 0 ? (
              <TotalsRow
                label="Paid on your behalf"
                value={money(data.reimbursements, cur)}
              />
            ) : null}
            <TotalsRow label="Currency" value={cur} />

            <View style={s.totalsRule} />

            <View style={s.grandRow}>
              <Text style={s.grandLabel}>TOTAL {cur}</Text>
              <Text style={s.grandValue}>{money(data.total, cur)}</Text>
            </View>

            {data.taxNote ? (
              <Text style={s.taxNote}>{data.taxNote}</Text>
            ) : null}
          </View>

          {/* ── signature ──────────────────────────────────────────────
              Under the total rather than in a band of its own across the
              foot. The signature belongs to the figure being certified, the
              terms column beside it is where the certification text now sits,
              and a full-width third row here was costing this document a
              whole extra sheet on an ordinary one-consignment invoice. */}
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
        </View>

        {/* ── the two figures a payer acts on ──────────────────────────────
            Full width and under the panel rather than inside it. The amount in
            words is a long line and wraps to three inside a 236pt column, and
            the amount due is the number an accounts department looks for
            first: neither belongs squeezed into the narrowest column on the
            page. Given the width, both fit on one line and the totals panel
            gets 40 points shorter, which is most of what keeps an ordinary
            invoice on a single sheet. */}
        <View style={s.dueStrip} wrap={false}>
          {cur === "INR" ? (
            <Text style={s.words}>
              <Text style={s.wordsLabel}>Total in words   </Text>
              {inWords(data.total)} Rupees only
            </Text>
          ) : (
            <Text style={s.words} />
          )}
          <Text style={s.dueLabel}>Amount due for payment</Text>
          <Text style={s.dueValue}>{money(data.total, cur)}</Text>
        </View>

        {/* ── fixed foot. Separate positioned elements: see the header. ──
            No identification line. This used to carry the invoice number and
            the customer's name on every sheet, which is what made a loose page
            two placeable; it was removed on request. Putting it back is one
            fixed Text above the rule, and the three foot offsets below go back
            up by roughly nine points to make room for it. */}
        <View style={s.pageFootRule} fixed />
        {/* Where a billing question goes, and where the rest of the story is.
            Both mailboxes are printed: billing at Arena reaches two people, and
            an invoice naming one of them sends half the queries to somebody who
            cannot answer them. */}
        <Text style={s.contact} fixed>
          {[
            `Billing queries: ${billingContacts}`,
            seller.website ? `More at ${seller.website}` : null,
          ]
            .filter(Boolean)
            .join("    ")}
        </Text>
        <Text style={s.jurisdiction} fixed>
          {`E. & O.E.   SUBJECT TO THE JURISDICTION OF THE COURTS OF ${seller.jurisdiction.toUpperCase()} ONLY`}
        </Text>
      </Page>
    </Document>
  );
}
