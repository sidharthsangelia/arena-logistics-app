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

export const inngest = new Inngest({
  id: "arena-cargo-logistics",

  // Every server action in this codebase reports to Sentry; background work
  // should not become the blind spot. This attaches function and step context
  // to anything thrown inside a step.
  middleware: [sentryMiddleware()],
});
