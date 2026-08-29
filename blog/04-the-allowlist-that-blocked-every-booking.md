# 04. The allowlist that made every booking impossible

**Kind:** failure · **Tier:** 1 · **Est. length:** 1200 words · standalone

## Hook

Preflight validation rejected one hundred percent of bookings for one vendor, and
it did so correctly, by its own rules. The rules were written from eight examples
in a PDF.

## Thesis

When you integrate a vendor, you will be tempted to model their taxonomy from the
worked examples in their docs. Do not. Ask whether they publish the grouping
themselves, because they usually do, and your inferred version will be a strict
subset of reality that looks complete until it is in production.

## Outline

1. The bug. The booking payload shape depends on which carrier family a product
   belongs to: FedEx and UPS need a commercial invoice block, Skynet needs a
   state code and its own purpose field, DHL carries a shipper type and itemises
   commodities, a fourth needs none of it. The original implementation keyed this
   off an allowlist of eight exact product names.
2. The vendor sells ninety-odd products, with names like
   `DHL DEL DDU ( Gifts Only )` and `AMX UPS DEL DDU ( Gifts Only )`. None of the
   eight names were things a customer could actually buy. Every quote the rate
   calculator returned was refused at preflight.
3. Why it survived. It was not a crash. It was a clean, well-worded refusal, on a
   path nobody exercised end to end until a real export was attempted.
4. The fix. `GET /courier` returns `parent_vendor` on every product:
   one per carrier family. That is the authority. Key on the vendor's own
   grouping, not on your guess at it.
5. The fallback that survives a catalogue outage: a name-based guess, deliberately
   conservative, where an unrecognised family books as the plain payload, because
   the plain payload is the one the most vendors accept.
6. The general lesson, stated three ways:
   - Prefer an identifier the vendor computes over one you infer.
   - An allowlist built from examples is a denial policy with extra steps.
   - Where a guess is unavoidable, make the unknown case degrade to the widest
     valid behaviour, not the narrowest.
7. Companion habit: name the magic numbers. This vendor encodes its enumerations
   as bare integers with no lookup endpoint. Every one is a named constant with
   the PDF page it came from, and where the PDF and the JSON examples disagree,
   the PDF wins because it is the current document.
8. And a companion to that: prefer a wire value proven to be accepted over a more
   sensible one that has never been tried.

## Code

- `lib/booking-adapters/vendors/skart/skart.booking.strategies.ts`
- `lib/booking-adapters/vendors/skart/skart.courierCatalogue.ts`
- `lib/booking-adapters/vendors/skart/skart.booking.types.ts`

## Disclosure

Supplier anonymised to "the vendor" throughout. Carrier family names (DHL,
FedEx, UPS) are kept: they identify no supplier and the payload-varies-by-family
point does not survive without them.
