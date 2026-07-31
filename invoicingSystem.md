# Invoicing system

How Arena raises a GST tax invoice for every booking, automatically.

This document is the reference for the feature: what it does, why each decision
went the way it did, and what to check when something looks wrong.

---

## 1. What it is

Every shipment that reaches `BOOKED`, domestic or international, standard org or
business associate, produces a GST tax invoice from Arena to the org that
booked it. The invoice is rendered to a PDF, stored on UploadThing, listed on
`/invoices`, downloadable from the shipment detail page, and attached to the
booking confirmation email.

The point of the feature is that the customer gets a document from us proving
the booking happened, without asking for one.

### What it is not

There are two other things in this codebase called "invoice". They are
different and they stay different.

| Thing | Model | Who makes it | What it is |
| --- | --- | --- | --- |
| Booking tax invoice | `ShipmentInvoice` | The platform, automatically | Arena's GST invoice for one booking. This document. |
| Account bill | `Invoice` | An Arena admin, by hand | A PDF from Arena's accounting system, uploaded and attached to an org. Predates this feature. |
| Commercial invoice | `ShipmentDocument.INVOICE` | The customer | The customer's own invoice for customs. Arena never generates one. |

They were kept as separate models rather than one table with a type column
because their rules genuinely conflict: an account bill is editable and
deletable by an admin, a tax invoice is neither, and merging them would put a
branch on that distinction in every function in the invoice layer.

---

## 2. Decisions, and why

Each of these was a real fork in the road. They are recorded here so that
changing one later is a decision rather than an accident.

**It is a real GST tax invoice, not a receipt.** A receipt would have been much
less work: no numbering rules, no tax split, no place of supply. A tax invoice
is what a business customer's accountant needs to claim input credit, which is
most of the reason a customer wants one.

**Prices are tax inclusive, so the tax is back-computed.** The wallet was
already debited before the invoice exists. The invoice total must equal that
amount to the paisa, so the taxable value is derived by dividing rather than the
tax being added on top. Consequence worth internalising: **changing the GST rate
does not change what a customer pays.** It changes how the amount they already
paid is split between taxable value and tax. Charging tax on top would be a
pricing change in the booking flow, not a change to this feature.

**The number is gapless, and resets each financial year.** Format
`ARN/26-27/00042`, fifteen characters, inside the sixteen GST allows.
`utils/shipmentNumber.ts` uses a Postgres sequence and documents that gaps are
normal; that is right for shipment numbers and wrong here. `nextval()` is
non-transactional, so a rollback burns a number permanently, and a skipped
invoice serial is the first thing an auditor asks about. So invoices use a
counter row incremented inside the caller's transaction, which rolls back with
everything else.

**The number is allocated as late as possible.** Not at booking. If a PDF render
failed on every retry after the number had been taken, the series would have a
hole pointing at a document that does not exist.

**The vendor's own GST is dropped from the breakdown.** Rate adapters return a
`GST` or `TAX` charge line (see `shipmozo.adapter.ts:201`,
`shipmozo-domestic.adapter.ts:194`, `aramex.adapter.ts:204`). That tax was
charged *to* Arena; it is an input cost inside the price, not something the
customer can claim. Printing it beside Arena's own GST would state tax twice on
one document. The money is not lost: the total is authoritative, so whatever
those lines contributed is redistributed across the real service lines.

**A business associate is billed, not their client.** The BA paid from their
wallet at their own rate. The client appears in the shipment block as the
shipper, and nowhere else. The BA can forward the document without it exposing
anything about how they price their own clients.

**The breakdown reaches the invoice through the booking form.** This is the
part that broke first, so it is worth knowing the whole chain:

```
adapter → RateQuote.charges       (vendor breakdown)
  → applyMarkup()                 (every amount scaled, breakdown stays consistent)
  → quoteToServiceOption()        (RateOptionPicker.tsx)
  → BookingFormData.selectedService.charges
  → Shipment.chargesSnapshot      ({...service, price}, so `.charges` sits inside)
  → readCharges()                 (build.ts)
  → buildInvoiceMoney()
```

`quoteToServiceOption` originally dropped `charges`, because `ServiceOption` was
a deliberately slim projection of a quote. Nothing failed: `readCharges` found
no `charges` key, returned `[]`, and the money engine's degenerate branch put
the whole total on one line. Every invoice was arithmetically perfect and
showed no breakdown at all. If breakdowns disappear again, check this chain
before suspecting the naming rules below.

The amounts carried here are display data. The invoice engine treats the wallet
debit as authoritative and reconciles the components to it, so a tampered
breakdown cannot change what anyone is charged or what tax is stated.

**Every charge the customer paid for is shown, and no vendor name is.** These
pull against each other. `carrierBranding.md` is explicit that sourcing vendors
are not disclosed, and charge names are a side door: the skart adapter passes
`charge_name` straight through from its API and shipmozo passes
`overhead_charges_details[].name`.

The first version of `chargeNames.ts` was a strict allowlist, and everything
unrecognised collapsed into one shared generic line. That is airtight on
disclosure and useless as a breakdown, because vendors invent surcharge names
constantly and each new one silently merged into the same bucket.

So the check is now on the shape of the label rather than on membership of a
list. The branding guard is a forbidden-token list: vendor and carrier names,
plus the words for Arena's own economics ("cost", "margin", "markup"). Beyond
that a label prints, tidied to sentence case, as long as it contains real words
rather than a bare code. Known names still get curated wording, and anything
suppressed prints as "Other charges". No charge is ever dropped, and the
invoice totals the same either way.

`utils/invoiceChargeNames.test.ts` holds both halves of this: real vendor
charges must survive, vendor identity must not.

**The confirmation email moved into the background job.** It used to be awaited
at the end of `createShipmentAction`. It moved so the customer gets one email
with the invoice attached rather than a confirmation now and the document later.
The cost is real and is stated in the code: the confirmation now depends on
Inngest running. That is mitigated, not eliminated, in three places (see
§6).

---

## 3. Where the code is

```
lib/invoices/tax/
  config.ts        tax rates per mode, issuer identity, number format, terms
  gst.ts           state codes, GSTIN parse and checksum, place of supply, FY
  money.ts         the arithmetic. Pure, heavily tested
  chargeNames.ts   vendor charge label to customer-facing description
  numbering.ts     the gapless counter
  types.ts         the shapes stored in the JSON snapshot columns
  build.ts         shipment to invoice content
  queries.ts       the read side, tenant and Arena scopes
  pdf/
    TaxInvoiceDocument.tsx   the document itself
    logo.ts                  the Arena mark as an embedded data URI
    render.tsx               render to buffer, upload to UploadThing

lib/inngest/
  client.ts                        the app and its event catalogue
  functions/generateShipmentInvoice.ts   the job

actions/invoices/taxInvoices.action.ts   reads and the admin retry
components/invoices/TaxInvoicesTable.tsx      tenant list
components/invoices/TaxInvoiceHealthPanel.tsx admin repair view
utils/invoiceMoney.test.ts               the money engine's tests
utils/invoiceChargeNames.test.ts         what may and may not print on a line

types/booking.types.ts    ServiceOption.charges, the breakdown's route in
types/booking.schema.ts   its zod shape
components/booking/RateOptionPicker.tsx   quoteToServiceOption, where it is set
```

### Notes on the PDF

Run `npx tsx scripts/renderSampleInvoice.tsx` to write `sample-invoice.pdf`
from fixed sample data. Use it whenever the template changes; the layout is
tuned to fit a seven line breakdown on one page and it is easy to push it onto
a second without noticing.

**The logo is embedded, not loaded.** `pdf/logo.ts` holds the mark as a base64
data URI. `public/arena_logo.png` is not readable from a serverless function,
and a remote URL means an invoice can render without its letterhead because a
fetch timed out, which `@react-pdf/renderer` would swallow silently. The
embedded copy is cropped and downscaled from the original; regenerate it the
same way if the brand mark changes.

**Two things in `@react-pdf/renderer` fail silently on a full page.** A `fixed`
wrapper `View` holding the page footer as children renders as nothing, and so
does any `Text` using the `render` callback. Both work in isolation, which is
what makes it worth writing down. The footer is therefore three separately
positioned `fixed` elements with static text. If something you add to the
document does not appear, and there is no error, suspect this first.

---

## 4. The money, in detail

This is the part most likely to be misunderstood later, so it is spelled out.

### The authoritative total

`Shipment.quotedTotal + Shipment.firstMileCharge`. That is exactly what
`createShipment.action.ts` debits from the wallet, and no single column holds
it. The invoice total is never computed any other way.

### The invariants

Asserted in `utils/invoiceMoney.test.ts` over 5,000 generated shipments, and
re-checked by `verifyInvoiceMoney` before anything is persisted:

1. `total` equals the amount debited, exactly
2. the line items' taxable values sum to `taxableValue`, exactly
3. `taxableValue + totalTax === total`, exactly
4. `cgst + sgst + igst === totalTax`, exactly
5. every amount is a whole number of paise

"Exactly" means exactly, not within a paisa. A tax invoice whose lines do not
add up to its total is a document that gets sent back, and the failure is silent
until an accountant adds up the column.

### Why it is awkward

Three facts collide. Prices are tax inclusive, so the taxable value is a
division that rarely lands on a whole paisa. The org markup is applied per
charge line with each line rounded independently (`lib/pricing/markup.ts:90`),
so the stored lines already drift from the stored total before anything starts.
And the total is not negotiable.

So the total is the one true input, everything is derived from it, and the
result is reconciled back to it. Two different techniques, for two different
reasons:

- **Largest remainder** (`splitProportionally`) for sub-paisa rounding spread
  across every line, such as splitting the taxable value.
- **Absorb into the largest line** (`reconcileToTotal`) when the residual can be
  a visible amount, such as after vendor tax lines are removed. Spreading a
  large residual across every line would make each printed component subtly
  wrong; concentrating it in the freight line, which dominates every real
  shipment, keeps the smaller components at their true values.

All arithmetic is in integer paise. Rupee floats accumulate exactly the error
this module exists to prevent.

### IGST or CGST plus SGST

Decided by comparing the issuer's state code to the buyer's place of supply,
resolved in this order of trust: their GSTIN (survived a checksum), an explicit
stored state code, their free-text state resolved if possible, then the issuer's
own state.

That last fallback makes the supply intra-state, splitting the same tax into
CGST and SGST rather than charging IGST. **The total is identical either way**,
so an org that never filled in its address cannot be charged the wrong amount,
only filed under the wrong heads.

---

## 5. The pipeline

```
createShipmentAction
  └── transaction
        ├── ... shipment, packages, wallet debit, status event
        └── stage ShipmentInvoice row (PENDING, no number, no PDF)
              wrapped in try/catch: this can never fail a booking
  └── inngest.send("shipment/booked")
        └── on failure: send the confirmation email directly instead

generateShipmentInvoice (Inngest)
  1. prepare-invoice     find or build the row, allocate the number   [one small tx]
  2. render-pdf          react-pdf to a buffer
  3. upload-pdf          UTApi to UploadThing
  4. mark-ready          write the file columns, flip to READY
  5. send-booking-email  BOOKED milestone email, PDF attached
```

Step 5 runs whether or not steps 2 to 4 succeeded. If the PDF failed every
retry, the customer still gets their confirmation, just without the attachment.
Silence is the one outcome that is not acceptable.

Steps 1 to 4 are skipped entirely when the invoice is already `READY`, so a
duplicate event cannot produce a second document.

### Idempotency

Two independent layers, because at-least-once delivery means the job will run
twice eventually.

1. **Steps memoise.** A retry after the upload succeeded resumes at the next
   step. It does not re-render, re-upload, or take a second serial.
2. **The database enforces it anyway.** `ShipmentInvoice` is unique on
   `(shipmentId, docType)`. Even a completely fresh run against an already
   invoiced shipment finds the row and stops.

Layer 2 is what makes the admin retry button safe to press repeatedly.

### Why the number is allocated in its own tiny transaction

The counter row is locked from the moment the number is taken until that
transaction commits, and every other booking issuing an invoice waits behind
that lock. Rendering a PDF inside that transaction would hold the lock for the
length of a render.

---

## 6. Failure modes, and what happens

| What fails | What happens | Where to look |
| --- | --- | --- |
| Staging the row in the booking tx | Booking commits normally. The job builds the row itself. | Sentry, `step: stageInvoice` |
| `inngest.send` | Confirmation email is sent directly. No invoice until an admin retries. | Sentry, `step: queueInvoiceJob` |
| Issuer config is still placeholders | Job fails immediately, non-retriable. No serial burned. | The job's own error |
| Shipment deleted before the job ran | Non-retriable failure. | `onFailure` writes it to the row |
| Bad source data (no chargeable total) | Non-retriable. Row left with the error attached. | Admin health panel |
| Render or upload | Four retries, then `FAILED` with the error on the row. Confirmation email still goes out. | Admin health panel |
| Everything, including staging | No row at all. Surfaces as a booked shipment with no invoice. | Admin health panel, "missing" list |

The admin health panel on `/arena-dashboard/invoices` is the operational answer
to all of these. It asks the question from both ends: invoices that failed, and
booked shipments with no invoice row at all. Answering only one leaves a blind
spot exactly where the rare failure hides.

---

## 7. Setup

### Before the first invoice on any environment

Fill in the `INVOICE_ISSUER_*` variables in `.env`. The defaults in
`config.ts` are deliberately obvious placeholders, and `issuerIsConfigured()`
makes the job refuse to issue anything while they are in place. That refusal is
the point: a gapless serial spent on a document reading "REPLACE ME" where the
GSTIN belongs leaves a hole no later fix can close.

`INVOICE_ISSUER_STATE_CODE` must match the first two digits of
`INVOICE_ISSUER_GSTIN`. It decides IGST versus CGST/SGST on every invoice.

`INVOICE_ISSUER_JURISDICTION` and `INVOICE_ISSUER_BILLING_EMAIL` are printed at
the foot of every page. The jurisdiction is read as "SUBJECT TO `<value>`
JURISDICTION", so give it the places only.

### Database

```bash
npx prisma db push
npx prisma generate
```

Adds `ShipmentInvoice`, `InvoiceCounter`, and `Org.gstin` / `Org.gstStateCode`.
All additive; nothing existing is modified.

### Local development

```bash
# .env
INNGEST_DEV=1
```

```bash
npm run dev
npx --ignore-scripts=false inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Without `INNGEST_DEV`, the SDK starts in cloud mode and `/api/inngest` returns
500 with "in cloud mode but no signing key".

### Production

Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` from the Inngest dashboard.

---

## 8. Open items

**The international GST rate is unconfirmed.** `INTERNATIONAL_TREATMENT` in
`config.ts` is set to 18% pending confirmation from a CA. It is set that way
because charging tax and being told later it was exempt is recoverable, while
the reverse means reissuing documents and finding the money. To switch to
exempt, set `ratePercent: 0` and put the citation in `note`. The money engine,
the PDF and the stored columns all handle a zero rate; nothing else changes.
Invoices already sent stay sent.

**Credit notes are not built.** `docType` and `relatedInvoiceId` exist on the
model from day one so adding them is additive rather than a migration. Until
then, a cancelled booking's invoice can be marked `CANCELLED`, which is honest
internally but not strictly GST-correct once a document has been issued to a
customer. Build the credit note before the first cancellation that matters.

**No backfill.** The series starts at `ARN/26-27/00001` with the first booking
after deploy. Shipments booked before that have no invoice. Generating a block
of tax invoices dated today for services delivered months ago is exactly the
kind of thing that gets questioned, so it was left out on purpose. The admin
retry button will generate one for any specific older shipment if a customer
asks.

**Issuer details are config, not a settings page.** Read through
`getInvoiceIssuer()`, so moving them into a database-backed settings table later
changes one function body and no call sites.

**Non-INR bookings.** Every booking is INR today and the invoice hardcodes it.
`build.ts` marks the spot; if a non-INR booking ever exists it has to be dealt
with there rather than silently mislabelled.
