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

/**
 * Fired for a DOMESTIC shipment that is booked and paid for, to get it a
 * waybill from the courier vendor.
 *
 * Separate from shipment/booked rather than a second subscriber to it, because
 * the two carry different retry semantics and different blast radii: an invoice
 * that fails is a document we owe, a courier booking that fails is a parcel
 * nobody has collected. Keeping them apart also means an admin can re-drive one
 * without re-running the other.
 */
export const domesticCourierRequested = eventType(
  "shipment/domestic-courier.requested",
  {
    schema: z.object({
      shipmentId: z.string(),
      shipmentNumber: z.string(),
      orgId: z.string(),
      /**
       * Ship on whatever courier the vendor picks when the paid-for one cannot
       * be identified. Never true on the automatic path: the customer chose a
       * service, and substituting another is a decision only a person makes.
       */
      allowAutoAssign: z.boolean().optional(),
    }),
  },
);

/**
 * Re-drive a courier booking an Arena admin has looked at and decided to try
 * again. Manual by design, exactly like the invoice retry: if the first run
 * failed for a reason nobody has fixed, an automatic retry just fails later.
 */
export const domesticCourierRetryRequested = eventType(
  "shipment/domestic-courier.retry.requested",
  {
    schema: z.object({
      shipmentId: z.string(),
      shipmentNumber: z.string(),
      orgId: z.string(),
      requestedByUserId: z.string(),
      allowAutoAssign: z.boolean().optional(),
    }),
  },
);

/**
 * Fired for an INTERNATIONAL shipment that is booked and paid for, to place it
 * with the carrier vendor and get its waybill.
 *
 * The export counterpart of shipment/domestic-courier.requested, and separate
 * from it for the same reason those two are separate from shipment/booked: the
 * jobs fail differently, carry different blast radii, and must be re-drivable
 * independently. A failed export booking is a consignment nobody has collected;
 * a failed invoice is a document we owe.
 */
export const intlCarrierRequested = eventType("shipment/intl-carrier.requested", {
  schema: z.object({
    shipmentId: z.string(),
    shipmentNumber: z.string(),
    orgId: z.string(),
  }),
});

/**
 * Re-drive an export booking an Arena admin has looked at and decided to try
 * again. Manual by design, exactly like the invoice and domestic retries: if the
 * first run failed for a reason nobody has fixed, an automatic retry just fails
 * later.
 *
 * Note the absence of an `allowAutoAssign` flag, which the domestic retry has.
 * There is no auto-assign on an export: international carriers are not
 * interchangeable — transit time, duty handling and customs paperwork all differ
 * and the customer chose on those — so an unidentifiable service is always a
 * stop, never a substitution.
 */
export const intlCarrierRetryRequested = eventType(
  "shipment/intl-carrier.retry.requested",
  {
    schema: z.object({
      shipmentId: z.string(),
      shipmentNumber: z.string(),
      orgId: z.string(),
      requestedByUserId: z.string(),
    }),
  },
);

/**
 * Fired once an international leg is booked, to send the door → hub courier for
 * a shipment whose customer bought Arena's first-mile pickup.
 *
 * DELIBERATELY DOWNSTREAM OF THE EXPORT BOOKING rather than fired at payment
 * alongside it. A parcel collected from a customer's door for an export that
 * then cannot be placed is a parcel sitting in a hub with nowhere to go, and
 * somebody has to drive it back. Booking the carrier first costs a few minutes
 * and means the collection only ever happens for a consignment that has a
 * waybill waiting for it.
 */
export const firstMileRequested = eventType("shipment/first-mile.requested", {
  schema: z.object({
    shipmentId: z.string(),
    shipmentNumber: z.string(),
    orgId: z.string(),
    /**
     * Ship on whatever courier the vendor picks when the paid-for one cannot be
     * identified. Never true on the automatic path: the customer chose a
     * service, and substituting another is a decision only a person makes.
     */
    allowAutoAssign: z.boolean().optional(),
  }),
});

/** Re-drive a first-mile pickup from the ops booking page. Manual by design. */
export const firstMileRetryRequested = eventType(
  "shipment/first-mile.retry.requested",
  {
    schema: z.object({
      shipmentId: z.string(),
      shipmentNumber: z.string(),
      orgId: z.string(),
      requestedByUserId: z.string(),
      allowAutoAssign: z.boolean().optional(),
    }),
  },
);

// ---------------------------------------------------------------------------
// International rate sweep
//
// Three events for one scheduled job, because the job has three genuinely
// different units of work and collapsing them would break the one property that
// makes it safe: the pacing.
//
//   requested → one planner run. Decides the matrix, opens the run row, fans out.
//   lane      → one vendor against one country. EIGHTY of these per sweep, and
//               the unit that carries the concurrency key, which is what limits
//               a vendor to one lane at a time and therefore to a known rate.
//   finalise  → one closing run. Counts, judges each vendor, alerts.
//
// The lane is the interesting one. It exists as its own event rather than as a
// loop inside the planner because Inngest's concurrency and retry controls act
// on RUNS: eighty runs keyed by vendor is a rate limit the platform enforces,
// where one long run doing the same work is a rate limit we would have to write
// ourselves and get right across every crash and redeploy.
// ---------------------------------------------------------------------------

/**
 * Start a sweep. Fired by the cron on its own schedule, and by an Arena admin
 * from the rate-sweep screen.
 */
export const rateSweepRequested = eventType("rates/sweep.requested", {
  schema: z.object({
    /** Clerk userId for a manual run, omitted for the cron. */
    requestedByUserId: z.string().optional(),
    /**
     * Restricts the sweep to these vendors. Used by the admin re-run button
     * after one vendor's credentials are fixed, so a repair costs 600 calls
     * rather than 2,400. Omitted means every registered vendor.
     */
    vendorIds: z.array(z.string()).optional(),
  }),
});

/** One vendor against one country: thirty weight slabs, paced. */
export const rateSweepLaneRequested = eventType("rates/sweep.lane.requested", {
  schema: z.object({
    runId: z.string(),
    vendorId: z.string(),
    /** ISO alpha-2. The lane resolves the rest from lib/rateSweep/config.ts. */
    countryCode: z.string(),
  }),
});

/**
 * Close a run out.
 *
 * Sent by whichever lane happens to finish last, and by the planner's backstop
 * if the counter never gets there. Both paths are expected and the finalise
 * function is safe to run twice, which is why this is an event rather than a
 * call at the end of the lane: two lanes racing to finalise would be a bug, two
 * events arriving is just idempotency doing its job.
 */
export const rateSweepFinaliseRequested = eventType(
  "rates/sweep.finalise.requested",
  {
    schema: z.object({
      runId: z.string(),
      /** True when the planner gave up waiting rather than the last lane reporting. */
      forced: z.boolean().optional(),
    }),
  },
);

export const inngest = new Inngest({
  id: "arena-cargo-logistics",

  // Every server action in this codebase reports to Sentry; background work
  // should not become the blind spot. This attaches function and step context
  // to anything thrown inside a step.
  middleware: [sentryMiddleware()],
});
