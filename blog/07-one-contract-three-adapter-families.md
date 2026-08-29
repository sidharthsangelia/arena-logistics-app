# 07. One adapter contract, three families, thirteen vendors

**Kind:** architecture · **Tier:** 2 · **Est. length:** 1300 words · standalone

## Hook

"Adding a vendor should not require changing anything else" is the easiest
architectural claim to make and the hardest to keep. Here is what it actually
cost to keep it across rates, bookings and tracking.

## Thesis

The adapter pattern is not the interesting part. The interesting parts are the
canonical types in the middle, the registry that stops the service layer
importing vendors directly, and the decision about which families are allowed to
share code with each other.

## Outline

1. The three-step contract every adapter implements: `transformRequest`,
   `callVendorApi`, `transformResponse`. One public entry point orchestrates
   them and normalises errors, so no caller ever sees a vendor-shaped failure.
2. Three separate families, not one. Rates, bookings and tracking each have their
   own core, their own canonical types and their own registry. A vendor appears
   in one, two or all three.
3. The deliberate non-sharing. The rate error type and the booking error type are
   the same shape and are still two files, because the families have no other
   coupling and one importing the other's core would create it. Worth defending
   as a considered position rather than an oversight, since it violates DRY on
   purpose.
4. The registry as a seam. A `Map`, and the service layer looks up adapters here
   instead of importing them. The registration module is imported for side
   effects.
5. The bug that shaped it. Registration originally threw on a duplicate vendor id,
   which turned benign module re-evaluation into a 500 on the rates page. Two
   causes: dev HMR re-runs the module on any adapter change, and the App Router
   can evaluate the same module in separate server and SSR module graphs.
6. The fix, and the pattern it belongs to. Registration is idempotent and the
   latest instance wins so HMR picks up edits. The registry singleton is pinned
   to `globalThis`, the same pattern the Prisma client uses, so there is exactly
   one per process regardless of module graph. This is a Next.js-specific hazard
   worth naming loudly: **module-level singletons are not singletons**.
7. Where the abstraction correctly leaks. Some vendors need a payload variant per
   carrier family; some publish no order-lookup endpoint; some return a magic
   integer where the docs promise a string. The base class does not try to hide
   these, it gives them a place to live.
8. Reuse across families where the domain actually matches: a first-mile pickup
   *is* a domestic forward order (India to India, door to a warehouse that
   happens to be ours), so it goes through the domestic booking adapters with
   only the request builder differing. The previous implementation had all of
   that logic inlined a second time, which is how the two drifted.

## Trim to fit

Points 5 and 6 (the duplicate-registration bug and the `globalThis` pin) are the
strongest material here and should get the most room. Point 8 compresses to two
sentences.

## Code

- `lib/rate-adapters/core/` (`base.adapter.ts`, `registry.ts`, `types.ts`)
- `lib/booking-adapters/core/`, `lib/tracking-adapters/core/`
- `lib/rate-adapters/vendors/index.ts`
- `lib/inngest/functions/bookFirstMilePickup.ts` for the reuse argument
