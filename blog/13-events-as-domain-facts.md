# 13. Events as domain facts, not job instructions

**Kind:** architecture · **Tier:** 2 · **Est. length:** 900 words

## Hook

`shipment/booked`, not `invoice/generate`. One of those names lets you add a
second consequence without touching the code that publishes it. The other does
not.

## Thesis

The naming convention is the architecture. Once an event is named after the job
it triggers, you have a function call with extra infrastructure, and the coupling
you paid a queue to avoid is back.

## Outline

1. The rule, stated plainly: name the event after the thing that happened in the
   domain, in the past tense. Anything that should also happen subscribes,
   rather than the publishing code growing another call.
2. What subscribes to a single booking in practice, and the deliberate
   independence: the tax invoice job and the carrier booking job both fire on
   payment, and one failing must not hold up the other.
3. The exception that proves it. `shipment/intl-carrier.requested` is an
   instruction, not a fact, and it is separate from `shipment/booked` on purpose.
   Be honest about when a command event is the right call.
4. Retry events sent by a human, never on a timer. If the first run failed for a
   reason nobody has fixed, retrying on a schedule just fails on a schedule.
5. Carrying redundant data in the payload on purpose. The org id is in the retry
   event even though the job could look it up, because the function keys its
   concurrency limit on it, and both triggers must supply it or retries fall
   outside the limit.
6. Idempotency at two levels for a job two different things can trigger: the
   platform's idempotency key makes the duplicate harmless, and a notification
   dedupe key makes it harmless in the inbox. Belt and braces, because the real
   failure is an ops team getting two alerts for one problem and starting to
   ignore both.
7. A healthy run says nothing. A job that reports its own success on a schedule
   trains everyone to filter it, so that when it finally has something to say
   nobody reads it. This is the best single line to build the post's ending on.
8. Typed event catalogues, and why the schema lives with the client.

## Code

- `lib/inngest/client.ts` (the event catalogue and its comments)
- `actions/book/createShipment.action.ts` (the fan-out at the end)
- `lib/inngest/functions/finaliseRateSweep.ts`
- `lib/notifications/emit.ts` for the dedupe-key argument
