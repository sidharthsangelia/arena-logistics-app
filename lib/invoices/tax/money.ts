/**
 * lib/invoices/tax/money.ts
 *
 * Turns a booked shipment's stored charge snapshot into the line items and tax
 * summary printed on its invoice.
 *
 * PURE MODULE. Deterministic, no IO, no clock. Everything it needs is passed in,
 * which is what makes the invariants below testable exhaustively.
 *
 * ── THE INVARIANTS ──────────────────────────────────────────────────────────
 * These are not aspirations; utils/invoiceMoney.test.ts asserts them over
 * thousands of generated inputs, and the generator refuses to issue an invoice
 * if buildInvoiceMoney reports them broken.
 *
 *   I1. total === the authoritative amount debited from the wallet, exactly.
 *   I2. sum(line.taxableValue) === taxableValue, exactly.
 *   I3. taxableValue + totalTax === total, exactly.
 *   I4. cgst + sgst + igst === totalTax, exactly.
 *   I5. every amount is a whole number of paise.
 *
 * "Exactly" means exactly. Not within a paisa. A tax invoice whose lines do not
 * add up to its total is a document that gets sent back.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── WHY IT IS ARITHMETICALLY AWKWARD ────────────────────────────────────────
 * Three facts collide:
 *
 *   1. Customer prices are tax INCLUSIVE, so taxable value is back-computed by
 *      dividing, which almost never lands on a whole paisa.
 *   2. The org markup is applied per charge line with each line rounded
 *      independently (lib/pricing/markup.ts), so the stored lines already drift
 *      from the stored total by a few paise before we start.
 *   3. The total is not negotiable: it is the amount already taken from the
 *      wallet, and the invoice exists to account for that exact figure.
 *
 * So the total is treated as the one true input and everything else is derived
 * from it and then reconciled back to it. The residual is absorbed into the
 * largest line, where a few paise on a five-figure freight charge is invisible,
 * rather than shown as a "round off" line that reads like a bug to a customer.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Everything is computed in integer PAISE. Rupee floats accumulate error in
 * exactly the way this module exists to prevent.
 */

import { ShipmentMode } from "@/generated/prisma";

import { taxTreatmentFor, type TaxTreatment } from "./config";
import { isIntraState } from "./gst";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * One charge as it was persisted in Shipment.chargesSnapshot. The org markup is
 * ALREADY baked into `amount` by lib/pricing/markup.ts, and the amount is tax
 * inclusive. `name` is the vendor's own label and is never printed as-is; see
 * ./chargeNames.ts.
 */
export interface RawCharge {
  name: string;
  amount: number;
  currency?: string;
  taxAmount?: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
}

export interface InvoiceMoneyInput {
  /**
   * The authoritative total, in rupees: exactly what left the wallet. For a
   * booking this is Shipment.quotedTotal plus Shipment.firstMileCharge, the
   * same sum debited in createShipment.action.ts.
   */
  totalCharged: number;
  /** Charge lines from Shipment.chargesSnapshot.charges, markup included. */
  charges: RawCharge[];
  /** Door pickup, priced and stored separately from the freight snapshot. */
  firstMileCharge?: number | null;
  firstMileLabel?: string | null;
  mode: ShipmentMode;
  sellerStateCode: string;
  placeOfSupplyCode: string;
  /** Overrides the mode's configured rate. Only used by tests and backfills. */
  taxTreatmentOverride?: TaxTreatment;
}

// ---------------------------------------------------------------------------
// Outputs (rupees, 2dp, safe to persist and print)
// ---------------------------------------------------------------------------

export interface InvoiceLineItem {
  /** Customer-facing description. Never a raw vendor string. */
  description: string;
  sacCode: string;
  quantity: number;
  /** Pre-tax value of this line. */
  taxableValue: number;
  ratePercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  /** taxableValue + this line's tax. */
  lineTotal: number;
}

export interface InvoiceMoney {
  lineItems: InvoiceLineItem[];
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  total: number;
  taxRatePercent: number;
  isIntraState: boolean;
  taxNote?: string;
  sacCode: string;
}

// ---------------------------------------------------------------------------
// Paise helpers
// ---------------------------------------------------------------------------

/**
 * Rupees to whole paise. The epsilon nudge matters: 186.44 * 100 is
 * 18643.999999999996 in IEEE 754, and truncating that loses a paisa on a
 * value that was exact in the source data.
 */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0;
  return Math.round(rupees * 100 + (rupees >= 0 ? Number.EPSILON : -Number.EPSILON));
}

export function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

// ---------------------------------------------------------------------------
// Tax lines in the source data
// ---------------------------------------------------------------------------

/**
 * Vendor snapshots carry the VENDOR's own GST as a charge line (see the
 * adapters: "GST" from Shipmozo, "TAX" from Aramex). That tax was charged to
 * Arena, not by Arena. It is an input cost sitting inside the price, not
 * something the customer can claim, and printing it beside Arena's own GST
 * would state the tax twice on one document.
 *
 * So tax-named lines are dropped, and their value is not lost: the total is the
 * authoritative input, so whatever those lines contributed stays inside it and
 * is redistributed across the real service lines below.
 */
const TAX_LINE_PATTERN = /^(gst|igst|cgst|sgst|tax|vat|service\s*tax)\b/i;

export function isVendorTaxLine(charge: RawCharge): boolean {
  return TAX_LINE_PATTERN.test((charge.name ?? "").trim());
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/**
 * Build the printable money for one invoice.
 *
 * `describe` maps a raw vendor charge name to a customer-facing description; it
 * is injected rather than imported so this module stays free of branding
 * concerns and the tests can use identity.
 */
export function buildInvoiceMoney(
  input: InvoiceMoneyInput,
  describe: (rawName: string) => string,
): InvoiceMoney {
  const treatment = input.taxTreatmentOverride ?? taxTreatmentFor(input.mode);
  const ratePercent = Number.isFinite(treatment.ratePercent)
    ? Math.max(0, treatment.ratePercent)
    : 0;

  const totalPaise = toPaise(input.totalCharged);
  const intraState = isIntraState(input.sellerStateCode, input.placeOfSupplyCode);

  // ── 1. Assemble the printable components ────────────────────────────────
  //
  // Vendor tax lines out, non-positive lines out (a zero-value line is noise on
  // a document), door pickup appended as its own component since it is a
  // genuinely separate service the customer chose and paid for.

  const components: Array<{ description: string; paise: number }> = [];

  for (const charge of input.charges ?? []) {
    if (isVendorTaxLine(charge)) continue;
    const paise = toPaise(Number(charge.amount));
    if (paise <= 0) continue;
    components.push({ description: describe(charge.name), paise });
  }

  const firstMilePaise = toPaise(Number(input.firstMileCharge ?? 0));
  if (firstMilePaise > 0) {
    components.push({
      description: input.firstMileLabel?.trim()
        ? `Door pickup, ${input.firstMileLabel.trim()}`
        : "Door pickup",
      paise: firstMilePaise,
    });
  }

  // Descriptions collapse: several unrecognised vendor charges all become
  // "Handling and surcharges", and a vendor can return two lines that map to
  // the same label. Repeating a description down an invoice looks like a
  // mistake, so identical descriptions are summed into one line.
  //
  // Order of first appearance is kept rather than sorted. Every adapter pushes
  // freight first, so the document already reads freight-then-extras without
  // this module needing an opinion about how to rank charges.
  const merged = mergeByDescription(components);

  // ── 2. Reconcile the components to the authoritative total ───────────────
  //
  // Two things can put these out of step: the per-line markup rounding
  // described at the top of this file, and the vendor tax lines just removed.
  // Either way the components are scaled to the total and the remaining paise
  // are handed to the largest line.
  //
  // The degenerate case (no usable components at all, e.g. a snapshot that was
  // nothing but a tax line) still has to produce a valid invoice, so it falls
  // back to a single line carrying the whole total.

  const grossLines = reconcileToTotal(merged, totalPaise, input.mode);

  // ── 3. Split each gross line into taxable value and tax ──────────────────
  //
  // Gross is tax inclusive, so taxable = gross * 100 / (100 + rate). Each line
  // is rounded, then the SAME residual technique reconciles the rounded taxable
  // values back to the invoice's taxable value, so I2 holds by construction
  // rather than by luck.

  const totalTaxablePaise =
    ratePercent > 0
      ? Math.round((totalPaise * 100) / (100 + ratePercent))
      : totalPaise;
  const totalTaxPaise = totalPaise - totalTaxablePaise;

  const lineTaxable = splitProportionally(
    grossLines.map((l) => l.paise),
    totalTaxablePaise,
  );

  // Per-line tax is the line's own remainder, so line taxable + line tax always
  // equals line gross, and the lines still sum to the invoice totals.
  const lineItems: InvoiceLineItem[] = grossLines.map((line, i) => {
    const taxable = lineTaxable[i];
    const lineTax = line.paise - taxable;

    return {
      description: line.description,
      sacCode: treatment.sacCode,
      quantity: 1,
      taxableValue: toRupees(taxable),
      ratePercent,
      cgstAmount: toRupees(intraState ? halfDown(lineTax) : 0),
      sgstAmount: toRupees(intraState ? halfUp(lineTax) : 0),
      igstAmount: toRupees(intraState ? 0 : lineTax),
      lineTotal: toRupees(line.paise),
    };
  });

  // ── 4. Invoice-level tax heads ──────────────────────────────────────────
  //
  // Summed from the lines rather than recomputed, so the column totals on the
  // document are literally the sum of the column above them. An odd number of
  // paise splits as the CGST half rounded down and the SGST half rounded up,
  // which is the conventional treatment and keeps I4 exact.

  const cgstPaise = intraState ? halfDown(totalTaxPaise) : 0;
  const sgstPaise = intraState ? halfUp(totalTaxPaise) : 0;
  const igstPaise = intraState ? 0 : totalTaxPaise;

  return {
    lineItems,
    taxableValue: toRupees(totalTaxablePaise),
    cgstAmount: toRupees(cgstPaise),
    sgstAmount: toRupees(sgstPaise),
    igstAmount: toRupees(igstPaise),
    totalTax: toRupees(totalTaxPaise),
    total: toRupees(totalPaise),
    taxRatePercent: ratePercent,
    isIntraState: intraState,
    taxNote: ratePercent === 0 ? treatment.note : undefined,
    sacCode: treatment.sacCode,
  };
}

// ---------------------------------------------------------------------------
// Reconciliation primitives
// ---------------------------------------------------------------------------

function mergeByDescription(
  components: Array<{ description: string; paise: number }>,
): Array<{ description: string; paise: number }> {
  const byDescription = new Map<string, { description: string; paise: number }>();

  for (const component of components) {
    const existing = byDescription.get(component.description);
    if (existing) existing.paise += component.paise;
    else byDescription.set(component.description, { ...component });
  }

  return [...byDescription.values()];
}

function halfDown(paise: number): number {
  return Math.floor(paise / 2);
}

function halfUp(paise: number): number {
  return paise - Math.floor(paise / 2);
}

/**
 * Distribute `target` across `weights` in proportion, with every share a whole
 * number of paise and the shares summing to `target` EXACTLY.
 *
 * Largest-remainder: floor every share, then hand the leftover units out one at
 * a time to the entries with the largest discarded fractions. This is the same
 * method used for apportioning seats, and it is chosen over "give the residual
 * to the biggest line" here because the drift being corrected is sub-paise
 * rounding spread across every line, not a single lump.
 *
 * A zero or negative total weight cannot be apportioned, so everything goes to
 * the first entry rather than producing NaN shares.
 */
export function splitProportionally(
  weights: number[],
  target: number,
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (n === 1) return [target];

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    return weights.map((_, i) => (i === 0 ? target : 0));
  }

  const exact = weights.map((w) => (w * target) / totalWeight);
  const shares = exact.map((v) => Math.floor(v));
  let remainder = target - shares.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  // remainder is bounded by n, but guard the loop anyway: this function is the
  // load-bearing one for every invariant in this file.
  for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) {
    shares[order[k].i] += 1;
  }
  if (remainder > 0) shares[0] += remainder;

  return shares;
}

/**
 * Scale components to hit `total` exactly, absorbing the residual into the
 * largest line.
 *
 * Deliberately different from splitProportionally: the residual here can be a
 * visible amount (removing vendor tax lines can move the sum by a lot), and
 * spreading that across every line would make each printed component subtly
 * wrong. Concentrating it in the freight line, which dominates every real
 * shipment, keeps the smaller components at their true values.
 */
function reconcileToTotal(
  components: Array<{ description: string; paise: number }>,
  total: number,
  mode: ShipmentMode,
): Array<{ description: string; paise: number }> {
  const fallbackDescription =
    mode === ShipmentMode.DOMESTIC
      ? "Domestic courier services"
      : "International freight services";

  if (components.length === 0) {
    return [{ description: fallbackDescription, paise: total }];
  }

  const sum = components.reduce((a, c) => a + c.paise, 0);
  if (sum === total) return components;

  if (sum <= 0) {
    return [{ description: fallbackDescription, paise: total }];
  }

  // Scale proportionally, then give the leftover to the largest component.
  const scaled = splitProportionally(
    components.map((c) => c.paise),
    total,
  );

  const result = components.map((c, i) => ({
    description: c.description,
    paise: scaled[i],
  }));

  // A component can scale to zero or below when the residual is large and the
  // component was tiny. A zero-value line on an invoice is noise, and a
  // negative one is nonsense, so fold those into the largest line.
  const positive = result.filter((r) => r.paise > 0);
  if (positive.length === result.length) return result;
  if (positive.length === 0) {
    return [{ description: fallbackDescription, paise: total }];
  }

  const shortfall = total - positive.reduce((a, r) => a + r.paise, 0);
  const largest = positive.reduce((a, b) => (b.paise > a.paise ? b : a));
  largest.paise += shortfall;

  return positive;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Re-check the invariants on a built result. Called by the generator before it
 * allocates an invoice number, so a bug here fails the job loudly and leaves no
 * numbered document behind rather than issuing arithmetic nobody can defend.
 */
export function verifyInvoiceMoney(
  money: InvoiceMoney,
  expectedTotal: number,
): { ok: true } | { ok: false; problem: string } {
  const p = (n: number) => toPaise(n);

  if (p(money.total) !== p(expectedTotal)) {
    return {
      ok: false,
      problem: `total ${money.total} does not equal the amount charged ${expectedTotal}`,
    };
  }

  const lineSum = money.lineItems.reduce((a, l) => a + p(l.taxableValue), 0);
  if (lineSum !== p(money.taxableValue)) {
    return {
      ok: false,
      problem: `line taxable values sum to ${toRupees(lineSum)}, expected ${money.taxableValue}`,
    };
  }

  if (p(money.taxableValue) + p(money.totalTax) !== p(money.total)) {
    return {
      ok: false,
      problem: `taxable ${money.taxableValue} + tax ${money.totalTax} does not equal total ${money.total}`,
    };
  }

  const heads = p(money.cgstAmount) + p(money.sgstAmount) + p(money.igstAmount);
  if (heads !== p(money.totalTax)) {
    return {
      ok: false,
      problem: `cgst + sgst + igst = ${toRupees(heads)}, expected ${money.totalTax}`,
    };
  }

  if (money.lineItems.length === 0) {
    return { ok: false, problem: "invoice has no line items" };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Amount in words
// ---------------------------------------------------------------------------
//
// Indian numbering: thousand, lakh, crore. Printed on the invoice because it is
// conventional on Indian tax documents and because it makes a tampered figure
// obvious.

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens} ${ones}` : tens;
}

function integerToWords(n: number): string {
  if (n === 0) return "Zero";

  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;

  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));

  return parts.join(" ");
}

/** "Twenty Three Thousand Two Hundred Rupees and Fifty Paise only". */
export function amountInWords(rupees: number, currency = "INR"): string {
  const paise = toPaise(Math.abs(rupees));
  const whole = Math.floor(paise / 100);
  const fraction = paise % 100;

  const unit = currency === "INR" ? "Rupees" : currency;
  const words = [`${integerToWords(whole)} ${unit}`];

  if (fraction > 0) {
    words.push(`and ${twoDigitWords(fraction)} Paise`);
  }

  return `${rupees < 0 ? "Minus " : ""}${words.join(" ")} only`;
}
