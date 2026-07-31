/**
 * lib/invoices/tax/numbering.ts
 *
 * Allocates invoice serials that are consecutive, unique within a financial
 * year, and gapless.
 *
 * ── WHY NOT A POSTGRES SEQUENCE ─────────────────────────────────────────────
 * utils/shipmentNumber.ts uses nextval() and documents that gaps are normal and
 * must not be reclaimed. That is the right call there: a missing shipment number
 * costs nothing and nobody audits them.
 *
 * It is the wrong call here. nextval() is deliberately non-transactional, so a
 * number handed out to a transaction that then rolls back is burned forever. GST
 * expects a consecutive serial, and "why does your invoice book skip from 41 to
 * 43" is the first question asked of one that is not. Gaps in an invoice series
 * are the kind of finding that turns a routine assessment into a longer one.
 *
 * So this uses a plain counter row instead, incremented inside the caller's
 * transaction. The increment rolls back with everything else, which is precisely
 * the property a sequence refuses to give.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * CONCURRENCY. The upsert below is a single atomic statement. Two bookings
 * committing at the same instant serialise on the counter row: the second waits
 * for the first to commit and then reads the incremented value. No application
 * lock, no retry loop, no chance of two invoices sharing a number.
 *
 * The row lock is held for the remainder of the caller's transaction, so the
 * caller must keep that transaction short. The generation job allocates the
 * number in its own tiny transaction rather than inside the PDF render for
 * exactly this reason.
 *
 * ALLOCATE LATE. Nothing calls this until the invoice is genuinely about to be
 * issued. Allocating at booking time and rendering afterwards would mean a
 * render that fails every retry leaves a numbered document that does not exist.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, TaxDocType } from "@/generated/prisma";

import {
  CREDIT_NOTE_NUMBER_PREFIX,
  INVOICE_NUMBER_PAD,
  INVOICE_NUMBER_PREFIX,
} from "./config";
import { financialYearOf } from "./gst";

export interface AllocatedNumber {
  invoiceNumber: string;
  financialYear: string;
  sequence: number;
}

/**
 * Format: ARN/26-27/00042
 *
 * Fifteen characters, inside the sixteen GST allows. The financial year is in
 * the number itself rather than only in a column, so a printed invoice is
 * self-describing and two invoices from different years can never look alike.
 */
export function formatInvoiceNumber(
  docType: TaxDocType,
  financialYear: string,
  sequence: number,
): string {
  const prefix =
    docType === TaxDocType.CREDIT_NOTE
      ? CREDIT_NOTE_NUMBER_PREFIX
      : INVOICE_NUMBER_PREFIX;

  return `${prefix}/${financialYear}/${String(sequence).padStart(INVOICE_NUMBER_PAD, "0")}`;
}

/**
 * Take the next serial for a document type and financial year.
 *
 * MUST be called inside a transaction. Called outside one, the increment commits
 * on its own and a later failure leaves the gap this module exists to prevent.
 *
 * @param tx      the caller's transaction client
 * @param docType tax invoices and credit notes number independently
 * @param issueDate the invoice's own date, which decides the financial year.
 *   Not "now": a job that runs seconds after midnight on 1 April must still
 *   number a booking made on 31 March into the year that booking belongs to.
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  docType: TaxDocType,
  issueDate: Date,
): Promise<AllocatedNumber> {
  const financialYear = financialYearOf(issueDate);
  const series = docType;

  // One statement does all of it: create the year's counter if this is its
  // first invoice, otherwise lock the existing row and increment. The row is
  // created on demand so a new financial year needs no migration or seeding.
  const rows = await tx.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO "InvoiceCounter" ("id", "series", "financialYear", "lastNumber", "updatedAt")
    VALUES (${randomUUID()}, ${series}, ${financialYear}, 1, now())
    ON CONFLICT ("series", "financialYear")
    DO UPDATE SET
      "lastNumber" = "InvoiceCounter"."lastNumber" + 1,
      "updatedAt"  = now()
    RETURNING "lastNumber"
  `;

  const sequence = rows?.[0]?.lastNumber;
  if (typeof sequence !== "number" || sequence < 1) {
    // Unreachable short of the table being missing, which means the schema was
    // never pushed. Fail loudly: silently continuing would issue an unnumbered
    // tax document.
    throw new InvoiceNumberingError(
      `Invoice counter returned no sequence for ${series} ${financialYear}. ` +
        "Check that the InvoiceCounter table exists (npx prisma db push).",
    );
  }

  return {
    invoiceNumber: formatInvoiceNumber(docType, financialYear, sequence),
    financialYear,
    sequence,
  };
}

export class InvoiceNumberingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceNumberingError";
  }
}

/**
 * Read-only peek at where a series currently stands. For the admin view and for
 * reconciliation; never used to derive the next number, because reading and then
 * writing is exactly the race the upsert above avoids.
 */
export async function peekInvoiceSeries(
  client: Prisma.TransactionClient,
  docType: TaxDocType,
  financialYear: string,
): Promise<number> {
  const row = await client.invoiceCounter.findUnique({
    where: {
      series_financialYear: { series: docType, financialYear },
    },
    select: { lastNumber: true },
  });

  return row?.lastNumber ?? 0;
}
