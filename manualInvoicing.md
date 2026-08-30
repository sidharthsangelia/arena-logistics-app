# Manual invoicing

How an Arena admin raises a GST tax invoice for work that never went through
the platform.

This document is the reference for the feature: what it does, why each decision
went the way it did, and what to check when something looks wrong. It assumes
you have read `invoicingSystem.md`, which covers the invoices the platform
raises by itself.

---

## 1. What it is

Most of Arena's business is not booked on the platform. A customer calls, a
consignment moves, and at the end of it somebody has to produce a proper GST tax
invoice with freight, fuel surcharge, airport handling, customs clearance and
whatever else the lane demanded.

This is the tool that produces that invoice. An admin opens
`/arena-dashboard/invoices/new`, picks or creates the customer, describes one or
more consignments, adds the charges, and issues. The result is a numbered tax
invoice, rendered to PDF, stored on UploadThing, downloadable, and emailable to
the customer from the same screen.

The target is five minutes for a fresh invoice and under two for a repeat
customer, because an invoicing tool that is slower than a spreadsheet does not
get used.

### The third kind of invoice

There were already two. Now there are three, and they stay separate.

| Thing | Model | Who makes it | What it is |
| --- | --- | --- | --- |
| Booking tax invoice | `ShipmentInvoice` | The platform, automatically | Arena's GST invoice for a shipment booked on the platform. See `invoicingSystem.md`. |
| Manual tax invoice | `ManualInvoice` | An Arena admin, by hand | Arena's GST invoice for work done off the platform. This document. |
| Account bill | `Invoice` | An Arena admin, by hand | A PDF from an outside accounting system, uploaded and attached to an org. Predates both. |
| Commercial invoice | `ShipmentDocument.INVOICE` | The customer | The customer's own invoice for customs. Arena never generates one. |

`Invoice` survives as an escape hatch for anything the generator cannot express
and for historical PDFs. It is no longer the path anybody should reach for
first.

---

## 2. Decisions, and why

**The customer is a `BillingParty`, not an `Org`.** Everything else in the
invoice layer is scoped to an `Org`, because everything else began with somebody
signing up. Off-platform customers have no account and many never will, and
inventing a shell org for each one would fill the tenant tables with rows that
can never log in and would show up in every org count, every admin list and
every export.

So `BillingParty` is a plain address book of people Arena bills: legal name,
GSTIN, PAN, address, state code, contact. It can be linked to an `Org` or a
`Client` when one happens to match, and when it is linked to an org, the issued
invoice also appears in that customer's own `/invoices` tab. When it is not,
nobody logs in to see it and the PDF is the whole delivery.

**The picker searches all three tables, and adopting copies.** Most companies
Arena bills off-platform are already in the database: they signed up (an `Org`)
or a business associate booked for them (a `Client`). So the customer picker
searches billing parties, orgs and clients in one list, and selecting an org or
a client copies its details into a `BillingParty` once and links the two
(`adoptCustomerAction`, idempotent).

A copy rather than a live join, for the same reason everything else here is
snapshotted: an org that corrects its address next month must not silently
change what an invoice already issued to them says. The link is kept so the
invoice reaches their dashboard and so the same company is never on the billing
list twice; it is not a source the document reads through.

A BA's client is deliberately **not** linked to the BA's org. The client is the
party being billed, and putting the invoice in their business associate's
dashboard would be showing somebody else's bill.

**A lane end is a pincode, not a free text box.** `origin` and `destination`
stay free text and are what prints, because a lane end is sometimes a port, a
hub or the customer's own wording, and forcing every one through a lookup would
block an invoice on a lookup that was never going to succeed.

Underneath them are `originPostalCode` / `originCity` / `originState` /
`originCountry` and the same for the destination, filled by
`utils/postalLookup.ts`: the same India Post and Zippopotam path the booking
flow already uses. That structure is the record. A city name alone cannot be
grouped for a lane report, cannot resolve a state, and gets spelled three ways
within a month; a pincode can do all three. Everything derived stays editable,
because "not found" is a common and expected outcome rather than an error.

**The country is asked first, and only when it is a question.** A postal code
is meaningless without a country: "00000" is a valid ZIP somewhere and a typo
everywhere else, and the lookup literally cannot run until it knows whose
postal system to ask. So on an international lane the country comes first and
everything below it is disabled until it is answered. The destination starts
with no country at all rather than defaulting to India, because a default that
is wrong on most international invoices is worse than a blank.

On a domestic invoice the country is not asked at all. Both ends are India by
definition, and offering a picker would only be offering a way to make the
invoice wrong. `applyMode` in `builderState.ts` enforces the same rule when the
invoice type changes underneath a lane that was already filled in: switching to
Domestic pins both ends home and clears what the old country resolved to, since
a Dubai ZIP and city describe nowhere in India.

`hasPostalLookup` in `utils/postalLookup.ts` knows which countries a lookup can
even succeed for. Zippopotam covers about sixty, and several of the places
Arena ships to most, the UAE above all, have no postal system to look up. That
distinction matters to the person typing: "not found" invites them to check a
code, and there is nothing to check.

**A customer is not always a company.** People ship things. Somebody sending
forty kilos of personal effects to their son in Toronto has no GSTIN, no CIN
and no trading name, and still needs an invoice. Nothing in the schema ever
required those, but a form that opens on "Legal name" and "GSTIN" reads as
though it did, and the honest reading of a form is the one people act on.

So `BillingParty.kind` is `BUSINESS` or `INDIVIDUAL`, defaulting to BUSINESS
because that is what every row predating the column is. Choosing Individual
unlocks nothing. It removes questions that were never going to have answers,
and it changes one thing on the document: the GSTIN row is dropped rather than
printed as "Unregistered". A company with no GSTIN is meaningfully unregistered
and the invoice should say so; a person has no GSTIN to be missing, and
reporting the absence of something never expected is noise.

The kind rides in the buyer snapshot as an optional field, so an invoice issued
before the column existed still renders. Nothing is backfilled.

**Place of supply 96 is not a state, and that is why it is not in
`GST_STATES`.** GSTR-1 wants 96 in the place-of-supply column on an export.
Code 97 is "Other Territory", meaning offshore installations inside India's own
jurisdiction, and filing an air export to Dubai under it is the wrong answer to
the question. `OUTSIDE_INDIA` therefore lives beside `GST_STATES` rather than
in it: it is resolvable by code, so an invoice already issued against 96 keeps
printing "Outside India", but it is deliberately absent from
`SELECTABLE_GST_STATES`. That list picks where **Arena** is registered, and
Arena cannot be registered outside India, so offering it there would only be a
way to break every invoice at once. The manual builder adds it to its own
dropdown when the invoice is international, which is the one place it means
anything, and setting a foreign destination country selects it automatically
unless the admin has already decided for themselves.

**Preview renders the real template, from the saved row.** The point of a
preview is to answer "is this what the customer will get", and an HTML
approximation answers a different, easier question. So `previewManualInvoiceAction`
calls `buildManualInvoiceDocument` and the same renderer the issue path calls,
with exactly two differences: the number is `DRAFT_NUMBER_PLACEHOLDER` and
`draft: true` marks the page "PREVIEW ONLY, NOT ISSUED". That mark is not
decoration. A preview is a real PDF somebody can save, and without it a saved
copy is indistinguishable from an invoice that took a serial.

It previews the **saved** row, so the button saves the draft first exactly as
Issue does. Rendering unsaved form state would mean a second path from form to
document, and the whole reason the money engine is one pure module is to not
have two of anything. Nothing is uploaded and no counter is touched, so it is
free to call as often as anyone likes. The browser turns the returned base64
into a Blob URL rather than feeding a `data:` URI to the iframe, because
Chrome's PDF viewer silently refuses the latter in a frame.

**The service list is the evidence, not a catalog.** A service typed into the
picker is offered on every invoice after it. There is no `ServiceType` table and
deliberately will not be one: a service is a line of text on a document, not a
priced row with a SAC and a rate behind it, so there is nothing to administer
and nothing that goes stale. `listServiceTypes` reads the distinct
`serviceType` values back off past consignments, most used first, and the picker
merges them over the curated list in `config.ts`, which is what a fresh install
has before anyone has typed anything. Services typed on the invoice currently
open are merged in too, so a three-leg job spells its service the same way three
times.

The contrast with the charge picker is on purpose. A charge type has a SAC code,
a default GST rate and a reimbursement flag that must be the same every time it
is used, which is what a catalog is for, and why adding one there is an explicit
action against a real table. A service carries none of that.

**The totals bar is sticky, not fixed.** It was `fixed inset-x-0`, which
positions against the viewport, and on the dashboard layout the viewport
includes the sidebar. The bar ran underneath the nav and covered it. Sticky
keeps it inside the page's own column and lets the scroll container decide where
the bottom is; negative margins bleed it to the column edges and cancel the
page's bottom padding so it rests flush at full scroll.

**The consignment disclosure is four sections, not one grid.** Twenty fields in
declaration order read as a wall: the booking date next to the pieces, the
container between the consignee and the MAWB. Nobody fills twenty fields, they
fill the four that apply, and finding those four was the entire cost. Grouped as
the goods, shipper and consignee, carriage and reference numbers, each section
answers one question and is skipped as a unit, in the order a job is described
in. The trigger shows the values rather than a count, because how many boxes
have something in them is not a thing anyone wanted to know, and the section
opens by itself when it already has content so a loaded draft never hides half
of what was typed.

Two shortcuts sit in the label rows rather than the grid, so adding one does not
knock every field after it out of column: chargeable weight offers **Same as
gross**, and shipper and consignee each offer **Same as customer**. Booking date
is a date input, which it should always have been. It stores `yyyy-mm-dd` and a
loaded draft was showing that string in a plain text box, which is how a date
gets retyped as `08/08` and lost.

**A party remembers its defaults.** `BillingParty.defaults` is a JSON blob
holding the currency, tax mode, payment terms, place of supply and the charge
types last used for that customer. Picking a party fills roughly half the form.
This is the single largest contributor to the five-minute target and it costs
one column.

It is JSON rather than columns because the set of things worth remembering will
change as the tool is used, and every one of them is a convenience default that
the form can override. Nothing in it is authoritative and nothing is printed
straight from it: a default seeds a field, the field is what gets snapshotted.

**Its own number series, `ARM/26-27/00001`.** GST wants each series internally
consecutive; it does not want one series for the whole business. A separate
series keeps manual and automatic invoices independently auditable, and means a
draft abandoned at 6pm cannot leave a hole in the series that live bookings are
writing into. `InvoiceCounter` is already keyed on `(series, financialYear)`, so
this needed no schema change at all, only a series key it had not seen before.

`numbering.ts` grew a `allocateSeriesNumber` underneath the existing
`allocateInvoiceNumber`, which now calls it. The gapless counter, the
transaction rules and the reasoning behind not using a Postgres sequence are
unchanged and still documented there.

**The number is allocated on issue, never on save.** A draft has no number, no
PDF and no snapshot. That is the whole meaning of "draft". Allocating a serial
to something an admin might abandon is how invoice books get holes in them.

**Tax is added on top, or taken out, on one toggle.** The booking invoices
back-compute tax out of an authoritative wallet debit because the customer had
already paid before the invoice existed. Nothing like that is true here: the
admin is typing amounts from a rate sheet, and whether those amounts already
include GST depends on how the deal was quoted.

So there is one switch on the invoice: `EXCLUSIVE` adds GST to what was typed
and the total grows, `INCLUSIVE` treats what was typed as the gross and splits
the tax out of it. Same engine, one branch, and the invariants below hold in
both directions.

**Charges belong to a consignment.** An invoice holds consignments and each
consignment holds its own charge lines. The taxed service table printed on the
document is a roll-up: charges are grouped across all consignments by charge
type and rate, so a three-consignment invoice prints one FUEL SURCHARGE line
carrying the total, not three.

The alternative was a flat charge list with the consignments as decoration. It
would have been a smaller form and it would have made "what did that one AWB
cost" unanswerable, which is most of why anyone would look at an old invoice.

**Reimbursements sit outside the tax.** Destination duty, origin country taxes
and airline DO charges are usually money Arena pays out and recovers, not
revenue. Under GST that is a pure-agent recovery: it belongs on the invoice, and
it does not belong in the taxable value or in the turnover Arena declares.

So a charge line carries a `reimbursement` flag. Flagged lines are excluded from
the taxable value, carry no GST, and print in their own subtotal beneath the tax
lines, labelled as reimbursements. They still count toward the grand total,
because the customer does still owe them.

Getting this wrong in the other direction is expensive and quiet: charge GST on
recovered duty for a year and the correction is a year of credit notes.

**Every line carries its own rate.** Defaulted from the charge catalog, editable
per line. A single invoice-wide rate could not express a bill that mixes 18%
service charges with a zero-rated item, and every real freight invoice mixes
them eventually.

**The charge catalog is a table, not a constant.** Sixty-odd charge types seeded
from the format Arena works to, each with a default SAC code and a default GST
rate, each marked for where it applies (domestic, international, air, sea, or
everywhere). An admin can add one without a deploy, because vendors invent
surcharges faster than anyone ships code.

Applicability filters the picker rather than restricting it. A charge marked
international still appears on a domestic invoice if you search for it by name;
it just is not offered first. A catalog that refuses to let you bill something
is a catalog people work around.

**Issued is frozen; corrections are credit notes.** A draft is editable in every
respect. The moment it is issued it takes a number, freezes a full snapshot of
seller, buyer, consignments and lines, renders a PDF, and becomes immutable.
A mistake is corrected by a credit note against it, which is why `docType` and
`relatedInvoiceId` exist on the model.

This is the same rule `ShipmentInvoice` follows and for the same reason: the
customer is holding a copy. A document that can be edited after it has been sent
is a document that can silently disagree with the one in their file.

**Everything printed is snapshotted.** Same principle as the booking invoices.
The renderer reads only the frozen JSON, never a live join, so correcting a
party's GSTIN next month does not rewrite the invoice they already have.

**Rendering is synchronous.** The booking invoices render in an Inngest job
because they are a side effect of a booking that must not be slowed down or
failed by a PDF. Here the admin is standing in front of the screen having just
pressed Issue, and the honest thing is to make them wait the second it takes and
show them the result. A failed render rolls the whole issue back, including the
serial, and the admin presses the button again.

---

## 3. Where the code is

```
lib/invoices/manual/
  config.ts      statuses, tax modes, payment terms, series prefixes, zod, DTOs
  catalog.ts     the seeded charge types and their defaults
  money.ts       the arithmetic. Pure, tested
  types.ts       the shapes stored in the JSON snapshot columns, and their version
  build.ts       draft rows to frozen document content
  queries.ts     the read side
  pdf/
    ManualInvoiceDocument.tsx   the document itself

lib/invoices/tax/gst.ts         state codes, GSTIN parsing, OUTSIDE_INDIA (96)
lib/invoices/tax/numbering.ts   allocateSeriesNumber, shared with booking invoices
utils/postalLookup.ts           India Post and Zippopotam, plus hasPostalLookup
actions/invoices/manualInvoices.action.ts   every read and write, admin-gated
components/invoices/manual/     the builder form and the list
  ManualInvoiceBuilder.tsx      the form, the sticky totals, the disclosures
  RouteEndPicker.tsx            one end of a lane: country, then postal code
  ServicePicker.tsx             what has been used before, plus free text
  InvoicePreviewDialog.tsx      the rendered PDF, before it exists
app/(arena)/arena-dashboard/invoices/new/   the builder
scripts/seedChargeTypes.ts      seeds the catalog
scripts/renderSampleManualInvoice.tsx   sample PDFs: export, domestic, individual
utils/manualInvoiceMoney.test.ts   the money engine's invariants
```

---

## 4. The money

All arithmetic is in integer minor units of the invoice currency. Rupee floats
accumulate exactly the error this module exists to prevent.

### The invariants

Asserted in `utils/manualInvoiceMoney.test.ts` and re-checked by
`verifyManualInvoiceMoney` before anything is persisted:

1. `sum(line.taxableValue) === taxableValue`, exactly
2. `cgst + sgst + igst === totalTax`, exactly
3. `taxableValue + totalTax + reimbursements === total`, exactly
4. every amount is a whole number of minor units
5. no reimbursement line contributes to `taxableValue` or to any tax head

### Exclusive and inclusive

`EXCLUSIVE` is the simple direction: the typed amount is the taxable value, tax
is computed from it per line and added.

`INCLUSIVE` back-computes: the typed amount is the gross, so
`taxable = round(gross * 100 / (100 + rate))` and the tax is the remainder. The
remainder rather than a second rounding, so a line always reconciles to the
figure the admin typed. That is the property that matters: an admin who types
5,000 must see 5,000 on the line, not 4,999.99.

Reimbursement lines are untouched by the mode. They have no tax in either
direction, so there is nothing to add or remove.

### IGST or CGST plus SGST

Same rule and the same helper as the booking invoices: compare the issuer's
state code to the invoice's place of supply. Resolved in order of trust from the
party's GSTIN, then their stored state code, then their free-text state, then
the issuer's own state. The total is identical either way, so a party with a
missing address is filed under the wrong heads but never charged the wrong
amount.

---

## 5. The lifecycle

```
Draft            no number, no PDF, freely editable, deletable
  └── Issue      one transaction:
        1. validate and rebuild the money from the stored rows
        2. allocate the serial from the ARM counter
        3. freeze seller, buyer, consignment and line snapshots
        4. render the PDF and upload it
        5. flip to ISSUED
      any failure rolls all five back, including the serial

Issued           immutable. Mark paid, download, email, or credit-note it
  ├── Paid       who and when, recorded
  ├── Overdue    derived, never stored: ISSUED and dueDate in the past
  └── Cancelled  the number and PDF survive for the record
```

Nothing is hard-deleted after issue. Drafts are.

---

## 6. Setup

The issuer block is the same one the booking invoices use: the
`INVOICE_ISSUER_*` variables read through `getInvoiceIssuer()`. There is one
Arena, one GSTIN, one letterhead, and a second copy of those details would
eventually disagree with the first.

`issuerIsConfigured()` gates issuing here too. An admin pressing Issue while the
issuer block still says REPLACE ME gets an error naming the problem rather than
a numbered document with no GSTIN on it.

`INVOICE_ISSUER_CIN` is optional and prints beside the GSTIN and PAN.
`INVOICE_ISSUER_BILLING_EMAIL` takes several addresses, comma separated, and
prints all of them at the foot of the page.

### The state code, which is currently wrong

`issuerStateMatchesGstin()` was added alongside this feature because the check
found a live misconfiguration:

```
INVOICE_ISSUER_GSTIN      = 06AALCA3833B1Z2   (06 is Haryana)
INVOICE_ISSUER_STATE_CODE = 07                (Delhi)
INVOICE_ISSUER_STATE_NAME = HARYANA
```

`INVOICE_ISSUER_STATE_CODE` alone decides IGST against CGST plus SGST, so with
it set to 07 every Delhi customer is billed intra-state and every Haryana
customer inter-state, which is the reverse of the truth in both directions.

**This is not specific to manual invoicing.** The booking invoices in
`invoicingSystem.md` read the same variable and have been filing the same way
since they were deployed. Totals are unaffected, so nothing has been over or
undercharged; the tax is stated under the wrong heads, which surfaces at GSTR-1
time rather than at issue time.

The new-invoice page warns about it and does not block, because the value is a
configuration decision somebody may have made deliberately. If Arena is
registered in Haryana, set `INVOICE_ISSUER_STATE_CODE=06`. Invoices already
issued keep the split they were issued with; they are snapshots, and rewriting
them would be the opposite of what a snapshot is for.

### Database

```bash
npx prisma db push
npx prisma generate
npx tsx scripts/seedChargeTypes.ts
```

All additive.

### Forwarder and product

The consignment header row asks for **forwarder** and **product type**, not a
service description. "DHL, Express Worldwide" is the pair a customer
recognises; "Air freight" is not. Both are comboboxes that suggest and never
refuse: `FORWARDERS` and `FORWARDER_PRODUCTS` in `config.ts` are seeds for a
fresh install, and `listForwarders()` / `listForwarderProducts()` read back
everything already typed, so typing a product once puts it in the list forever
with no catalog to maintain.

Products are **grouped by forwarder**, on both sides of that round trip, through
`forwarderKey()`. Use it rather than calling `.toLowerCase()` again: if the
history and the picker ever disagree on the key, products typed against "UPS "
stop coming back for "UPS" and the feature quietly does nothing.

`serviceType` did not go away. It moved into the collapsed shipment details,
because a customs-clearance or warehousing invoice has no forwarder and no
product, and that field is then the only thing on the document saying what the
work was.

Naming DHL and FedEx here does not breach `carrierBranding.md`. That rule covers
rates sourced THROUGH the platform, where the vendor is an implementation detail
the customer never chose. A manual invoice records an off-platform move, and who
carried it is a thing the customer asked for.

### The consignment fact block

The facts under each waybill are **one packed run of label-and-value pairs**, not
a grid. Each pair takes exactly the width its own text needs and the next one
starts immediately after it, so the pairs a consignment actually has fill the
line and the ones it lacks cost nothing at all.

They were quarter-width cells four to a row, and that grid was replaced because
the alignment it bought was paid for in blank paper: a consignment with a
forwarder and no product left a quarter of a row empty, a cell holding "310 kg"
reserved about 130 points to print 34 of them, and on a document held to one
sheet that is the most expensive whitespace on the page. The busiest sample lost
roughly a third of the block's height.

**The label sits BESIDE the value, and that is what makes packing legible.** The
fixed grid existed because the label sat OVER the value: stacked pairs at content
width put their labels at a different x on every line, and the eye reads a ragged
column of labels as noise however correct each pair is. Set the label beside the
value and each pair reads as one short phrase rather than as an entry in a
column, so nothing has to line up. Do not reintroduce a stacked pair into this
run; it brings the alignment problem back with it.

**`pairs` and `Pair` live in the shared theme.** `Pair` returns null for an
absent value, so the template lists every fact a consignment could carry in
reading order and the ones it has pack left. `pair.paddingRight` is the entire
separation between one fact and the next: it is 11 against the 3 inside a pair,
and much below 11 the pairs stop reading as separate facts.

**The run's negative right margin is load-bearing.** `pairs` carries
`marginRight: -11`, exactly cancelling `pair.paddingRight`. Each pair holds its
separation as padding on its right, which is correct between two facts and pure
loss after the last one on a line, and yoga counts that padding when deciding
whether the next pair fits. Eleven points of nothing were being weighed against a
fact that wanted to ride up. Pulling the container eleven points wider puts the
trailing padding outside the content box, where it can be spent; nothing draws in
padding, so nothing overhangs. This is what got PICKED UP off a line of its own
on a real single-consignment invoice. **Keep the two numbers in step.** They are
one decision written twice, and drifting them either overhangs the box or
silently costs a line.

**Consignment dates print as `23/08/26`, and only consignment dates.** `shortDate`
sits beside `formatDate` in the template for this. "23 Aug 2026" is 58 points and
"23/08/26" is 34, and in a run that packs by content width those 24 points are
frequently a whole line. The invoice date, the due date and the IRN ack date keep
the spelled-out month: they sit in a panel that is not short of room, they are the
dates a tax document is read and disputed on, and a written month cannot be
misread as the American order. Abbreviate where space is the constraint, not
everywhere the same type appears.

**The indent under a consignment heading is conditional, not a constant.** See
`factIndent`. It exists to clear the serial-number column, so it is worth 14
points on a multi-consignment invoice and worth nothing on one with a single
consignment, where the heading starts at the box edge and an indent would push
the facts right of the thing they belong to at a cost of 14 points a line.

**The order is what a reader arrives wanting**: the weights, then the packing,
then who carried it and by what route, then the parties, then the dates.

**The two weights are the only pairs set bold.** Freight is billed on the
chargeable weight while the customer knows only what the consignment weighed on a
scale, which makes that pair the most queried thing on the document, and in a
flowing run there is no band to give it prominence. `strong` is how it keeps it,
and it only works while it stays rare. A run in which everything is bold has
nothing emphasised.

**Only the chargeable label abbreviates.** It is the longer word and the one the
trade already says short. "GROSS WT." is the figure a customer checks against
their own weighbridge and is worth spelling out. The asymmetry is deliberate; do
not tidy it into a matching pair.

**Forwarder and product are separate pairs**, both labelled, rather than the
product sitting as a quiet sub-line under FORWARDER. "UPS Saver" is the half the
customer bought and the half they quote back; under the carrier's own label it
read as a footnote to the carrier instead of an answer of its own. Flight and
airline are separate for a stricter reason: run together, a consignment carrying
an airline and no flight number printed the airline under the word FLIGHT.

**HSN is a typed field on this document.** A manual invoice records an
off-platform move and holds no item list, so there is nothing here with a
quantity to derive a code from: `hsnCode` is a column on
`ManualInvoiceConsignment` that an admin fills in beside the goods description.
The booking invoice states the same figure and derives it, taking the HS code of
the box-contents item with the largest quantity. See `dominantHsCode` in
`TaxInvoiceDocument.tsx` and its tests in `utils/invoiceHsn.test.tsx`.

It codes the **cargo**, and the SAC in the charges table codes the **supply**.
Two codes, two questions, and neither is a fallback for the other: what Arena
bills for is a freight service whatever moved inside the box. An invoice printing
one number for both has answered the wrong question twice.

**Sub-lines are gone.** `FactCell` carried any number of quieter 7.5pt lines
beneath a value, and flight, container and agent hung under ROUTING that way.
They are ordinary pairs now. A sub-line was a whole line of page spent on one
short value, and it read as a footnote to a fact rather than as a fact.

**What moved and how it travelled ride on the lane, not in the run.** The heading
line reads `New Delhi to Dubai (12 pcs, Air, Non-documents)`. All three qualify
the route rather than standing on their own. The two text fields print exactly as
stored, never abbreviated: both take free text, so a short-form table would
compress the six values in the picker and leave everything else in full, and the
same invoice would print "Non Doc" against one consignment and "Refrigerated
pharma samples" against the next.

**Hyphenation cannot currently be turned off.** `Font.registerHyphenationCallback`
registers onto the exported `Font` (which IS react-pdf's font store) and the
layout package reads `fontStore.getHyphenationCallback()`, and yet the callback
is never invoked on this render path in @react-pdf/renderer 4.5.1. Verified by
registering one that uppercases every word and getting an unchanged document.
Do not re-add the registration thinking it was merely missing.

### Where the waybill prints

The AWB is a **per-consignment** fact stated in a **document-level** panel, and
those two facts fight. The rule: with exactly one consignment it is lifted into
INVOICE DETAILS beside the invoice number, because those are the two numbers
every query about a single-consignment invoice opens with, and the consignment
block below is then headed by its route instead. With several consignments the
panel stays silent and each waybill heads its own block, because a header naming
the first would be read as naming all of them, and the waybill is the only thing
telling two otherwise identical blocks apart. Same rule `shipperInvoiceNo`
already follows, for the same reason.

Consequence worth knowing: **the number of consignments changes the shape of the
header.** A test or a screenshot taken off a one-consignment invoice will not
show you the multi-consignment header, and vice versa.

`trackingNumber` is suppressed in the references cell when it is character-for-
character the `awbNumber`, which is the ordinary courier case. Printed both ways
it reads as two numbers and somebody checks whether they differ.

### What the header no longer says

`SAC / service` and `Pricing` were **removed from INVOICE DETAILS**. Every charge
carries its own SAC in the table below, which is where Rule 46 wants it and where
a mixed-code invoice has to be read from anyway, so a document-level restatement
was a second code on the page claiming to be the answer. Pricing went for a
different reason: inclusive against exclusive describes how the amounts were
TYPED, not what is owed. Both ways reach the same taxable value, the same tax and
the same total, and all three are printed. The reader was being told how the
sausage was made.

`data.sacCode` and `data.serviceDescription` are still computed in `build.ts` and
still on `ManualInvoiceDocumentData`. Nothing prints them today. They are kept
because `sharedSacCode()` encodes a real rule (ignore reimbursement lines, return
a value only when the taxed lines agree) that is annoying to rediscover.

### Three things the document deliberately no longer prints

Removed on request in 2026-08. All three were removed because they were saying
something the page already said, or saying it in a place that cost a whole line.

**The bill-to state row.** The recipient's state name is already in the address
block two lines above it, and the two-digit code that decides IGST against the
CGST/SGST split is printed as the place of supply in the panel alongside, which
is the statement the return is actually filed against. Three sayings of one fact
on one sheet. The same row came off the booking invoice in the same pass.
`buyer.stateName` and `buyer.stateCode` are still on the document data and still
feed the address line and the tax decision.

**The footer identification line.** The manual invoice's footer carried
`ARN082600049    Meridian Textiles Private Limited` on every sheet. Know what
that was for before you agree it was clutter: this is the document that can run
to two pages, and the line is what let a page two coming loose be put back
against the right invoice. It is gone, so a loose sheet now identifies itself
only by what happens to be printed on it. Restoring it is one fixed `Text` above
the foot rule, plus about nine points back onto the three foot offsets and the
page's `paddingBottom`. The booking invoice keeps its own footer line, which
carries the invoice, shipment and waybill numbers and is a different thing.

**The reverse-charge statement.** See invoicingSystem.md. It came off both
templates together, and it is the one of the three removals with a statutory
edge to it, since Rule 46(o) asks for it and Arena's answer is "no" on every
invoice it raises.

### Category is now "Ship. type", and ship mode is now "Transport"

CSB-4/CSB-5/Commercial is labelled **Ship. type** in the builder, on the invoice
and on the read-only detail page, which is the wording Arena's own paperwork
uses. The Air/Sea/Surface/Rail field was renamed **Transport** in the same pass.
Only the LABELS moved: the column is still `shipMode`, the constant is still
`SHIP_MODES`, and `csbCategory` still stores `CSB_4`/`CSB_5`/`COMMERCIAL`.

Do not rename the Air/Sea field back to "Ship mode". Two labels a letter apart on
one consignment is a field nobody fills correctly twice.

**REFS and GOODS are full-width lines under the run**, not pairs. Both hold a run
of text rather than a field, and a run of text in a quarter column wraps to four
lines and costs more height than the whole rest of the block. References were a
cell with the first number as its value and the rest stacked beneath, which on a
consignment carrying all four set the height of an entire row; across the full
width they are one line. Each keeps its prefix (`Tracking`, `MAWB`, `Job`,
`Shipper inv.`), because a run of bare numbers is unreadable and these are exactly
the values somebody is matching against other paperwork.

**How many pages this actually takes.** Every one-consignment invoice fits an A4
sheet with visible slack, which is the case that matters: it is nearly all of
them. A three-consignment invoice does not. Packing the fact block bought enough
that the arena variant now carries the whole consignment section and the entire
charges table, recoveries included, on page one. But page one is then genuinely
full, and what follows is roughly 190pt of declaration, bank panel, terms, totals
and the amount due. No arrangement of those fits in nothing. Do not go looking
for the missing space; it is not hiding, the document is simply longer than a
page.

`goodsDescription` and `particulars` were **merged into one field**, printed as a
full-width GOODS line under the grid. `particulars` still exists on the model and
is still rendered, joined onto the description, so an invoice ISSUED under the
old two-field shape prints everything it was issued with. Nothing writes to it
any more, and opening an old draft folds its text into the description.

`ManualInvoiceConsignment` gained five nullable columns in 2026-08:
`trackingNumber`, `pickupDate`, `productType`, `parcelType` and `shipMode`. All
five are optional everywhere, all five are guarded in the template, and nothing
is backfilled. Two of them are easy to confuse with fields that already
existed, so they carry their distinction in the schema comments and it is worth
repeating here:

- `trackingNumber` is NOT `awbNumber`. A courier consignment usually has both:
  the waybill it flew under, and a separate number the customer was given to
  track on. Printing one where the other was expected sends a customer to a
  tracking page that resolves nothing.
- `shipMode` is NOT the invoice's `mode`. That column says domestic or
  international; this one says air, sea, surface or rail. A domestic
  consignment can fly and an international one can sail, and one field cannot
  say both.

`exportInvoiceNo` was not renamed, but it now prints as "Shipper invoice no."
and is lifted into the invoice header when every consignment on the document
agrees on one value. When they differ the header stays empty, because one of
five in the header would be read as covering all five. The seed is idempotent and safe to re-run; it upserts on the
charge code and never overwrites a rate an admin has corrected.

---

## 7. Open items

**Foreign-currency invoices state GST in the invoice currency.** GST law wants
the tax stated in INR at the notified rate on the invoice date. The currency is
stored per invoice and the arithmetic is currency-agnostic, so the seam is
there, but there is no FX rate field and no conversion. Deliberate: it was cut
to keep the form simple. If a foreign-currency invoice ever needs to be filed
rather than merely sent, this is the thing to build.

**The credit note shares the invoice template.** It prints with a CREDIT NOTE
title and its own `ARMCN` series against the invoice it reverses. It is not a
separately designed document.

**CSB-4 and CSB-5 are a label.** Stored on the invoice for filtering, printed as
a line in the shipment block, and changing nothing about the money. If the
paperwork turns out to need shipping bill numbers, IEC or AD code on the face of
the invoice, those fields exist on `Org` and `Client` already and the resolver in
`lib/booking/exportProfile.ts` knows how to pick between them.

**IRN is pasted, not fetched.** Optional IRN, acknowledgement number and date,
and the signed QR string. An admin generates the IRN on the government portal
and pastes it back, and the PDF prints the QR when one is present. No IRP
integration and no dependency on one.
