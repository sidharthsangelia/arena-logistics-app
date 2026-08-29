# 02. Reconciling money to the paisa: five invariants and a residual you hide on purpose

**Kind:** design decision · **Tier:** 1 · **Est. length:** 1300 words · standalone

## Hook

The invoice total is not computed. It is the amount already taken out of the
customer's wallet. Everything else on the document has to be derived backwards
from it and then forced to add up.

## Thesis

Most money bugs are not rounding bugs. They are ordering bugs: someone rounded at
a different point than someone else did, and the two numbers were then asked to
be equal. The fix is to name a single authoritative figure and make every other
number reconcile to it, not to add more decimal places.

## Outline

1. The five invariants, as asserted by property tests over thousands of generated
   inputs, and enforced at issue time:
   - I1 `total` equals the wallet debit, exactly
   - I2 the sum of line taxable values equals the taxable value
   - I3 taxable value plus total tax equals total
   - I4 CGST + SGST + IGST equals total tax
   - I5 every amount is a whole number of paise
   "Exactly" means exactly, not within a paisa.
2. Why it is arithmetically awkward. Three facts collide: customer prices are tax
   *inclusive* so taxable value is back-computed by division and almost never
   lands on a whole paisa; the org markup is applied per line with each line
   rounded independently, so the stored lines already drift from the stored total
   before you start; and the total is non-negotiable.
3. Integer paise everywhere. Rupee floats accumulate error in exactly the way the
   module exists to prevent.
4. The residual. It has to go somewhere. It goes into the largest line, where a
   few paise on a five-figure freight charge is invisible, rather than onto a
   "round off" line that reads like a bug to the customer. This is a product
   decision wearing arithmetic clothes.
5. Place of supply as an input to the arithmetic: intra-state splits into
   CGST/SGST, inter-state is IGST, and getting the state code wrong produces an
   invoice the customer's accountant cannot use.
6. The live bug worth confessing: an issuer state code of 07 against a GSTIN
   beginning 06 files every invoice under the wrong heads. State code and GSTIN
   prefix must be validated against each other, not configured independently.
7. Purity as a testing strategy. No `server-only`, no Prisma, no clock, no env,
   which is why the invariants can be tested exhaustively and why the same GSTIN
   validator runs in the settings form and in the generator.

## Code

- `lib/invoices/tax/money.ts`
- `lib/invoices/tax/gst.ts`
- `lib/pricing/markup.ts`
- `utils/invoiceMoney.test.ts`, `utils/manualInvoiceMoney.test.ts`

## Trim to fit

Drop point 7 (purity as a testing strategy) to a closing paragraph, and state the
five invariants as a compact list rather than discussing each.

## Still to decide

Whether to publish the state-code bug as a live confession or as a past-tense
war story. Confessions read better; check it is fixed first.
