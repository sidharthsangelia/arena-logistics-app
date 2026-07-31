/**
 * lib/inngest/client.ts
 *
 * The Inngest app and its event catalogue.
 *
 * Inngest is used here for one thing: work that must happen after a booking
 * commits, must not be able to fail the booking, and must not be silently lost
 * if the process dies halfway. `after()` covers the first two and not the
 * third, which is the reason for the dependency.
 *
 * ── MODE ────────────────────────────────────────────────────────────────────
 * The SDK defaults to Cloud mode. Local development needs INNGEST_DEV=1 in
 * .env, otherwise /api/inngest returns 500 with "in cloud mode but no signing
 * key". Production needs INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY. isDev is
 * never hardcoded: it reads fine locally and breaks silently in production.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { Inngest, eventType } from "inngest";
import { sentryMiddleware } from "@inngest/middleware-sentry";
import { z } from "zod";

/**
 * Fired once a shipment is durably BOOKED and paid for.
 *
 * Deliberately a fact about the domain rather than an instruction to a
 * particular job ("shipment/booked", not "invoice/generate"). Anything else
 * that should happen on a booking subscribes to the same event rather than the
 * booking action growing another call.
 */
export const shipmentBooked = eventType("shipment/booked", {
  schema: z.object({
    shipmentId: z.string(),
    shipmentNumber: z.string(),
    orgId: z.string(),
  }),
});

/**
 * Re-drive invoice generation for a shipment whose job failed. Sent by an Arena
 * admin from the dashboard, never automatically: if the first run failed for a
 * reason that has not been fixed, retrying on a timer just fails on a schedule.
 */
export const invoiceRetryRequested = eventType("invoice/retry.requested", {
  schema: z.object({
    shipmentId: z.string(),
    // Carried even though the job could look it up, because the generation
    // function keys its concurrency limit on event.data.orgId. Both triggers
    // must supply it or retries fall outside the limit that keeps concurrent
    // invoice issues from queueing on the same counter row.
    orgId: z.string(),
    requestedByUserId: z.string(),
  }),
});

export const inngest = new Inngest({
  id: "arena-cargo-logistics",

  // Every server action in this codebase reports to Sentry; background work
  // should not become the blind spot. This attaches function and step context
  // to anything thrown inside a step.
  middleware: [sentryMiddleware()],
});
