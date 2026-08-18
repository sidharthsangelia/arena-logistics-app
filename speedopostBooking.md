# SpeedoPost booking: analysis, not implementation

What it would take to place a SpeedoPost order from Arena, and what stops that
being written today.

> **Status as of 2026-08-18: SpeedoPost is switched off.** Its rate adapter is
> no longer registered in `lib/rate-adapters/vendors/domestic.index.ts`, so it
> quotes nothing and no customer can select it. The code is all still in the
> repo and still compiles; re-enabling is uncommenting the import and the
> `register` call there, plus the entry in `DOMESTIC_CALCULATOR_VENDORS`
> (`lib/types.ts`). Tracking stays registered so shipments already moving keep
> reporting scans. The rest of this document describes the position before that
> change and is the starting point for whoever builds the booking adapter.

Nothing in this document is built. The tracking adapter is live and the rate
adapter works but is unregistered; the booking adapter is deliberately absent. This is the reading of their
booking API that the eventual implementation should start from, plus the list of
answers we need from SpeedoPost before it can be written honestly.

---

## 1. Where this sits today

| Layer | SpeedoPost | Status |
| --- | --- | --- |
| Rates | `lib/rate-adapters/vendors/speedopost/` | Built, unregistered. Prices B2C and B2B in parallel; not merged into the domestic calculator while it stays unregistered. |
| Tracking | `lib/tracking-adapters/vendors/speedopost/` | Live. In the `/track` vendor fan-out. |
| Booking | none | Not built. `resolveBookingAdapter("speedopost")` returns null. |

### The consequence of that gap, stated plainly

`lib/booking-adapters/vendors/domestic.booking.index.ts` has no `speedopost`
entry, so a customer who selects a SpeedoPost service in the booking wizard
will:

1. Pay. The wallet is debited at booking exactly as on any domestic shipment.
2. Trigger `bookDomesticCourier`, which stops at
   `prepareBooking` with a `NonRetriableError`: *"No booking integration exists
   for vendor speedopost. This booking has to be placed by hand."*
3. Land as `domesticCourierStatus: FAILED` with that message in
   `domesticCourierError`.
4. Hold the money (decision D5 in `domesticCourierBooking.md`) and write a
   CRITICAL `COURIER_BOOKING_FAILED` notification to the Arena inbox.

Ops then place the order in the SpeedoPost panel and record the AWB by hand.
This was chosen knowingly: the rates are worth having in front of customers
before the booking integration lands. Registering a booking adapter under the
same `vendorId` is the whole fix, and no other layer changes when it does.

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

This is the single biggest open item and it should be settled with SpeedoPost
before code is written, not after.

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

### 3.3 The CreateOrder response shape is undocumented

Their doc says only that *"the response will provide the status and order
details"*. There is no example, so there is no confirmed field name for the AWB,
the order id, or the assigned provider.

`SpeedoPostCreateOrderData` in `lib/speedopost/types.ts` names the likely fields
optionally rather than inventing required ones. The first live call must be
logged in full and the type corrected before anything reads from it. Writing the
adapter against a guessed field name produces an order that exists at the vendor
and has no AWB on our side, which is exactly the state decision D4 exists to
prevent.

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

### 3.5 The label format is unknown

`PrintLabel` is documented with a failure example only. It could return a URL, a
base64 payload, or binary content. `lib/booking/labelStorage.ts` copies a label
into our own storage because Shipmozo's is a presigned URL that expires in an
hour; whether that applies here is unknown until a real label is fetched.

### 3.6 Smaller ones, each real

- **`clientCode` is required and unexplained.** `"API"` in their example. We do
  not know where ours comes from or whether it varies.
- **Dimension units are never stated anywhere.** Not in the rate call, not in
  the order call. The rate adapter sends centimetres because that is what every
  other domestic vendor takes, but this is an assumption and should be confirmed.
- **`ewaybill` is mandatory above Rs 50,000 of goods value.** Enforced by them,
  not by us today. The booking request builder would need to refuse such a
  shipment up front rather than let it fail at the vendor.
- **`codAmount` is mandatory when `paymentType` is COD.** Same rule the rate
  call already follows.
- **`CancelOrder` is a GET.** A mutating GET is easy to trigger by accident from
  a retry, a prefetch, or a link. It must never sit behind anything a browser
  can follow.
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
