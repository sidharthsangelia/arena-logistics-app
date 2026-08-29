# 03. Three layers of idempotency, because the expensive mistake is a second parcel

**Kind:** architecture · **Tier:** 1 · **Est. length:** 1400 words · standalone

## Hook

A retried HTTP call usually costs you a duplicate row. In logistics it costs you
a second physical parcel, at full price, going to a real address.

## Thesis

At-least-once delivery is not a caveat you note and move past. If the side effect
is expensive and irreversible, you need idempotency at more than one layer,
because each layer has a specific hole the next one covers, and one of those
holes is only visible if you draw it out.

## Outline

1. The setup. A customer pays. Six vendor calls follow: check placeability,
   identify the exact service bought, register the exporter, push the booking,
   fetch the waybill, file the label. Any one can fail on its own.
2. Why this is not a server action. Run inline, one flaky call either fails a
   booking the customer has already paid for, or leaves a half-created export
   behind with no record of how far it got. `after()` gets you two of the three
   properties you want and not the third: it is not durable across a process
   death.
3. Layer 1: step memoisation. A retry after the push resumes at the label.
4. Layer 2: write external ids the instant the vendor returns them. Even a
   completely fresh run reuses the shipper and booking that already exist.
5. Layer 3: ask the vendor. "Do you already hold an order under our reference?"
   This is the one case layers 1 and 2 cannot cover: **the push landed and the
   response was lost**, so nothing was written on our side. Draw this one.
6. When layer 3 does not exist. One vendor publishes no lookup endpoint and books
   in a single call. So its adapter refuses to retry an ambiguous create at all:
   5xx and network faults are retriable because the request plausibly never
   landed; an HTTP-200 envelope rejection is permanent and a human looks at it.
   Spending four automatic attempts against a vendor that might have accepted the
   first is the mistake this layer must not make.
7. The payoff: the function is safe to invoke by hand, which is exactly what the
   ops retry button does. Idempotency is not defensive, it is what makes a manual
   recovery tool possible.
8. Where auto-recovery stops. The domestic job has an `allowAutoAssign` escape
   hatch because domestic couriers are broadly interchangeable at a given price.
   The international one does not, because transit time, duty handling and
   customs paperwork all differ and the customer chose on those. Substitution is
   a business decision, not a retry policy.
9. Invoices get only two layers, and why that is enough: a database unique
   constraint on `(shipmentId, docType)` is an independent enforcement that does
   not care how the job was triggered.

## Code

- `lib/inngest/functions/bookInternationalCarrier.ts` (module header is the spine)
- `lib/inngest/functions/bookDomesticCourier.ts`
- `lib/inngest/functions/generateShipmentInvoice.ts`
- `lib/booking-adapters/vendors/skart/skart.booking.adapter.ts`, the `call` method

## Trim to fit

Points 8 and 9 are the cuts. Auto-assign versus no-auto-assign is a good post on
its own ("when is substitution a retry policy and when is it a business
decision"); the invoice job's two layers can be one sentence.

## Diagram to draw

The three layers as concentric coverage, with the "push landed, response lost"
gap shaded to show only layer 3 reaches it.
