# 11. One feed, two meanings: the same tracking event is not the same fact

**Kind:** failure · **Tier:** 2 · **Est. length:** 1200 words · standalone

## Hook

The same webhook, the same body, the same status string, `Delivered`. In one case
it means the customer has their parcel. In the other it means the parcel reached
*our* warehouse and the journey has barely started.

## Thesis

Integration bugs are rarely parsing bugs. They are bugs where a payload was
correctly parsed and then interpreted against the wrong context, because the
context lives in your domain and not in the payload.

## Outline

1. The setup. Both kinds of booking push to the same vendor account, so their
   tracking posts arrive at one endpoint looking identical.
2. What the same event means in each mode:
   - domestic: the vendor carries the parcel the whole way, so `Delivered` moves
     the shipment's own status and sends the milestone email
   - international: the vendor carries it from the sender's door to our hub, so
     `Delivered` advances a small first-mile leg and nothing else
3. So the handler's first job is not parsing. It is resolving which shipment this
   is and therefore which of two status maps applies.
4. The bug that cost money: a returned parcel was being read as arrived at the
   hub. A return and an arrival are the same physical event from the courier's
   point of view and opposite events from ours.
5. Monotonic status, not last-write-wins. Take the *furthest* stage the scans
   support rather than the most recent one, because out-of-order delivery and
   redelivery attempts will otherwise walk a shipment backwards.
6. Pull and push disagree. The same vendor's webhook body and its track-order
   response are different shapes for the same information, so the readers are
   separate and the mapping is shared.
7. Tests that pin readings rather than functions. A commit in this repo is
   literally called "pin the status readings that cost money". Argue for
   golden-payload tests on integrations where a misreading has a rupee value.
8. Merging legs for the customer. The tracking page takes either your own
   reference or a carrier AWB, merges the first-mile and main legs into one
   timeline, and scopes everything by session, because a waybill number is not an
   authorisation token.

## Code

- `app/api/webhooks/shipmozo/[token]/route.ts`
- `lib/shipmozo/domesticStatusMap.ts`, `lib/shipmozo/firstMileStatusMap.ts`
- `lib/shipmozo/trackShape.ts`
- `lib/tracking/internalTimeline.ts`, `lib/tracking/shipmentResolve.ts`
- `utils/shipmozoTracking.test.ts`
