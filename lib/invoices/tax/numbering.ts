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
 *
 * ── ONE SERIES FOR THE WHOLE BUSINESS ───────────────────────────────────────
 * Booking invoices and manually raised invoices draw from the SAME counter and
 * print the SAME prefix. They used to be two series, ARN and ARM, each with its
 * own counter: that was legal, but it meant ARN/26-27/00001 and ARM/26-27/00001
 * both existed, and "invoice one" named two different documents. Two people
 * reading two invoice books is the confusion this now removes.
 *
 * Credit notes are the one deliberate exception. They keep their own counter,
 * shared by both paths, because a credit note is not an invoice and GSTR-1
 * reports them separately. One invoice series, one credit note series, and
 * nothing keyed on where the document was raised.
 *
 * A consequence worth stating: any caller that allocates from the shared
 * counter holds its row lock until the caller's transaction commits, and every
 * other invoice in the business waits behind it. Allocate, then commit, then do
 * the slow work. See the note on transaction length above.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, TaxDocType } from "@/generated/prisma";

import {
  CREDIT_NOTE_NUMBER_PREFIX,
  INVOICE_NUMBER_PAD,
  INVOICE_NUMBER_PREFIX,
} from "./config";
import { financialYearOf, istParts } from "./gst";

export interface AllocatedNumber {
  invoiceNumber: string;
  financialYear: string;
  sequence: number;
}

/**
 * Format: ARN082600047 — prefix, then MMYY, then the running number.
 *
 * Twelve characters, well inside the sixteen GST allows, and plain: no slashes,
 * so it survives a filename, a URL, a spreadsheet cell and a phone call without
 * anything having to escape it.
 *
 * ── WHY MONTH AND YEAR, NOT THE FINANCIAL YEAR ──────────────────────────────
 * The old format carried "26-27". Six characters to say a thing the invoice
 * date already says, and it located a document no better than the year alone.
 * MMYY is two characters shorter and strictly more informative: it says WHICH
 * MONTH the document belongs to, which is the unit a GSTR-1 return is filed in
 * and the unit anybody actually looks for an invoice by.
 *
 * The financial year has not gone anywhere. It is still stored on the row, it
 * is still what the counter is keyed on, and it is still what the document is
 * filed under. It is simply not printed twice.
 *
 * ── THE SEQUENCE DOES NOT RESET WITH THE MONTH ──────────────────────────────
 * MMYY is a label, not a counter key. The running number climbs through the
 * whole financial year and resets only in April, so the series stays ONE
 * consecutive run per year rather than twelve. That is the version of "a
 * consecutive serial number" that is simplest to demonstrate at assessment: a
 * monthly reset is equally legal but turns one series into twelve, and makes
 * "invoice 12" a number that means nothing without its month.
 *
 * So April 2026 opens at ARN042600001 and the September invoice after it is
 * ARN092600138, not ARN092600001.
 */
export function formatInvoiceNumber(
  prefix: string,
  issueDate: Date,
  sequence: number,
): string {
  const { year, month } = istParts(issueDate);
  const mmyy = `${String(month).padStart(2, "0")}${String(year % 100).padStart(2, "0")}`;

  return `${prefix}${mmyy}${String(sequence).padStart(INVOICE_NUMBER_PAD, "0")}`;
}

/** The printed prefix for a document type. Booking and manual share both. */
export function prefixFor(isCreditNote: boolean): string {
  return isCreditNote ? CREDIT_NOTE_NUMBER_PREFIX : INVOICE_NUMBER_PREFIX;
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
  return allocateSeriesNumber(
    tx,
    seriesFor(docType === TaxDocType.CREDIT_NOTE),
    issueDate,
  );
}

/**
 * The counter key for a document type. TWO keys exist in the whole codebase.
 *
 * These are the literal strings "TAX_INVOICE" and "CREDIT_NOTE", which are also
 * the TaxDocType member names. That is not a coincidence and it must not be
 * "tidied": the TAX_INVOICE row is the counter booking invoices have been
 * writing into since the first one was issued, and naming it anything else here
 * would start a fresh count at 1 and re-issue numbers that are already on
 * documents customers hold.
 */
export function seriesFor(isCreditNote: boolean): string {
  return isCreditNote
    ? TaxDocType.CREDIT_NOTE
    : TaxDocType.TAX_INVOICE;
}

/**
 * The counter itself.
 *
 * Both invoice paths call this with the same two series keys, so a booking
 * invoice and a manually raised one are consecutive entries in one book. See
 * the module header for why that replaced the two-series arrangement.
 *
 * `series` is a free string rather than an enum because InvoiceCounter is keyed
 * on `(series, financialYear)` and creates rows on demand. Pass a key from
 * seriesFor() rather than inventing one: a name nothing else uses starts a new
 * count at 1, which on a tax invoice means re-issuing a number.
 *
 * MUST be called inside a transaction, for the reason in the module header, and
 * that transaction must commit promptly. Every invoice in the business, from
 * either path, now queues behind this one row.
 */
export async function allocateSeriesNumber(
  tx: Prisma.TransactionClient,
  series: string,
  issueDate: Date,
): Promise<AllocatedNumber> {
  const financialYear = financialYearOf(issueDate);

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
    invoiceNumber: formatInvoiceNumber(
      prefixFor(series === TaxDocType.CREDIT_NOTE),
      issueDate,
      sequence,
    ),
    financialYear,
    sequence,
  };
}

/**
 * Hand a number back after the work it was taken for failed.
 *
 * Only ever succeeds when ours is still the highest number in the series, which
 * is the ordinary case: the render that failed took a second, and most of the
 * time nothing else asked for a number in that second. When something did, the
 * decrement matches nothing and the number stays spent, because reclaiming it
 * then would hand the SAME number to two documents, and a duplicated invoice
 * number is far worse than a missing one.
 *
 * Deliberately best-effort and deliberately silent about failing. The caller is
 * already on an error path and a failed reclaim must not replace the real error
 * with a confusing one.
 */
export async function releaseSeriesNumber(
  tx: Prisma.TransactionClient,
  series: string,
  financialYear: string,
  sequence: number,
): Promise<boolean> {
  const affected = await tx.$executeRaw`
    UPDATE "InvoiceCounter"
       SET "lastNumber" = "lastNumber" - 1,
           "updatedAt"  = now()
     WHERE "series" = ${series}
       AND "financialYear" = ${financialYear}
       AND "lastNumber" = ${sequence}
  `;

  return affected > 0;
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
