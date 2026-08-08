/**
 * lib/invoices/manual/money.ts
 *
 * Turns the charge rows an admin typed into the taxed service table printed on
 * a manual invoice.
 *
 * PURE MODULE. Deterministic, no IO, no clock. Everything it needs is passed in,
 * which is what makes the invariants below testable exhaustively.
 *
 * ── HOW THIS DIFFERS FROM lib/invoices/tax/money.ts ─────────────────────────
 * That engine solves a different problem. There, the customer had already paid
 * before the invoice existed, so the wallet debit is the one true input and
 * everything is derived from it and reconciled back to it.
 *
 * Here there is no prior payment. An admin is typing amounts off a rate sheet,
 * and the only question is whether those amounts already include GST. So the
 * arithmetic runs forwards from the lines, and the total is an output.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── THE INVARIANTS ──────────────────────────────────────────────────────────
 * Asserted in utils/manualInvoiceMoney.test.ts over generated inputs, and
 * re-checked by verifyManualInvoiceMoney before anything is persisted or
 * printed.
 *
 *   I1. sum(line.taxableValue) === taxableValue, exactly
 *   I2. cgst + sgst + igst === totalTax, exactly
 *   I3. taxableValue + totalTax + reimbursements === total, exactly
 *   I4. every amount is a whole number of minor units
 *   I5. a reimbursement line contributes nothing to taxableValue or to any tax
 *
 * "Exactly" means exactly, not within a paisa. A tax invoice whose lines do not
 * add up to its total is a document that gets sent back, and the failure is
 * silent until an accountant adds up the column.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Everything is computed in integer MINOR UNITS of the invoice currency. Floats
 * accumulate exactly the error this module exists to prevent.
 */

import { TaxMode } from "@/generated/prisma";

import { isIntraState } from "../tax/gst";

// ---------------------------------------------------------------------------
// Minor units
// ---------------------------------------------------------------------------

/**
 * Two decimal places, for every currency Arena invoices in. Correct for INR,
 * USD, EUR, GBP and AED; wrong for JPY and KWD, neither of which has ever
 * appeared on an invoice here.
 *
 * If a zero-decimal currency ever does, this is the one place to fix, and the
 * fix is a lookup rather than a rewrite: nothing downstream assumes 100.
 */
export const MINOR_UNITS_PER_MAJOR = 100;

/**
 * Major units to whole minor units. The epsilon nudge matters: 186.44 * 100 is
 * 18643.999999999996 in IEEE 754, and rounding that the naive way loses a paisa
 * on a value that was exact in the source data.
 */
export function toMinor(major: number): number {
  if (!Number.isFinite(major)) return 0;
  return Math.round(
    major * MINOR_UNITS_PER_MAJOR +
      (major >= 0 ? Number.EPSILON : -Number.EPSILON),
  );
}

export function fromMinor(minor: number): number {
  return Math.round(minor) / MINOR_UNITS_PER_MAJOR;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One charge row as the admin typed it, in major units. */
export interface ManualChargeInput {
  /** What prints. Already the customer-facing label; no vendor names here. */
  label: string;
  sacCode: string;
  /** Unit price, shown as the working. `amount` is what is actually billed. */
  rate: number;
  quantity: number;
  /** The billed figure. Stored rather than derived from rate times quantity. */
  amount: number;
  /** Subtracted from `amount` before tax. A positive number. */
  discount: number;
  /** This line's GST rate, in percent. */
  ratePercent: number;
  /**
   * Pure-agent recovery. Excluded from taxable value and from every tax head,
   * still owed by the customer. See the note on ManualInvoiceCharge.
   */
  reimbursement: boolean;
  /** Which consignment it came from, so the roll-up can report coverage. */
  consignmentIndex?: number;
}

export interface ManualMoneyInput {
  lines: ManualChargeInput[];
  /**
   * EXCLUSIVE: the typed amount is pre-tax and GST is added, so the total grows.
   * INCLUSIVE: the typed amount is gross and GST is split out of it, so the
   * total is exactly what was typed.
   */
  taxMode: TaxMode;
  /**
   * Reverse charge: the recipient pays the GST, so the document charges none.
   * Forces every line to zero tax in BOTH modes. Under inclusive pricing there
   * is no tax inside the amount to split out, because none was ever charged, so
   * the typed figure is the taxable value as it stands.
   */
  reverseCharge?: boolean;
  /** Two-digit GST state code of the issuer. */
  sellerStateCode: string;
  /** Two-digit GST state code of the place of supply. */
  placeOfSupplyCode: string;
}

// ---------------------------------------------------------------------------
// Outputs (major units, 2dp, safe to persist and print)
// ---------------------------------------------------------------------------

export interface ManualLineItem {
  description: string;
  sacCode: string;
  /** Summed across the rows folded into this line. */
  quantity: number;
  /**
   * Unit rate, when every folded row shared one. Null when they did not, in
   * which case the document prints the amount only rather than a rate that
   * would not multiply out.
   */
  rate: number | null;
  /** Gross of the folded rows, before discount. */
  grossAmount: number;
  discount: number;
  /** Pre-tax value. Zero on a reimbursement line, by definition. */
  taxableValue: number;
  ratePercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  /** taxableValue + this line's tax, or the recovered amount if reimbursement. */
  lineTotal: number;
  reimbursement: boolean;
}

export interface ManualInvoiceMoney {
  lineItems: ManualLineItem[];
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  reimbursements: number;
  total: number;
  isIntraState: boolean;
  /** The rates actually used, ascending. Printed in the tax summary. */
  ratesUsed: number[];
}

// ---------------------------------------------------------------------------
// One line, in minor units
// ---------------------------------------------------------------------------

interface ComputedLine {
  key: string;
  label: string;
  sacCode: string;
  quantity: number;
  rateMinor: number | null;
  grossMinor: number;
  discountMinor: number;
  taxableMinor: number;
  ratePercent: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalMinor: number;
  reimbursement: boolean;
}

function computeLine(
  line: ManualChargeInput,
  taxMode: TaxMode,
  reverseCharge: boolean,
  intraState: boolean,
): ComputedLine {
  const grossMinor = Math.max(0, toMinor(Number(line.amount) || 0));
  // A discount larger than the line is a typo, not a credit. Clamping keeps the
  // invariants intact without silently inventing a negative charge.
  const discountMinor = Math.min(
    grossMinor,
    Math.max(0, toMinor(Number(line.discount) || 0)),
  );
  const netMinor = grossMinor - discountMinor;

  const rawRate = Number(line.ratePercent);
  const ratePercent =
    reverseCharge || line.reimbursement || !Number.isFinite(rawRate)
      ? 0
      : Math.max(0, rawRate);

  // ── Reimbursement: no tax in either direction, and it never touches the
  // taxable value. This is the whole point of the flag.
  if (line.reimbursement) {
    return {
      key: lineKey(line, 0),
      label: line.label,
      sacCode: line.sacCode,
      quantity: Number(line.quantity) || 0,
      rateMinor: toMinor(Number(line.rate) || 0),
      grossMinor,
      discountMinor,
      taxableMinor: 0,
      ratePercent: 0,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
      totalMinor: netMinor,
      reimbursement: true,
    };
  }

  let taxableMinor: number;
  let taxMinor: number;

  if (ratePercent === 0) {
    taxableMinor = netMinor;
    taxMinor = 0;
  } else if (taxMode === TaxMode.INCLUSIVE) {
    // Back-compute, then take the tax as the REMAINDER rather than rounding it
    // separately. That is what makes the line reconcile to the figure the admin
    // typed: an admin who enters 5,000 must see 5,000, not 4,999.99.
    taxableMinor = Math.round((netMinor * 100) / (100 + ratePercent));
    taxMinor = netMinor - taxableMinor;
  } else {
    taxableMinor = netMinor;
    taxMinor = Math.round((netMinor * ratePercent) / 100);
  }

  // Halve into CGST and SGST with the odd minor unit going to CGST, so the two
  // heads always sum back to the tax exactly.
  const cgstMinor = intraState ? Math.floor(taxMinor / 2) : 0;
  const sgstMinor = intraState ? taxMinor - cgstMinor : 0;
  const igstMinor = intraState ? 0 : taxMinor;

  return {
    key: lineKey(line, ratePercent),
    label: line.label,
    sacCode: line.sacCode,
    quantity: Number(line.quantity) || 0,
    rateMinor: toMinor(Number(line.rate) || 0),
    grossMinor,
    discountMinor,
    taxableMinor,
    ratePercent,
    cgstMinor,
    sgstMinor,
    igstMinor,
    totalMinor: taxableMinor + taxMinor,
    reimbursement: false,
  };
}

/**
 * Rows fold together only when everything printed on the line matches. Rate and
 * reimbursement are in the key because two rows with the same label at
 * different GST rates are genuinely different lines on a tax invoice, and
 * merging them would state a rate that applies to neither.
 */
function lineKey(line: ManualChargeInput, ratePercent: number): string {
  return [
    line.label.trim().toLowerCase(),
    line.sacCode.trim(),
    ratePercent,
    line.reimbursement ? "R" : "T",
  ].join("|");
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/**
 * Build the printable money for one manual invoice.
 *
 * The charges table on the document is a ROLL-UP: charges are grouped across
 * every consignment by label, SAC and rate, so a three-consignment invoice
 * prints one FUEL SURCHARGE line carrying the total rather than three. The
 * per-consignment detail is not lost; it stays on the consignment rows and is
 * printed in the consignment block above.
 */
export function buildManualInvoiceMoney(
  input: ManualMoneyInput,
): ManualInvoiceMoney {
  const intraState = isIntraState(
    input.sellerStateCode,
    input.placeOfSupplyCode,
  );
  const reverseCharge = input.reverseCharge === true;

  const computed = (input.lines ?? [])
    .map((line) => computeLine(line, input.taxMode, reverseCharge, intraState))
    // A zero-value line is noise on a document. Dropped after computing rather
    // than before, so a line that is only a discount still nets to nothing and
    // disappears the same way.
    .filter((line) => line.grossMinor > 0);

  // ── fold ────────────────────────────────────────────────────────────────
  const folded = new Map<string, ComputedLine>();
  for (const line of computed) {
    const existing = folded.get(line.key);
    if (!existing) {
      folded.set(line.key, { ...line });
      continue;
    }

    existing.quantity += line.quantity;
    existing.grossMinor += line.grossMinor;
    existing.discountMinor += line.discountMinor;
    existing.taxableMinor += line.taxableMinor;
    existing.cgstMinor += line.cgstMinor;
    existing.sgstMinor += line.sgstMinor;
    existing.igstMinor += line.igstMinor;
    existing.totalMinor += line.totalMinor;
    // A folded line shows a unit rate only if every row agreed on one.
    if (existing.rateMinor !== line.rateMinor) existing.rateMinor = null;
  }

  // Taxable lines first in rate order, reimbursements last. Reimbursements sit
  // beneath the tax on the printed table because they are outside it, and a
  // reader scanning the GST columns should hit the end of them cleanly.
  const lines = [...folded.values()].sort((a, b) => {
    if (a.reimbursement !== b.reimbursement) return a.reimbursement ? 1 : -1;
    if (a.ratePercent !== b.ratePercent) return a.ratePercent - b.ratePercent;
    return a.label.localeCompare(b.label);
  });

  // ── totals ──────────────────────────────────────────────────────────────
  let taxableMinor = 0;
  let cgstMinor = 0;
  let sgstMinor = 0;
  let igstMinor = 0;
  let reimbursementMinor = 0;

  for (const line of lines) {
    if (line.reimbursement) {
      reimbursementMinor += line.totalMinor;
      continue;
    }
    taxableMinor += line.taxableMinor;
    cgstMinor += line.cgstMinor;
    sgstMinor += line.sgstMinor;
    igstMinor += line.igstMinor;
  }

  const totalTaxMinor = cgstMinor + sgstMinor + igstMinor;
  const totalMinor = taxableMinor + totalTaxMinor + reimbursementMinor;

  const ratesUsed = [
    ...new Set(
      lines.filter((l) => !l.reimbursement).map((l) => l.ratePercent),
    ),
  ].sort((a, b) => a - b);

  return {
    lineItems: lines.map((line) => ({
      description: line.label,
      sacCode: line.sacCode,
      quantity: line.quantity,
      rate: line.rateMinor === null ? null : fromMinor(line.rateMinor),
      grossAmount: fromMinor(line.grossMinor),
      discount: fromMinor(line.discountMinor),
      taxableValue: fromMinor(line.taxableMinor),
      ratePercent: line.ratePercent,
      cgstAmount: fromMinor(line.cgstMinor),
      sgstAmount: fromMinor(line.sgstMinor),
      igstAmount: fromMinor(line.igstMinor),
      lineTotal: fromMinor(line.totalMinor),
      reimbursement: line.reimbursement,
    })),
    taxableValue: fromMinor(taxableMinor),
    cgstAmount: fromMinor(cgstMinor),
    sgstAmount: fromMinor(sgstMinor),
    igstAmount: fromMinor(igstMinor),
    totalTax: fromMinor(totalTaxMinor),
    reimbursements: fromMinor(reimbursementMinor),
    total: fromMinor(totalMinor),
    isIntraState: intraState,
    ratesUsed,
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Re-check the invariants on a built result. Called on the issue path before
 * anything is numbered, snapshotted or rendered, so a document that does not add
 * up never reaches a customer and never burns a serial.
 *
 * Returns the list of broken invariants. Empty means good.
 */
export function verifyManualInvoiceMoney(money: ManualInvoiceMoney): string[] {
  const problems: string[] = [];

  const isWhole = (v: number) =>
    Number.isFinite(v) && Number.isInteger(toMinor(v));

  const lineTaxable = money.lineItems.reduce(
    (sum, l) => sum + toMinor(l.taxableValue),
    0,
  );
  if (lineTaxable !== toMinor(money.taxableValue)) {
    problems.push(
      `I1 line taxable values sum to ${fromMinor(lineTaxable)}, not ${money.taxableValue}`,
    );
  }

  const heads =
    toMinor(money.cgstAmount) +
    toMinor(money.sgstAmount) +
    toMinor(money.igstAmount);
  if (heads !== toMinor(money.totalTax)) {
    problems.push(
      `I2 tax heads sum to ${fromMinor(heads)}, not ${money.totalTax}`,
    );
  }

  const composed =
    toMinor(money.taxableValue) +
    toMinor(money.totalTax) +
    toMinor(money.reimbursements);
  if (composed !== toMinor(money.total)) {
    problems.push(
      `I3 taxable + tax + reimbursements is ${fromMinor(composed)}, not ${money.total}`,
    );
  }

  const amounts = [
    money.taxableValue,
    money.cgstAmount,
    money.sgstAmount,
    money.igstAmount,
    money.totalTax,
    money.reimbursements,
    money.total,
    ...money.lineItems.flatMap((l) => [
      l.taxableValue,
      l.cgstAmount,
      l.sgstAmount,
      l.igstAmount,
      l.lineTotal,
    ]),
  ];
  if (!amounts.every(isWhole)) {
    problems.push("I4 an amount is not a whole number of minor units");
  }

  for (const line of money.lineItems) {
    if (!line.reimbursement) continue;
    if (
      line.taxableValue !== 0 ||
      line.cgstAmount !== 0 ||
      line.sgstAmount !== 0 ||
      line.igstAmount !== 0
    ) {
      problems.push(
        `I5 reimbursement line "${line.description}" carries taxable value or tax`,
      );
    }
  }

  return problems;
}
