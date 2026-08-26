/**
 * lib/invoices/tax/config.ts
 *
 * Tax policy and issuer identity for the invoices Arena raises. Everything a
 * chartered accountant might tell you to change lives here, in one file, so
 * changing it never means touching the money engine or the PDF template.
 *
 * PURE MODULE. Read by the generator on the server and by the invoice UI in the
 * browser, so it must stay free of "server-only", prisma and secrets.
 *
 * ── ONE THING TO UNDERSTAND BEFORE CHANGING A RATE ──────────────────────────
 * Prices in this product are TAX INCLUSIVE. What the customer was quoted is what
 * came out of their wallet, and the invoice total must equal that to the paisa.
 * So a rate here does not decide what the customer pays; it decides how the
 * amount they already paid is SPLIT between taxable value and tax.
 *
 * Raising the rate therefore lowers the taxable value, it does not raise the
 * total. If you ever want tax charged ON TOP, that is a pricing change in the
 * booking flow, not a change to this file.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { ShipmentMode } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

export interface TaxTreatment {
  /** Percentage applied to the taxable value. 0 means nothing is charged. */
  ratePercent: number;
  /**
   * Printed under the totals when ratePercent is 0. A zero-rated invoice with
   * no explanation is the kind of thing that gets questioned; state the reason
   * on the document itself.
   */
  note?: string;
  /** Services Accounting Code printed against every line. */
  sacCode: string;
  /** Expanded on the invoice next to the SAC, in plain words. */
  sacDescription: string;
}

/**
 * Domestic, India to India. Courier and goods transport by road or air within
 * India is a straightforward taxable supply at 18%.
 */
const DOMESTIC_TREATMENT: TaxTreatment = {
  ratePercent: 18,
  sacCode: "996812",
  sacDescription: "Courier services",
};

/**
 * International, India to abroad.
 *
 * PENDING CONFIRMATION FROM YOUR CA. Set to 18% because that is the treatment
 * that applies once the old export-freight exemption lapsed, and because
 * charging tax and being told later it was exempt is a recoverable mistake,
 * while the reverse means reissuing documents and finding the money.
 *
 * To switch to exempt, set ratePercent to 0 and put the citation your CA gives
 * you in `note`. The money engine, the PDF and the stored columns all handle a
 * zero rate already; nothing else needs to change.
 */
const INTERNATIONAL_TREATMENT: TaxTreatment = {
  ratePercent: 18,
  sacCode: "996812",
  sacDescription: "Goods transport services",
};

export function taxTreatmentFor(mode: ShipmentMode): TaxTreatment {
  return mode === ShipmentMode.DOMESTIC
    ? DOMESTIC_TREATMENT
    : INTERNATIONAL_TREATMENT;
}

// ---------------------------------------------------------------------------
// Issuer — who the invoice is FROM
// ---------------------------------------------------------------------------
//
// Config rather than a database table, for now. These details change roughly
// never, and a constant cannot be blanked by a bad edit in an admin form at
// 2am and start printing invoices with no GSTIN on them.
//
// Everything is read through `getInvoiceIssuer()` below, so moving this to a
// settings table later changes exactly one function body and no call sites.

export interface InvoiceIssuer {
  legalName: string;
  tradeName?: string;
  addressLines: string[];
  city: string;
  stateName: string;
  /** Two-digit GST state code. Drives the IGST vs CGST/SGST decision. */
  stateCode: string;
  postalCode: string;
  country: string;
  gstin: string;
  pan: string;
  /**
   * Corporate Identity Number. Optional in the type rather than required,
   * because the issuer snapshot frozen onto every invoice raised before this
   * field existed has no value here and must still render.
   */
  cin?: string;
  email: string;
  phone: string;
  website?: string;
  bank?: {
    accountName: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    branch?: string;
  };
  /** Printed above the signature line. */
  declaration: string;
  /**
   * Where a dispute over this invoice is heard. Printed at the foot of the
   * document because a jurisdiction clause that is not on the paper is not a
   * jurisdiction clause.
   */
  jurisdiction: string;
  /** Where a customer takes a billing question. Printed beside the clause. */
  billingEmail: string;
}

/**
 * PLACEHOLDERS. Replace every value below with Arena's real registered details
 * before issuing a single invoice to a customer. They are written as obvious
 * placeholders rather than plausible-looking fakes precisely so that a document
 * generated before this is filled in is unmistakably wrong at a glance instead
 * of quietly carrying a wrong GSTIN.
 *
 * Environment variables win where present, so production can be corrected
 * without a code change if these are ever found to be stale.
 */
const ISSUER: InvoiceIssuer = {
  legalName: process.env.INVOICE_ISSUER_LEGAL_NAME ?? "REPLACE ME PRIVATE LIMITED",
  tradeName: process.env.INVOICE_ISSUER_TRADE_NAME ?? "Arena Cargo Logistics",
  addressLines: (
    process.env.INVOICE_ISSUER_ADDRESS ?? "REPLACE ME: registered address line 1"
  ).split("|"),
  city: process.env.INVOICE_ISSUER_CITY ?? "REPLACE ME",
  stateName: process.env.INVOICE_ISSUER_STATE_NAME ?? "Delhi",
  stateCode: process.env.INVOICE_ISSUER_STATE_CODE ?? "07",
  postalCode: process.env.INVOICE_ISSUER_POSTAL_CODE ?? "000000",
  country: "India",
  gstin: process.env.INVOICE_ISSUER_GSTIN ?? "REPLACE ME",
  pan: process.env.INVOICE_ISSUER_PAN ?? "REPLACE ME",
  cin: process.env.INVOICE_ISSUER_CIN,
  email: process.env.INVOICE_ISSUER_EMAIL ?? "info@arenalogistics.co.in",
  phone: process.env.INVOICE_ISSUER_PHONE ?? "REPLACE ME",
  website: process.env.INVOICE_ISSUER_WEBSITE ?? "arenalogistics.co.in",
  bank: process.env.INVOICE_ISSUER_BANK_ACCOUNT
    ? {
        accountName:
          process.env.INVOICE_ISSUER_BANK_ACCOUNT_NAME ?? "REPLACE ME",
        accountNumber: process.env.INVOICE_ISSUER_BANK_ACCOUNT,
        ifsc: process.env.INVOICE_ISSUER_BANK_IFSC ?? "REPLACE ME",
        bankName: process.env.INVOICE_ISSUER_BANK_NAME ?? "REPLACE ME",
        branch: process.env.INVOICE_ISSUER_BANK_BRANCH,
      }
    : undefined,
  declaration: "CERTIFIED THAT THE PARTICULARS GIVEN ABOVE ARE TRUE & CORRECT.",
  jurisdiction:
    process.env.INVOICE_ISSUER_JURISDICTION ?? "Delhi and Gurgaon",
  billingEmail:
    process.env.INVOICE_ISSUER_BILLING_EMAIL ??
    process.env.INVOICE_ISSUER_EMAIL ??
    "info@arenalogistics.co.in",
};

export function getInvoiceIssuer(): InvoiceIssuer {
  return ISSUER;
}

/**
 * True when the issuer block still holds placeholders. The generator refuses to
 * issue a numbered tax invoice in that state: a serial, once burned on a
 * document with "REPLACE ME" where the GSTIN should be, is gapless-accounting
 * damage that outlives the mistake.
 */
export function issuerIsConfigured(issuer: InvoiceIssuer = ISSUER): boolean {
  const suspect = [
    issuer.legalName,
    issuer.gstin,
    issuer.pan,
    issuer.city,
    ...issuer.addressLines,
  ];
  return !suspect.some((v) => !v || v.toUpperCase().includes("REPLACE ME"));
}

/**
 * True when the issuer's state code agrees with the first two digits of its own
 * GSTIN.
 *
 * ── WHY THIS IS ITS OWN CHECK ───────────────────────────────────────────────
 * `stateCode` alone decides IGST against CGST plus SGST on every invoice this
 * codebase raises, booking or manual. If it disagrees with the GSTIN, the total
 * a customer pays is still correct (see the note in money.ts: the split does not
 * change the total), but every invoice files that tax under the wrong heads.
 * That is a GSTR-1 problem discovered at return time, not at issue time, which
 * is exactly the kind of silence worth a loud check.
 *
 * Deliberately NOT folded into `issuerIsConfigured()`. That gate blocks issuing
 * entirely, and it should: a document with REPLACE ME where the GSTIN belongs
 * must never exist. A state-code mismatch is a real configuration decision
 * somebody may have made on purpose, so it warns rather than blocks.
 */
export function issuerStateMatchesGstin(
  issuer: InvoiceIssuer = ISSUER,
): boolean {
  const prefix = issuer.gstin?.trim().slice(0, 2);
  if (!prefix || prefix.length !== 2 || !/^\d{2}$/.test(prefix)) return true;
  return prefix === issuer.stateCode;
}

// ---------------------------------------------------------------------------
// Document presentation
// ---------------------------------------------------------------------------

/**
 * Prefix on every tax invoice serial, e.g. ARN082600047.
 *
 * Every tax invoice: booked or raised by hand. There is no second prefix. See
 * lib/invoices/tax/numbering.ts for the format and for why the two series were
 * merged into one.
 */
export const INVOICE_NUMBER_PREFIX = "ARN";
/** Prefix on every credit note serial, from either path. e.g. ARNCN082600003. */
export const CREDIT_NOTE_NUMBER_PREFIX = "ARNCN";
/** Zero-padded width of the per-financial-year running number. */
export const INVOICE_NUMBER_PAD = 5;

/**
 * The terms block, printed on every invoice from either path.
 *
 * ── WHY THESE ARE WRITTEN THIS TIGHTLY ──────────────────────────────────────
 * Five clauses is what Arena's billing actually needs stated, and every one of
 * them has a job: clause 1 names the only instrument payment is accepted on,
 * clause 2 starts the 3-day clock on disputes, clause 3 closes off unilateral
 * deductions, clause 4 is the interest claim, clause 5 keeps the fuel surcharge
 * inside the agreed price. Each is cut to one printed line at the size the
 * footer sets, because the block sits under the totals on a document held to
 * one page and a term nobody can fit is a term nobody reads.
 *
 * They are LEAD-WORD FIRST ("PAYMENT: ..."), so the clause can be found by
 * scanning rather than read in full, and the template numbers them. Do not put
 * the numbers in the strings.
 *
 * The payee in clause 1 is interpolated from the issuer's own legal name rather
 * than typed, so a company rename cannot leave invoices telling customers to
 * write a cheque to a company that no longer exists.
 */
function commonTerms(issuer: InvoiceIssuer): string[] {
  return [
    `PAYMENT: By A/c payee cheque or demand draft favouring "${issuer.legalName}".`,
    "DISPUTES: Raise disputes in writing within 3 days of receipt; after that " +
      "the charges stand accepted.",
    "DEDUCTIONS: No deduction except TDS unless agreed. Send the TDS " +
      "certificate promptly.",
    "OUTSTANDING: Interest at 18% per annum on bills over 15 days, without " +
      "prejudice.",
    "FUEL: Fuel surcharge as per agreement, international and domestic.",
  ];
}

/**
 * Terms are per mode because the destination-charges clause is meaningless on
 * an India to India move, and a term that cannot apply to the shipment it is
 * printed on teaches the reader to skip the whole block.
 */
export function invoiceTermsFor(
  mode: ShipmentMode,
  issuer: InvoiceIssuer = ISSUER,
): string[] {
  const common = commonTerms(issuer);
  return mode === ShipmentMode.DOMESTIC
    ? common
    : [
        ...common,
        "DESTINATION: Duties and taxes levied at destination are payable by " +
          "the consignee.",
      ];
}

/**
 * The billing addresses a customer takes a question to, printed at the foot.
 *
 * `INVOICE_ISSUER_BILLING_EMAIL` accepts several, comma separated, because
 * billing questions at Arena reach two mailboxes and an invoice that names one
 * of them sends half the queries to a person who cannot answer them.
 */
export function billingEmails(issuer: InvoiceIssuer = ISSUER): string[] {
  return issuer.billingEmail
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}
