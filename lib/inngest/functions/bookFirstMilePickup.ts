/**
 * lib/inngest/functions/bookFirstMilePickup.ts
 *
 * Books the door → hub courier for an international shipment whose customer
 * bought Arena's first-mile pickup.
 *
 * ── WHY THIS RUNS AFTER THE EXPORT IS BOOKED ────────────────────────────────
 * It is triggered by shipment/first-mile.requested, which the international
 * booking function sends once it holds a waybill — not by the booking action at
 * payment. A parcel collected from a customer's door for an export that then
 * cannot be placed is a parcel sitting in a hub with nowhere to go, and somebody
 * has to drive it back. Booking the carrier first costs a few minutes and means
 * a collection only ever happens for a consignment that has a waybill waiting.
 *
 * ── WHY IT REUSES THE DOMESTIC ADAPTERS ─────────────────────────────────────
 * A first-mile pickup IS a domestic forward order: India → India, door to a
 * warehouse we happen to own. So it goes through the same BaseBookingAdapter,
 * the same registry and the same resolveExactCourierId as bookDomesticCourier,
 * with only the request builder differing (lib/booking/firstMileBooking.ts).
 * The ops action this replaces had all of that logic inlined a second time,
 * which is how the two drifted.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 * No label. The first-mile waybill is an internal movement between the
 * customer's door and our own hub; the label the customer prints is the export
 * one, filed by bookInternationalCarrier. Fetching a second label here would put
 * a document on their shipment page that means nothing to them.
 * ────────────────────────────────────────────────────────────────────────────
 */

import * as Sentry from "@sentry/nextjs";
import { NonRetriableError } from "inngest";

import { FirstMileStatus, ShipmentStatus } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { BookingAdapterError } from "@/lib/booking-adapters/core/base.booking.adapter";
import type { CanonicalBookingRequest } from "@/lib/booking-adapters/core/types";
import { resolveBookingAdapter } from "@/lib/booking-adapters/vendors/domestic.booking.index";
import { resolveExactCourierId } from "@/lib/booking/domesticCourierResolve";
import {
  FIRST_MILE_SHIPMENT_SELECT,
  FirstMileDataError,
  buildFirstMileBookingRequest,
} from "@/lib/booking/firstMileBooking";
import { notifyFirstMileBookingFailed } from "@/lib/notifications/emit";

import { firstMileRequested, firstMileRetryRequested, inngest } from "../client";

// ---------------------------------------------------------------------------

interface PreparedFirstMile {
  request: CanonicalBookingRequest;
  vendorId: string;
  orgName: string;
  pickupPointId: string | null;
  vendorOrderId: string | null;
  awbNumber: string | null;
}

async function prepareFirstMile(shipmentId: string): Promise<PreparedFirstMile> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: FIRST_MILE_SHIPMENT_SELECT,
  });

  if (!shipment) {
    throw new NonRetriableError(
      `Shipment ${shipmentId} no longer exists; nothing to collect.`,
    );
  }
  if (!shipment.pickupIncluded) {
    throw new NonRetriableError(
      `Shipment ${shipment.shipmentNumber} does not include door pickup.`,
    );
  }
  if (shipment.status === ShipmentStatus.CANCELLED) {
    throw new NonRetriableError(
      `Shipment ${shipment.shipmentNumber} is cancelled; collecting it would send a courier to a door for nothing.`,
    );
  }

  let request: CanonicalBookingRequest;
  try {
    request = buildFirstMileBookingRequest(shipment);
  } catch (err) {
    if (err instanceof FirstMileDataError) {
      throw new NonRetriableError(err.message);
    }
    throw err;
  }

  const adapter = resolveBookingAdapter(request.service.vendorId);
  if (!adapter) {
    throw new NonRetriableError(
      `No booking integration exists for first-mile vendor "${request.service.vendorId}". This pickup has to be arranged by hand.`,
    );
  }
  if (!adapter.isConfigured()) {
    throw new NonRetriableError(
      `${adapter.vendorName} API credentials are not configured on the server.`,
    );
  }

  return {
    request,
    vendorId: adapter.vendorId,
    orgName: shipment.org.name,
    pickupPointId: shipment.firstMileShipmozoWarehouseId,
    vendorOrderId: shipment.firstMileShipmozoOrderId,
    awbNumber: shipment.firstMileTrackingNumber,
  };
}

function requireAdapter(vendorId: string) {
  const adapter = resolveBookingAdapter(vendorId);
  if (!adapter) {
    throw new NonRetriableError(
      `Booking adapter "${vendorId}" is no longer registered.`,
    );
  }
  return adapter;
}

function rethrowAsInngestError(err: unknown): never {
  if (err instanceof BookingAdapterError && !err.retriable) {
    throw new NonRetriableError(err.message);
  }
  throw err;
}

// ---------------------------------------------------------------------------

export const bookFirstMilePickup = inngest.createFunction(
  {
    id: "book-first-mile-pickup",
    name: "Book the door to hub first-mile pickup",

    triggers: [firstMileRequested, firstMileRetryRequested],

    concurrency: [
      // An automatic release and an impatient ops retry must not race into two
      // couriers arriving at one customer's door.
      { limit: 1, key: "event.data.shipmentId" },
      { limit: 5 },
    ],

    retries: 4,

    onFailure: async ({ event, error }) => {
      const { shipmentId, shipmentNumber } = event.data.event.data as {
        shipmentId: string;
        shipmentNumber: string;
      };
      const reason = String(error?.message ?? error).slice(0, 500);

      Sentry.captureException(error, {
        tags: { location: "bookFirstMilePickup", shipmentId },
      });

      // The first-mile status is deliberately NOT walked back from SCHEDULED.
      // The customer bought a collection and is still owed one; ops arranging
      // it by phone is a perfectly good outcome, and a status saying otherwise
      // would hide the shipment from the queue that gets it done.
      const shipment = await prisma.shipment
        .findUnique({
          where: { id: shipmentId },
          select: { org: { select: { name: true } } },
        })
        .catch(() => null);

      await notifyFirstMileBookingFailed({
        shipmentId,
        shipmentNumber,
        orgName: shipment?.org.name ?? "a customer",
        reason,
      }).catch(() => {
        // Sentry already has the original failure.
      });
    },
  },

  async ({ event, step, logger, attempt }) => {
    const { shipmentId } = event.data;
    const allowAutoAssign = event.data.allowAutoAssign === true;

    const prepared = await step.run("prepare-first-mile", () =>
      prepareFirstMile(shipmentId),
    );

    if (prepared.awbNumber) {
      logger.info(
        `Shipment ${prepared.request.displayReference} already has first-mile AWB ${prepared.awbNumber}. Nothing to do.`,
      );
      return { booked: true, awb: prepared.awbNumber, skipped: true };
    }

    // ── The exact courier the customer paid for ─────────────────────────────
    //
    // Resolved BEFORE anything is created at the vendor, so we never leave an
    // order behind that we would then refuse to assign.
    const resolved = await step.run("resolve-courier", async () => {
      const id = await resolveExactCourierId({
        vendorId: prepared.vendorId,
        productName: prepared.request.service.productName ?? null,
        snapshotCourierId: prepared.request.service.courierId ?? null,
        origin: {
          city: prepared.request.pickup.city,
          pincode: prepared.request.pickup.postalCode,
          line1: prepared.request.pickup.line1,
        },
        destination: {
          city: prepared.request.delivery.city,
          pincode: prepared.request.delivery.postalCode,
          line1: prepared.request.delivery.line1,
        },
        packages: prepared.request.parcels.map((p) => ({
          ...p,
          declaredValue:
            prepared.request.declaredValue / prepared.request.parcels.length,
        })),
      });
      return { courierId: id };
    });

    const courierId = resolved.courierId;

    if (!courierId && !allowAutoAssign) {
      // Deliberately terminal. The customer bought a named service; putting
      // their parcel on whatever is cheapest today is a commercial decision,
      // and ops can make it explicitly with the retry button.
      throw new NonRetriableError(
        `Could not confirm the courier the customer paid for${
          prepared.request.service.productName
            ? ` (${prepared.request.service.productName})`
            : ""
        }. It may no longer be offered on this route. Retry with auto-assign only if that is acceptable.`,
      );
    }

    // ── Pickup point ────────────────────────────────────────────────────────
    let pickupPointId = prepared.pickupPointId;

    if (!pickupPointId) {
      const registered = await step.run("register-pickup-point", async () => {
        const adapter = requireAdapter(prepared.vendorId);
        try {
          const result = await adapter.ensurePickupPoint(prepared.request);

          // Written immediately. A crash between here and the push must not
          // cost a second pickup point at the vendor.
          if (result.pickupPointId) {
            await prisma.shipment.update({
              where: { id: shipmentId },
              data: { firstMileShipmozoWarehouseId: result.pickupPointId },
            });
          }

          return result;
        } catch (err) {
          rethrowAsInngestError(err);
        }
      });

      pickupPointId = registered.pickupPointId;
    }

    // ── The order ───────────────────────────────────────────────────────────
    let vendorOrderId = prepared.vendorOrderId;

    if (!vendorOrderId) {
      const created = await step.run("create-order", async () => {
        const adapter = requireAdapter(prepared.vendorId);

        // Only on a retry: a round trip that exists solely to catch a push
        // whose response we lost.
        if (attempt > 0) {
          const existing = await adapter
            .findExistingOrder(prepared.request.reference)
            .catch(() => null);

          if (existing) {
            await prisma.shipment.update({
              where: { id: shipmentId },
              data: {
                firstMileShipmozoOrderId: existing.vendorOrderId,
                firstMileBookedAt: new Date(),
              },
            });
            return { vendorOrderId: existing.vendorOrderId, recovered: true };
          }
        }

        try {
          const result = await adapter.createOrder(
            prepared.request,
            pickupPointId,
          );

          await prisma.shipment.update({
            where: { id: shipmentId },
            data: {
              firstMileShipmozoOrderId: result.vendorOrderId,
              firstMileBookedAt: new Date(),
            },
          });

          return { vendorOrderId: result.vendorOrderId, recovered: false };
        } catch (err) {
          rethrowAsInngestError(err);
        }
      });

      vendorOrderId = created.vendorOrderId;
    }

    if (!vendorOrderId) {
      throw new NonRetriableError(
        "No first-mile order id is on file for this shipment, and none was created.",
      );
    }

    // ── The waybill ─────────────────────────────────────────────────────────
    const orderId = vendorOrderId;

    const assigned = await step.run("assign-courier", async () => {
      const adapter = requireAdapter(prepared.vendorId);

      let result;
      try {
        result = await adapter.assignCarrier({
          vendorOrderId: orderId,
          courierId,
        });
      } catch (err) {
        rethrowAsInngestError(err);
      }

      await prisma.$transaction([
        prisma.shipment.update({
          where: { id: shipmentId },
          data: {
            firstMileTrackingNumber: result.awbNumber,
            firstMileTrackingUrl: result.trackingUrl ?? undefined,
            // The leg is now genuinely scheduled with a courier rather than
            // merely intended, which is what this status has meant since the
            // booking committed.
            firstMileStatus: FirstMileStatus.SCHEDULED,
            firstMileStatusUpdatedAt: new Date(),
          },
        }),
        prisma.shipmentStatusEvent.create({
          data: {
            shipmentId,
            // Not a status change: the parcel has not moved, we simply hold a
            // waybill for its first leg.
            fromStatus: ShipmentStatus.BOOKED,
            toStatus: ShipmentStatus.BOOKED,
            note: `Door pickup booked. AWB ${result.awbNumber}${
              result.courierName ? ` (${result.courierName})` : ""
            }${courierId ? "" : ". Courier auto-assigned."}`,
            changedByType: "SYSTEM",
          },
        }),
      ]);

      return result;
    });

    // ── The physical pickup ─────────────────────────────────────────────────
    //
    // Best effort, and swallowed on purpose. Several vendors schedule on assign
    // and treat a second request as an error, and none of them will un-book an
    // order because this failed. Failing the run here would re-enter it holding
    // an AWB it can no longer use.
    await step.run("schedule-pickup", async () => {
      const adapter = requireAdapter(prepared.vendorId);
      try {
        await adapter.schedulePickup(orderId);
        return { scheduled: true };
      } catch (err) {
        Sentry.captureException(err, {
          level: "warning",
          tags: { location: "bookFirstMilePickup:schedulePickup", shipmentId },
        });
        return { scheduled: false };
      }
    });

    return { booked: true, awb: assigned.awbNumber, skipped: false };
  },
);
