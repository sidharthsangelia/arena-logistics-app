# SpeedoPost booking

How Arena places a SpeedoPost order, why the adapter is shaped the way it is,
and what is still unverified about their API.

> **Status as of 2026-09-05: SpeedoPost quotes, books and tracks.** The booking
> adapter is built and registered
> (`lib/booking-adapters/vendors/speedopost/`), and SpeedoPost is on
> `DOMESTIC_BOOKABLE_VENDOR_IDS`, so a customer can select and pay for a
> SpeedoPost service and the order is placed automatically. It is deliberately
> NOT on `FIRST_MILE_VENDOR_IDS`: see §7.
>
> It was switched off entirely on 2026-08-18 (quote-but-cannot-book), re-enabled
> for quoting on 2026-09-05, and given the booking adapter the same day. Its B2C
> rate card is still dead at their end, so only B2B is priced. The evidence is
> on `SPEEDOPOST_SEGMENTS` in `lib/speedopost/rateShape.ts`.

This document is now BOTH the reading of their booking API that the
implementation was built from and the record of what is still unverified. The
adapter is written against the readings below; §3 is the list of things that
could still bite, and §6 is what to ask SpeedoPost. Sections 1 and 2 describe
the position before the adapter existed and are kept because the reasoning has
not changed.

**Before the first live booking, verify three things** (§3.3, §3.5, §3.1):
the CreateOrder success shape, what PrintLabel actually returns, and the
clientCode for our account. The adapter logs the full CreateOrder response on
every order precisely so the first one answers the first of those.

---

## 1. Where this sits today

| Layer | SpeedoPost | Status |
| --- | --- | --- |
| Rates | `lib/rate-adapters/vendors/speedopost/` | Live in the domestic calculator. B2B only; the B2C card is dead at their end. |
| Tracking | `lib/tracking-adapters/vendors/speedopost/` | Live. In the `/track` vendor fan-out. |
| Booking | `lib/booking-adapters/vendors/speedopost/` | Live for domestic door → door. Not on the export first-mile leg (§7). |

### The gap this closed, kept because it explains the design

With no `speedopost` entry in
`lib/booking-adapters/vendors/domestic.booking.index.ts`, a customer who selects
a SpeedoPost service in the booking wizard would:

1. Pay. The wallet is debited at booking exactly as on any domestic shipment.
2. Trigger `bookDomesticCourier`, which stops at
   `prepareBooking` with a `NonRetriableError`: *"No booking integration exists
   for vendor speedopost. This booking has to be placed by hand."*
3. Land as `domesticCourierStatus: FAILED` with that message in
   `domesticCourierError`.
4. Hold the money (decision D5 in `domesticCourierBooking.md`) and write a
   CRITICAL `COURIER_BOOKING_FAILED` notification to the Arena inbox.

That was the position until 2026-09-05. Registering a booking adapter under the
same `vendorId` was the whole fix, and no other layer changed when it landed.
The sequence above is still exactly what happens when the adapter reports itself
unconfigured (no `SPEEDOPOST_CLIENT_CODE`) or refuses a booking it cannot place
safely, so it is worth keeping in mind rather than treating as history.

---

## 2. Their booking sequence, against ours

`domesticCourierBooking.md` §4 describes the eight steps the durable job runs on
Shipmozo. SpeedoPost maps onto it like this:

| Our step | SpeedoPost endpoint | Notes |
| --- | --- | --- |
| resolve-courier | none needed | The provider code is already on the quote as `courierId`. |
| register-pickup-point | `POST /CreateWarehouse` | Returns `warehouseId`, but orders reference the warehouse by NAME. See §3.2. |
| create-order | `POST /CreateOrder` | Takes the provider code as INPUT. There is no separate assign step. |
| assign-courier | none | Folded into create-order. The AWB should come back there. |
| schedule-pickup | `POST /CreatePickupRequest` | Separate call, per provider, per warehouse. |
| fetch-label | `GET /PrintLabel?awb=` | Format unknown. See §3.5. |
| cancel | `GET /CancelOrder?awb=` | A GET that mutates. |

Two structural differences from Shipmozo are worth naming up front.

**There is no assign step.** Shipmozo pushes an order and then assigns a
courier to it, which is what lets our job persist an order id before it has an
AWB. SpeedoPost takes `serviceProviderCode` on the way in, so order creation and
courier selection are one atomic call. That is better for decision D2 (the exact
courier the customer paid for, or nothing), and it means one fewer step that can
fail alone.

**Omitting the provider code is not a validation error.** Their documentation is
explicit: *"If provided, system assigns this exact service provider; otherwise a
random one is assigned."* So a bug that drops the field ships the parcel on a
courier nobody chose, at a price nobody quoted, and the API reports success.
Whatever the adapter looks like, `serviceProviderCode` must be a required field
in its own types, never an optional one that defaults to omitted.

---

## 3. The caveats, worst first

### 3.1 The idempotency model cannot be fully implemented

`domesticCourierBooking.md` §4 relies on three layers, because at-least-once
delivery means the job runs twice. The third layer is: *"On a retry only, the
adapter is asked whether the vendor already holds an order under our
reference."* That covers the one case the other two cannot, namely the push
landing and the response being lost.

SpeedoPost publishes no endpoint that answers "do you hold an order under
clientOrderId X". There is no order lookup, no order list, and no documented
dedupe on `clientOrderId`. The Shipmozo integration already learned that a
vendor does not necessarily dedupe on our reference (see the note in
`lib/booking-adapters/`), and here we cannot even ask.

The consequence is concrete: a lost response on `CreateOrder` means a second
parcel, and there is no way to detect it before it moves. Options, none free:

- Ask SpeedoPost whether `clientOrderId` is enforced unique. If it is, the
  duplicate is refused and the problem disappears.
- Use `TrackingDetails` as a probe. It takes an AWB, not a client reference, so
  this only works if we pre-allocate the AWB via `serviceProviderAwbNumber`,
  which brings its own series-management problem.
- Accept the risk and make `create-order` a step with retries disabled, so a
  timeout fails the booking rather than replaying it. This trades a rare double
  parcel for a more common failed booking that ops re-drive by hand.

**Resolved by taking option three.** The adapter treats a create whose outcome it
could not read (a timeout, a reset, a 502, an unparseable body) as PERMANENT, so
it is never replayed. Only a complete `status: FAIL` envelope, which is
SpeedoPost saying they considered the request and created nothing, counts as a
clean failure. `findExistingOrder` returns null because there is nothing to ask.
The error message says which of the two happened, because the person reading it
is deciding whether pressing retry is safe.

One window stays open and is accepted rather than closed: if the vendor call
succeeds and the job's own database write of the order id then fails, the step
retries with nothing on file and creates a second order. It is one local write
wide. Shipmozo covers that case with `findExistingOrder`; here there is nothing
to ask.

**Still worth settling with SpeedoPost.** If `clientOrderId` is enforced unique,
the refusal above can be relaxed back to an ordinary retry and both the window
and the extra ops work disappear.

### 3.2 Warehouses are keyed by name, and there is no way to list them

`CreateWarehouse` returns a `warehouseId`, but `CreateOrder` and
`CreatePickupRequest` both take `warehouseName`. So the name is the real key,
and there is no documented endpoint to list or fetch warehouses.

That leaves two unknowns:

- What happens when the same `warehouseName` is created twice. Refused,
  duplicated, or silently updated: all three are plausible and they need
  different code.
- Whether names are global to our account or scoped somehow. If global, every
  Arena tenant's pickup addresses share one namespace, and a bare
  `"Head Office"` from two orgs is a collision that ships one customer's parcel
  from another customer's address.

A deterministic, collision-proof naming scheme is required regardless. Something
derived from the org id and the address, not from anything a customer types.

**Resolved: the name IS the shipment number** (`speedoPostWarehouseName`, one
warehouse per booking). Shipment numbers are a single global ARN series, so the
name cannot collide across tenants no matter how the namespace is scoped, and it
is deterministic, so a retry after a lost response addresses the warehouse that
already exists rather than registering a second. It also makes a warehouse in
their panel readable back to a booking without opening either.

The adapter also treats an "already exists" refusal as success, because in that
case the address is already registered under the name we just sent. That branch
is a guess about their wording until question 4 is answered, and it is matched
narrowly so it cannot swallow a general validation failure.

### 3.3 The CreateOrder response shape is undocumented

Their doc says only that *"the response will provide the status and order
details"*. There is no example, so there is no confirmed field name for the AWB,
the order id, or the assigned provider.

`SpeedoPostCreateOrderData` in `lib/speedopost/types.ts` names the likely fields
optionally rather than inventing required ones.

**Handled, not resolved.** The adapter reads the first usable value from an
ordered list of candidate field names (`AWB_FIELDS`), logs the FULL response body
on every order so the shape can be confirmed from the first live one, and fails
LOUDLY and permanently when it can find no waybill: the message says the order
probably exists, says not to re-drive it, and prints what came back. That is
exactly the state decision D4 exists to prevent, so it is surfaced rather than
papered over.

`serviceProviderAwbNumber` is last in that list on purpose. It is the downstream
courier's waybill, which `TrackingDetails` will not accept as input, so taking it
leaves us holding a number we cannot track. Better than nothing, worse than
everything above it. **Confirm the real field name and reorder this list.**

### 3.4 Date formats differ between two endpoints in the same flow

- `CreateOrder.pickupDate` is `DD-MM-YYYY` (`"31-01-2025"`).
- `CreatePickupRequest.pickupDate` is `YYYY-MM-DD` (`"2025-12-07"`).
- `BookAppointment.date` is `YYYY-MM-DD`.

Two calls in the same booking, two formats. Formatting has to be per endpoint,
never a shared helper applied globally.

`CreatePickupRequest` also validates against the past, and the captured example
in their own documentation is that failure: *"Pickup date and time cannot be in
past"*. Their clock is presumably IST. Ours is UTC. A pickup scheduled for
"today at 17:00" computed in UTC is refused for most of the Indian working day.

**Resolved.** `formatOrderDate` and `speedoPostPickupSlot` are deliberately
separate functions with a comment on each saying not to merge them, and the slot
is computed against IST wall-clock time: a booking before 15:00 IST asks for a
collection at 17:00 the same day, anything later for 11:00 the next morning. The
order's `pickupDate` is derived from that same slot rather than from the booking
date, so a retry days later does not send a date already in the past. A test
sweeps a full day at ten-minute steps to pin that the slot is never behind the
IST day it was computed on.

Which timezone their validation actually uses is still question 10.

### 3.5 The label format is unknown

`PrintLabel` is documented with a failure example only. It could return a URL, a
base64 payload, or binary content. `lib/booking/labelStorage.ts` copies a label
into our own storage because Shipmozo's is a presigned URL that expires in an
hour; whether that applies here is unknown until a real label is fetched.

**Handled, not resolved.** The client reads this endpoint RAW rather than through
the JSON path, and the adapter handles all three: a PDF body, an envelope
carrying a URL (which it then downloads), and one carrying base64. Anything else
fails permanently with the first 300 characters of what actually arrived, so the
next person reads the answer instead of guessing again. The label is copied into
our own storage either way, so an expiring URL costs nothing.

**This is the most likely thing to fail on the first live booking.** A label
failure does not lose the order, because the AWB is already recorded and the
shipment is BOOKED, but the run ends FAILED and the customer gets no label until
ops print one from the panel.

### 3.6 Smaller ones, each real

- **`clientCode` is required and unexplained.** `"API"` in their example. We do
  not know where ours comes from or whether it varies. Now read from
  `SPEEDOPOST_CLIENT_CODE`; while it is blank the adapter reports itself
  unconfigured and refuses to book rather than guessing. **This is the one thing
  that must be answered before any SpeedoPost booking can succeed at all.**
- **Dimension units are never stated anywhere.** Not in the rate call, not in
  the order call. Both adapters send centimetres because that is what every other
  domestic vendor takes, but this is an assumption and should be confirmed. The
  rate and the booking at least agree, so a wrong unit misprices consistently
  rather than booking a different box from the one quoted.
- **`ewaybill` is mandatory above Rs 50,000 of goods value.** Collected. The
  domestic wizard already required the e-way bill DOCUMENT above that value; as
  of 2026-09-05 it also asks for the 12-digit NUMBER, which is what the courier
  actually takes as a field on the order. It is validated in the step schema and
  again in `createShipmentAction`, stored on `Shipment.eWayBillNumber`, carried
  on `CanonicalBookingRequest.eWayBillNumber` and sent as `ewaybill`. The
  threshold is one constant, `EWAY_BILL_THRESHOLD` in
  `lib/booking/domesticDocs.ts`, and it matches SpeedoPost's own. The mapper
  still refuses a high-value booking with no number, which now only fires on a
  row written before the field existed.
- **`codAmount` is mandatory when `paymentType` is COD.** Same rule the rate
  call already follows.
- **`CancelOrder` is a GET.** A mutating GET is easy to trigger by accident from
  a retry, a prefetch, or a link. It sits behind `cancelOrderByAwb` in the
  server-only client and is reachable only from the adapter's `cancelOrder`,
  which ops call deliberately. It must never be put behind anything a browser can
  follow.
- **`ReattemptRequest` takes a bare JSON array**, not an object. It is the only
  endpoint in the API shaped that way.
- **`BookAppointment` documents its URL as `https://localhost:8082/...`**, which
  is a copy-paste artefact from someone's dev machine. The real host has to be
  confirmed before that endpoint is trusted at all.
- **Tax fields on `CreateOrder`** (`sgstAmount`, `cgstAmount`, `igstAmount`,
  `gstinNumber`, `totalTaxValue`) are optional and would be fed from our own
  invoice figures, not recomputed.

---

## 4. Tracking after booking: pull only

Shipmozo pushes. `/api/webhooks/shipmozo/[token]` advances a domestic shipment's
status, sends the milestone email, and posts to the tenant inbox, all without
anybody polling.

SpeedoPost documents no webhook. If that is genuinely unavailable, a booked
SpeedoPost shipment cannot advance its own status the way a Shipmozo one does,
and the options are:

- A scheduled Inngest function polling `TrackingDetails` for open SpeedoPost
  shipments. Costs a call per shipment per interval and delays every status
  change by up to that interval.
- Manual status advance by ops, which is where domestic bookings were before the
  Shipmozo webhook landed.

Worth asking them directly. A push endpoint changes the shape of the whole
feature.

There is a second, smaller point. Their tracking response carries both
`awbNumber` (theirs) and `serviceProviderAwbNumber` (the downstream courier's),
but `TrackingDetails` only accepts the first. A customer holding the Delhivery
number for a SpeedoPost consignment is not served by this endpoint, and we would
have to store both numbers to resolve either.

Their status code enum is also unpublished. Four codes appear in one example
(10001, 10003, 10006, 10007) and the documentation says outright that the list
is partial. `lib/speedopost/trackShape.ts` therefore reads the free text as the
primary signal and treats the codes as a fast path, with the unhappy words
tested first. Getting the full enum from SpeedoPost would let that invert.

---

## 5. What a live account already answered

Verified against `admin.speedopost.com` on 2026-08-04, so these are no longer
open questions.

- **The extended rate breakdown is what a real account returns**, not the
  minimal three-field shape in the base documentation. Every field named in
  `SpeedoPostRateOption` was present, and no field arrived that the types do not
  name.
- **The itemised charges genuinely do not add up to `subTotalCharge`.** On
  `DELHIVERY B2B 6CFT`, the named fields summed to 581.13 against a sub-total of
  621.13: a real 40.00 gap in fields they do not itemise. This is why the
  adapter reconciles the difference into one "Other charges" line rather than
  printing a breakdown that falls short of the price charged.
- **`ServiceProvider` does map a code to a segment**, so a booking adapter can
  recover `orderType` from a stored `courierId` without us persisting it: 5
  providers under `b2cServiceProvider`, 25 under `b2bServiceProvider`,
  `internationalServiceProvider` null. Codes do not overlap between the two.
- **Provider names are messier than documented.** Live returns
  `DELHIVERY B2B 6CFT`, `DELHIVERY B2BC 10CFT`, `Bluedart_PNK`, `Bluedart_DEL`,
  `New_First_Line`, `FRETEX B2B`, `MOVIN AIR`. Note `B2BC`, a segment tag their
  documentation never mentions.
- **They return the same service several times under different codes.** One lane
  gave four Blue Dart entries (69477 to 69480) at an identical price, two of
  them under an identical name. The rate adapter collapses these; a booking
  adapter must expect the code it stored to be one of several equivalents.
- **`TrackingDetails` refuses an unknown AWB properly**, with
  `status: FAIL, message: "Awb number not found."` and HTTP 200. It does not
  return an empty success, which is the failure mode that would have let the
  tracking adapter win the vendor fan-out race with nothing.

None of this moves the blocking items below.

---

## 6. What to ask SpeedoPost before writing any of it

1. Is `clientOrderId` enforced unique? What happens on a repeat?
2. A real `CreateOrder` success response, in full.
3. What `clientCode` should be for our account.
4. What happens when `CreateWarehouse` is called twice with the same name, and
   whether warehouse names are unique per account.
5. What `PrintLabel` returns on success, and whether the URL expires.
6. Are dimensions centimetres?
7. Is there a tracking webhook or push callback?
8. The full `currentStatusCode` enum.
9. The real host for `BookAppointment`.
10. A `CreatePickupRequest` success response, and which timezone its date
    validation uses.
11. Why four Blue Dart provider codes exist for one lane at one price, and which
    of them we are meant to book.

Items 1, 2 and 4 are blocking. The rest can be worked around or discovered
safely on first use.

---

## 7. Unrelated but worth knowing: the `$` trap in `.env`

The first live attempt failed with *"Invalid username or password"* even though
the credentials were right. Next.js runs `dotenv-expand` over `.env`, so a bare
`$` in a value starts a variable reference and everything after it is
substituted away. A password ending `@#$123` was loaded as `@#`.

Quoting does not help, and neither do single quotes. Only a backslash does:

```
SPEEDOPOST_PASSWORD = "Secret@#\$123"
```

A trailing `$` with nothing after it survives untouched, which is why
`SHIPGLOBAL_PASSWORD` was unaffected. This applies to every secret in that file,
not just SpeedoPost's. Noted in `env.example` next to the variable.

---

## 7. Why SpeedoPost books domestic shipments but not first-mile legs

`DOMESTIC_BOOKABLE_VENDOR_IDS` lists SpeedoPost. `FIRST_MILE_VENDOR_IDS`, the
export door → hub leg, does not. That is a judgement, not an oversight.

The difference is the deadline. A domestic door → door shipment whose booking
fails ambiguously (§3.1) waits a few hours for ops to check the SpeedoPost panel
and re-drive it by hand; the customer's parcel is late, nothing is lost. A
first-mile leg in the same state has to reach an Arena hub in time for a specific
export, and hours of manual recovery is a missed flight and a re-booked
international leg.

Revisit the moment SpeedoPost answers whether `clientOrderId` is enforced unique.
That single answer makes the create retriable, which removes the whole reason for
the split.

---

## 8. What the first live booking has to confirm

The adapter is written against readings, not observations. In order:

1. **`SPEEDOPOST_CLIENT_CODE`.** Nothing books without it. Ask them.
2. **The CreateOrder success shape.** The adapter logs the whole body; read the
   log, then tighten `SpeedoPostCreateOrderData` and reorder `AWB_FIELDS`.
3. **What PrintLabel returns.** The most likely thing to fail. A failure here
   still leaves the order placed and the AWB recorded.
4. **Whether CreatePickupRequest accepts our IST slot**, and what a success
   response looks like.
5. **Whether a repeated `warehouseName` is refused, duplicated or updated**, and
   whether the "already exists" wording the adapter matches is what they send.

Do the first one on a real but low-value consignment that Arena can absorb, and
read the logs before booking a customer's.
