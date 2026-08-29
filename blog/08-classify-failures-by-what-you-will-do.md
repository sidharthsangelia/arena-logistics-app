# 08. Classify failures by what you will do, not by what they say

**Kind:** design decision · **Tier:** 2 · **Est. length:** 1100 words

## Hook

Every adapter threw a plain `Error` with the HTTP status embedded in the message
text. That is survivable when a human reads the message and tries again. It is
not survivable for a job that makes thousands of calls unattended.

## Thesis

An error taxonomy should be indexed by the *decision it forces*, not by the
error's origin. If two conditions lead to the same action, they are one kind. If
one condition leads to two actions depending on context, your kinds are wrong.

## Outline

1. The four situations a scheduled job has to tell apart with nobody in the loop:
   - the vendor answered and declined the lane: a fact worth storing, retrying
     changes nothing
   - a 5xx or a timeout: retry, the lane is probably fine
   - a 401 or 403: stop this vendor for the whole run, because continuing means
     hundreds more failures against a dead key and, on some vendors, a lockout
   - a 429: back off, honour `Retry-After`, keep going slower
2. The alternative was grepping the message string, which breaks the first time a
   vendor rewords an error.
3. The kind names are verbs in disguise: `NO_SERVICE`, `AUTH_ERROR`,
   `RATE_LIMITED`, `VENDOR_ERROR`, `CONFIG_ERROR`, `TIMEOUT`, `UNKNOWN`. Each
   maps to exactly one policy.
4. `UNKNOWN` defaults to retriable, and why that is the safe default here even
   though it is not universally safe. Contrast with the booking side, where the
   safe default is the opposite, because the expensive mistake is a duplicate
   parcel rather than a wasted call.
5. Backward compatibility as a design constraint. The new fields are optional, so
   the live calculator, the API route and the booking service all keep working
   with no edit, and an adapter that still throws a plain `Error` still produces
   a sensible classified failure.
6. Classification happens at the throw site, not the catch site. The base class
   reads the classification off the thrown value rather than re-deriving it, so
   an adapter that knows why it failed can say so.
7. Honouring `Retry-After` properly, and the trap: a missing or unparseable
   header must not silently become "no backoff at all".

## Code

- `lib/rate-adapters/core/errors.ts` (module header is the argument)
- `lib/booking-adapters/core/base.booking.adapter.ts`
- `lib/inngest/functions/sweepRateLane.ts` for the consuming policy

## Overlap

Touches the rate sweep. Keep the sweep as the example, not the subject.
