# Domestic courier booking

How a paid domestic booking turns itself into a waybill, and where to look when
it does not.

This document is the reference for the feature: what it does, why each decision
went the way it did, and what to check when something looks wrong.

---

## 1. What it is

A DOMESTIC shipment that reaches `BOOKED` places its own order with the courier
vendor, gets the AWB for the exact service the customer paid for, asks for the
pickup, then fetches the printable label and files it against the shipment.
Nobody presses anything. The customer sees the label on their shipment page,
usually within a minute of paying.

Before this, the domestic booking screen carried a note telling ops to open the
Shipmozo panel and record the AWB by hand.

### What it is not

- Not the international carrier booking. Exports are still placed by ops from
  `/arena-dashboard/bookings/[id]`, with MAWB and HAWB entered by hand.
- Not the international first-mile leg. `actions/book/firstMilePickupBooking.action.ts`
  still books door → hub pickups for exports, on the same vendor, from an ops
  click. Both now share the courier resolution in
  `lib/booking/domesticCourierResolve.ts`.
- Not tracking. The waybill exists; advancing a domestic parcel's status is
  still manual. The Shipmozo tracking webhook is deliberately scoped to
  international shipments (see §6).

---

## 2. The layers

| Layer | Path | Knows about |
| --- | --- | --- |
| Adapters | `lib/booking-adapters/` | One vendor's HTTP API. Nothing else. |
| Request builder | `lib/booking/domesticCourier.ts` | Our schema → the canonical request, and which bookings are unbookable. |
| Durable job | `lib/inngest/functions/bookDomesticCourier.ts` | Order of operations, what to persist, what to retry. |
| Ops controls | `actions/book/domesticCourierBooking.action.ts` | Re-driving and cancelling. |

`lib/booking-adapters` is the third registry of its kind, alongside
`lib/rate-adapters` (what it costs) and `lib/tracking-adapters` (where it is).
Three registries rather than one because a vendor can be quotable without being
bookable, and a single registry would force every vendor to pretend otherwise.

**Adding a domestic vendor** is two files and two lines: an adapter extending
`BaseBookingAdapter`, and its registration in
`lib/booking-adapters/vendors/domestic.booking.index.ts`. The job, the schema and
both screens are written against the interface and the `vendorId` recorded on
the shipment, so none of them changes. The `vendorId` must match the rate
adapter's. That is the id snapshotted when the customer picks a service, and it
is how the booking finds the vendor that quoted the price they paid.

---

## 3. Decisions, and why

| # | Decision | Why |
| --- | --- | --- |
| D1 | The order is placed automatically at booking, not by ops | The customer has paid. Waiting for someone to open a vendor panel is a queue with no reason to exist. |
| D2 | The exact courier the customer paid for, or nothing | They chose a named service at a named price. Substituting another is a commercial decision, so it takes an explicit ops opt-in. |
| D3 | Durable function, not `after()` or an inline call | Five vendor calls, each able to fail alone. Inline, one flake either fails a paid booking or leaves a half-created order with no record of how far it got. |
| D4 | Every external id is written the instant it comes back | The expensive mistake is a SECOND parcel. Ids on the row mean a fresh run reuses what exists rather than creating more. |
| D5 | A permanent failure holds the money and flags ops | A courier refusing an order is not the same as a customer cancelling. Refunding on a failed API call guesses at which, and the guess is visible to the customer. |
| D6 | The label is a `ShipmentDocument`, visible to the client | It is the thing they print and stick on the box. `carrierBranding.md` scopes vendor masking to international rates, so a domestic courier's name on a domestic label leaks nothing. |
| D7 | The tenant page distinguishes "being issued" from "failed" | Both are a blank space otherwise, and a customer who just paid reads a blank space as a failed booking. |

---

## 4. The sequence

Each step below is one Inngest step, which means each is retried on its own and
none of them re-runs once it has succeeded.

1. **prepare-booking**. Load, refuse what must not be booked (not domestic, not
   yet paid, cancelled, no adapter, unbookable data), stamp the attempt.
2. **resolve-courier**. The vendor's courier id for the paid-for service, from
   the snapshot or by re-quoting the same route. Runs BEFORE anything is created
   at the vendor, so we never leave an order we would then refuse to assign.
3. **register-pickup-point**. The customer's pickup address, as the vendor's own
   pickup entity. Persisted immediately.
4. **create-order**. The order. Persisted immediately.
5. **assign-courier**. The AWB, plus the timeline entry, in one transaction.
6. **schedule-pickup**. Best effort, failure swallowed. Several vendors schedule
   on assign and treat a second request as an error, and none will un-book an
   order because this failed.
7. **fetch-label**, then **upload-label**, then **save-label-document**. Three
   steps, because they fail for unrelated reasons.

### Idempotency

Three layers, because at-least-once delivery means this runs twice.

1. Steps memoise: a retry after the order was pushed resumes at the assign.
2. Every id is on the shipment row, so even a completely fresh run reuses them.
3. On a retry only, the adapter is asked whether the vendor already holds an
   order under our reference. This covers the one case the first two cannot: the
   push landed and the response was lost, so nothing was written on our side.

Plus `concurrency: { limit: 1, key: "event.data.shipmentId" }`, so an automatic
booking and an impatient ops retry cannot race into two orders for one parcel.

---

## 5. What ops see

`/arena-dashboard/domestic-bookings/[id]`, the Courier panel:

- **Retry** re-drives the same durable job. An ops click and an automatic
  booking are literally the same code path.
- **Allow auto-assign**, a separate checkbox, is the only thing an ops click can
  do that the automatic path cannot: authorise a courier the customer did not
  choose.
- **Cancel courier order** calls the vendor inline (ops need the answer within
  the click) and leaves the shipment itself alone. Cancelling an order and
  cancelling a customer's booking are different decisions.

A permanently failed booking also writes a CRITICAL `COURIER_BOOKING_FAILED`
notification to the Arena inbox, with no dedupe key: retries are exhausted
before it is written, so one notification means one exhausted attempt, including
the manual re-drives.

`Shipment.domesticCourierStatus` is the field to read: `PENDING` → `BOOKED`, or
`FAILED` with `domesticCourierError` carrying the vendor's own message.

---

## 6. Tracking

Two directions, one vendor body, and both are live.

**Push.** `/api/webhooks/shipmozo/[token]` matches a payload against every
identifier Shipmozo echoes, across both modes, then branches on the matched
shipment's `mode`:

- `DOMESTIC` → `applyDomesticCourierStatus` moves the shipment's own status.
  Their "Delivered" is a real delivery, so it sends the milestone email and
  posts to the tenant inbox.
- `INTERNATIONAL` → `applyFirstMileTransition` moves only the door → hub leg.
  Their "Delivered" means the parcel reached Arena.

Both are forward-only, and both refuse to touch a shipment a person parked off
the happy path (`ON_HOLD`, `CANCELLED`, `CUSTOMS_HOLD`, `DOCUMENTS_PENDING`).
Shipmozo re-sends the entire scan history on every post, so without that the
same delivery email would go out repeatedly.

**Pull.** `/track` and `/arena-dashboard/track` accept either number a customer
holds: `ARN260130748291` or the carrier AWB. `lib/tracking/shipmentResolve.ts`
matches it against `shipmentNumber` and all four waybill columns, then
`lib/services/shipmentTracking.service.ts` tracks the legs it finds and merges
them into one timeline. A booking with no waybill yet falls back to its own
status history, so a number always tracks. A number that resolves to nothing and
is not ARN-shaped is passed to the vendor fan-out, because a customer may hold
a carrier AWB for a shipment Arena never booked.

Scope comes from the session, never the request: a tenant resolves shipment
numbers only within their own org, Arena staff resolve any.

---

## 7. Gotchas

- **The webhook and `GET /track-order` are not the same body.** The webhook
  posts `status_feed.scan[]` and calls the courier `carrier`; the pull endpoint
  answers `scan_detail[]` and calls it `courier`, plus an `order_status` the
  webhook never sends. An adapter written against the webhook shape returns a
  successful track with an empty timeline for every live lookup. Everything goes
  through `lib/shipmozo/trackShape.ts`.
- **`order_status` and `current_status` disagree, and both are true.** A
  cancelled order keeps reporting its last movement status: live traffic shows
  `order_status: "CANCELLED"` alongside `current_status: "Pickup Pending"`.
  Reading only the second tells a customer to expect a pickup that is not coming.
- **"Undelivered" contains "delivered".** So does "RTO Delivered". Every status
  map here tests the unhappy words FIRST. A substring match in the obvious
  order announces a delivery on the day a parcel was refused, and on the
  first-mile leg it also triggers pay-on-arrival collection for a parcel that
  never reached the hub. Pinned in `utils/shipmozoTracking.test.ts`.
- **An unknown AWB is not an error to Shipmozo.** It answers HTTP 200 with
  `result: "0"` and "The selected awb number is invalid", and in other cases
  `result: "1"` with an empty body. The adapter treats an empty body as a miss,
  otherwise it wins the vendor fan-out race with nothing.
- **Phone numbers are validated, not just present.** A nine-digit consignee
  number passed the form's old `min(8)` rule, reached Shipmozo, and was refused
  five times with the message "Error". `lib/booking/phone.ts` now holds one rule
  used by both the booking form and the booking job: ten digits starting 6 to 9,
  with `+91`, a leading zero and punctuation stripped. The form check fires only
  on addresses in India, so an export to Dubai is unaffected.
- **Shipmozo reads posted keys without checking they exist.** Omitting an
  optional field is not "no value", it is a refused order:
  `{"error":"Undefined array key \"discount\""}`. Every documented key is filled
  with their own empty defaults in `lib/shipmozo/pushOrderDefaults.ts`, applied
  inside `pushOrder` so no caller can forget it.
- **The label endpoint returns an array.** Their OpenAPI says only "Successful
  operation"; what actually comes back is
  `data: [{ type: "PDF", label: "https://...s3.../Label_x.pdf?..." }]`, a
  presigned URL that expires in an hour, which is why the file is copied to our
  own storage rather than linked. Without `type_of_label=PDF` the same field
  holds a base64 PNG data URI instead, so the stored file's type and extension
  follow what was sent rather than being assumed.
- **Weight is grams at Shipmozo and kilograms everywhere here**, and `push-order`
  takes one L/W/H for a multi-box order. Both conversions round UP, in
  `shipmozo.booking.mapper.ts`, tested in `utils/domesticCourierBooking.test.ts`.
  Under-declaring is what gets a parcel held and surcharged at the hub.
- **COD is not how the customer pays Arena.** The freight came out of the wallet
  at booking. `codAmount` is the goods value the courier collects from the
  receiver.
