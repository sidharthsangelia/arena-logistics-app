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
  declaration:
    "We declare that this invoice shows the actual price of the services " +
    "described and that all particulars are true and correct.",
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

// ---------------------------------------------------------------------------
// Document presentation
// ---------------------------------------------------------------------------

/** Prefix on every tax invoice serial, e.g. ARN/26-27/00042. */
export const INVOICE_NUMBER_PREFIX = "ARN";
/** Prefix on every credit note serial, when that is built. */
export const CREDIT_NOTE_NUMBER_PREFIX = "ARNCN";
/** Zero-padded width of the per-year running number. */
export const INVOICE_NUMBER_PAD = 5;

export const INVOICE_TERMS = [
  "This invoice covers freight and related services only. Duties, taxes and " +
    "charges levied at destination are payable by the consignee.",
  "Claims relating to this invoice must be raised within 7 days of its date.",
];
