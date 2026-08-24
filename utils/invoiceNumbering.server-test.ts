/**
 * utils/invoiceNumbering.server-test.ts
 *
 * The invoice serial. The highest-stakes string this codebase produces.
 *
 * A wrong number here is not a rendering bug that somebody notices and we fix.
 * It is a tax document in a customer's hands, filed in a GSTR-1 return, that
 * cannot be withdrawn or renumbered. The two failures worth writing tests for
 * are the two that are unrecoverable:
 *
 *   - the SAME number reaching two documents, and
 *   - a number changing shape or losing its year, so two documents from
 *     different periods can collide.
 *
 * ── WHY A SEPARATE RUNNER ───────────────────────────────────────────────────
 * numbering.ts is marked "server-only", which throws under plain Node. This
 * file runs under --conditions=react-server, where that package resolves to a
 * no-op, exactly as it does in a Next server component:
 *
 *   npm run test:server     (or npm run test:all for both)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TaxDocType } from "@/generated/prisma";
import {
  CREDIT_NOTE_NUMBER_PREFIX,
  INVOICE_NUMBER_PREFIX,
} from "@/lib/invoices/tax/config";
import { financialYearOf } from "@/lib/invoices/tax/gst";
import {
  formatInvoiceNumber,
  prefixFor,
  seriesFor,
} from "@/lib/invoices/tax/numbering";

/** An IST instant. The month in the number is the IST month, never UTC's. */
function ist(iso: string): Date {
  return new Date(iso);
}

describe("the printed number", () => {
  it("is prefix, MMYY, then a five digit running number", () => {
    assert.equal(
      formatInvoiceNumber("ARN", ist("2026-08-24T10:00:00+05:30"), 47),
      "ARN082600047",
    );
  });

  it("carries no slashes, so it survives a filename unchanged", () => {
    const number = formatInvoiceNumber("ARN", ist("2026-08-24T10:00:00+05:30"), 47);
    assert.match(number, /^[A-Z0-9]+$/);
    assert.equal(number.replace(/[^A-Za-z0-9]+/g, "-"), number);
  });

  it("stays inside the sixteen characters GST allows", () => {
    // The longest thing this can produce: the longer prefix and a sequence that
    // has run past the padding.
    const longest = formatInvoiceNumber(
      CREDIT_NOTE_NUMBER_PREFIX,
      ist("2026-12-31T23:59:00+05:30"),
      999_999,
    );
    assert.ok(
      longest.length <= 16,
      `${longest} is ${longest.length} characters, over the GST limit of 16`,
    );
  });

  it("pads to five digits but never truncates past them", () => {
    const d = ist("2026-08-24T10:00:00+05:30");
    assert.equal(formatInvoiceNumber("ARN", d, 1), "ARN082600001");
    assert.equal(formatInvoiceNumber("ARN", d, 99_999), "ARN082699999");
    // A business that outgrows the padding must keep counting, not wrap.
    assert.equal(formatInvoiceNumber("ARN", d, 100_000), "ARN0826100000");
  });

  it("takes the month from IST, not from UTC", () => {
    // 19:00 UTC on 31 August is 00:30 IST on 1 September. The invoice belongs
    // to September, and a number that said 08 would file it in the wrong month.
    assert.equal(
      formatInvoiceNumber("ARN", new Date("2026-08-31T19:00:00Z"), 5),
      "ARN092600005",
    );
  });

  it("separates two documents a year apart in the same month", () => {
    const a = formatInvoiceNumber("ARN", ist("2026-08-24T10:00:00+05:30"), 47);
    const b = formatInvoiceNumber("ARN", ist("2027-08-24T10:00:00+05:30"), 47);
    assert.notEqual(a, b);
  });
});

describe("one book, not two", () => {
  it("prints the same prefix whether the invoice was booked or raised by hand", () => {
    // The whole point of the merge. If these ever differ again, ARN/00001 and
    // ARM/00001 come back and "invoice one" names two documents.
    assert.equal(prefixFor(false), INVOICE_NUMBER_PREFIX);
    assert.equal(prefixFor(false), "ARN");
  });

  it("draws both invoice paths from a single counter key", () => {
    assert.equal(seriesFor(false), seriesFor(false));
    assert.equal(seriesFor(false), TaxDocType.TAX_INVOICE);
  });

  it("keeps credit notes in their own book", () => {
    // Shared by both paths, but never the invoice series: a credit note is not
    // an invoice and GSTR-1 reports them apart.
    assert.notEqual(seriesFor(true), seriesFor(false));
    assert.equal(seriesFor(true), TaxDocType.CREDIT_NOTE);
    assert.equal(prefixFor(true), CREDIT_NOTE_NUMBER_PREFIX);
  });

  it("keys the booking counter on the name it has always been keyed on", () => {
    // Renaming this would start a fresh count at 1 and re-issue numbers that
    // are already on documents customers hold. The live row is "TAX_INVOICE".
    assert.equal(seriesFor(false), "TAX_INVOICE");
    assert.equal(seriesFor(true), "CREDIT_NOTE");
  });
});

describe("the financial year the counter is keyed on", () => {
  it("rolls in April, not January", () => {
    assert.equal(financialYearOf(ist("2026-03-31T23:00:00+05:30")), "25-26");
    assert.equal(financialYearOf(ist("2026-04-01T00:30:00+05:30")), "26-27");
  });

  it("holds one series across a month boundary inside the year", () => {
    // MMYY is a label; the counter is annual. August and September 2026 are the
    // same book, which is what makes the series one consecutive run per year.
    assert.equal(
      financialYearOf(ist("2026-08-31T10:00:00+05:30")),
      financialYearOf(ist("2026-09-01T10:00:00+05:30")),
    );
  });

  it("puts January to March into the year that opened the previous April", () => {
    // The case that catches a naive getFullYear(): these months print YY as 27
    // but belong to the book opened in April 2026.
    assert.equal(financialYearOf(ist("2027-02-14T10:00:00+05:30")), "26-27");
    assert.equal(
      formatInvoiceNumber("ARN", ist("2027-02-14T10:00:00+05:30"), 300),
      "ARN022700300",
    );
  });
});
