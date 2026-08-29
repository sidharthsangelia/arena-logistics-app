# 01. Invoice numbering: why a Postgres sequence is the wrong tool for a tax document

**Kind:** design decision · **Tier:** 1 · **Est. length:** 1400 words · standalone

## Hook

The same codebase uses `nextval()` for one identifier and refuses to use it for
another, forty lines away in the comments. The difference is not technical. It
is that one of the two numbers gets audited.

## Thesis

"Use a database sequence for your IDs" is correct advice that becomes wrong the
moment the identifier has a legal meaning. Indian GST expects a consecutive,
gapless serial per financial year. `nextval()` is deliberately non-transactional,
so a number handed to a transaction that then rolls back is burned forever. That
is a feature for shipment numbers and a finding at assessment for invoices.

## Outline

1. Two identifiers, two rules. Shipment numbers use a sequence and document that
   gaps are normal and must not be reclaimed. Invoice numbers cannot.
2. Why gaps matter here. "Why does your invoice book skip from 41 to 43" is the
   first question asked of a series that has one.
3. The replacement: a counter row, incremented by a single `INSERT ... ON
   CONFLICT DO UPDATE` inside the *caller's* transaction, so the increment rolls
   back with everything else.
4. Concurrency for free. Two invoices committing at the same instant serialise on
   the counter row. No application lock, no retry loop.
5. The cost you accept, out loud: the row lock is held for the rest of the
   caller's transaction, so every invoice in the business queues behind it.
   Therefore allocate late, commit fast, and never render a PDF inside that
   transaction.
6. Allocate late, not early. Numbering at booking time and rendering afterwards
   means a render that fails every retry leaves a numbered document that does
   not exist.
7. Reclaiming a number: `releaseSeriesNumber` only succeeds when yours is still
   the highest. Best-effort and deliberately silent, because a duplicated invoice
   number is far worse than a missing one.
8. The merge. Two series (`ARN` and `ARM`) meant "invoice one" named two
   different documents. One series now. Credit notes stay separate because
   GSTR-1 reports them separately.
9. The format change. `ARN/26-27/00001` became `ARN082600047`: no separators so
   it survives a filename, a URL, a spreadsheet cell and a phone call. MMYY is
   shorter *and* more informative than the financial year the invoice date
   already states. The sequence does not reset with the month, because a monthly
   reset turns one series into twelve.
10. The landmine, worth its own section: the counter key is the literal string
    `"TAX_INVOICE"`. Renaming it as a tidy-up restarts the count at 1 and
    re-issues numbers that are already printed on documents customers hold.

## Code

- `lib/invoices/tax/numbering.ts` (the whole file, module header included)
- `utils/shipmentNumber.ts` for the deliberate contrast
- `utils/invoiceNumbering.server-test.ts`

## Why it will land

Almost every "IDs in Postgres" post argues UUID vs sequence vs snowflake on
performance grounds. Nobody writes about the case where a regulator reads them.

## Still to decide

Whether to name GST specifically or generalise to "regulated serial numbers".
Naming it is more useful and narrows the audience.
