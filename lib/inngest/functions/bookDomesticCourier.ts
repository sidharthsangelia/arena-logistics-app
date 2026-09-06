/**
 * lib/inngest/functions/bookDomesticCourier.ts
 *
 * Turns a paid domestic booking into a waybill: register the pickup point,
 * push the order, assign the courier the customer paid for, schedule the
 * pickup, then fetch the label and file it against the shipment.
 *
 * ── WHY THIS IS DURABLE AND NOT A SERVER ACTION ─────────────────────────────
 * Five vendor calls, any of which can fail on its own. Run inline in the
 * booking action, one flaky call would either fail a booking the customer has
 * already paid for, or leave a half-created order behind with no record of how
 * far it got. Here each call is a step: the state between them is persisted, a
 * retry resumes at the first thing that has not succeeded, and a booking that
 * cannot be placed at all ends as a flagged row rather than a lost parcel.
 *
 * ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
 * Three layers, because the expensive mistake here is a SECOND parcel.
 *
 *   1. Steps memoise. A retry after the order was pushed resumes at the assign.
 *   2. Every external id is written to the shipment the moment the vendor
 *      returns it, so even a completely fresh run reuses the warehouse and
 *      order that already exist instead of creating more.
 *   3. Before re-pushing after a failed attempt, the adapter is asked whether
 *      the vendor already holds an order under our reference. This is the one
 *      case layers 1 and 2 cannot cover: the push landed and the response was
 *      lost, so nothing was written on our side.
 *
 * Together they mean this function is safe to invoke by hand, which is exactly
 * what the ops retry button does.
 * ────────────────────────────────────────────────────────────────────────────
 */

import * as Sentry from "@sentry/nextjs";
import { NonRetriableError } from "inngest";

import {
  DomesticCourierStatus,
  ShipmentDocType,
  ShipmentMode,
  ShipmentStatus,
} from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { BookingAdapterError } from "@/lib/booking-adapters/core/base.booking.adapter";
import type { CanonicalBookingRequest } from "@/lib/booking-adapters/core/types";
import { resolveBookingAdapter } from "@/lib/booking-adapters/vendors/domestic.booking.index";
import {
  DOMESTIC_COURIER_SHIPMENT_SELECT,
  DomesticBookingDataError,
  buildDomesticBookingRequest,
} from "@/lib/booking/domesticCourier";
import { resolveExactCourierId } from "@/lib/booking/domesticCourierResolve";
import { uploadLabel } from "@/lib/booking/labelStorage";
import { announceAwbReady } from "@/lib/booking/awbAnnounce";
import {
  fileArenaLabelDocument,
  renderArenaLabelForShipment,
  uploadArenaLabel,
} from "@/lib/labels/awb/filing";
import { notifyCourierBookingFailed } from "@/lib/notifications/emit";

import {
  domesticCourierRequested,
  domesticCourierRetryRequested,
  inngest,
} from "../client";

// ---------------------------------------------------------------------------

interface PreparedBooking {
  request: CanonicalBookingRequest;
  vendorId: string;
  orgName: string;
  /** Ids already held from an earlier attempt. Null means "not done yet". */
  pickupPointId: string | null;
  vendorOrderId: string | null;
  awbNumber: string | null;
  labelDocumentId: string | null;
  /** Arena's own rendering of the same waybill, if it has been filed already. */
  arenaLabelDocumentId: string | null;
}

/**
 * Load the shipment, refuse the ones that must not be booked, and mark the
 * attempt.
 *
 * Everything thrown here is permanent by construction: a shipment that is not
 * domestic will not become domestic, and a vendor with no booking adapter will
 * not grow one during a retry. Marking the attempt in the same query keeps the
 * counter honest even when the run dies immediately afterwards.
 */
async function prepareBooking(shipmentId: string): Promise<PreparedBooking> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: DOMESTIC_COURIER_SHIPMENT_SELECT,
  });

  if (!shipment) {
    throw new NonRetriableError(
      `Shipment ${shipmentId} no longer exists; nothing to book.`,
    );
  }
  if (shipment.mode !== ShipmentMode.DOMESTIC) {
    throw new NonRetriableError(
      `Shipment ${shipment.shipmentNumber} is international. Its carrier booking is placed by ops, not here.`,
    );
  }
  if (
    shipment.status === ShipmentStatus.DRAFT ||
    shipment.status === ShipmentStatus.PENDING_PAYMENT
  ) {
    throw new NonRetriableError(
      `Shipment ${shipment.shipmentNumber} is not booked yet; no courier order should exist for it.`,
    );
  }
  if (shipment.status === ShipmentStatus.CANCELLED) {
    throw new NonRetriableError(
      `Shipment ${shipment.shipmentNumber} is cancelled; booking a courier for it would send a parcel nobody expects.`,
    );
  }

  let request: CanonicalBookingRequest;
  try {
    request = buildDomesticBookingRequest(shipment);
  } catch (err) {
    if (err instanceof DomesticBookingDataError) {
      throw new NonRetriableError(err.message);
    }
    throw err;
  }

  const adapter = resolveBookingAdapter(request.service.vendorId);
  if (!adapter) {
    throw new NonRetriableError(
      `No booking integration exists for vendor "${request.service.vendorId}". This booking has to be placed by hand.`,
    );
  }
  if (!adapter.isConfigured()) {
    // The adapter names the missing setting when it can. "API credentials are
    // not configured" is the wrong sentence for a vendor whose gap is something
    // else, and it sends ops to re-check a login that was never the problem.
    const gap = adapter.configurationGap();
    throw new NonRetriableError(
      gap
        ? `${adapter.vendorName} cannot book: ${gap}`
        : `${adapter.vendorName} API credentials are not configured on the server.`,
    );
  }

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      domesticCourierVendorId: adapter.vendorId,
      // PENDING unless it is already done: a retry of the label step alone must
      // not walk a BOOKED order back to PENDING.
      domesticCourierStatus: shipment.domesticAwbNumber
        ? DomesticCourierStatus.BOOKED
        : DomesticCourierStatus.PENDING,
      domesticCourierAttempts: { increment: 1 },
      // Cleared so the error on the row always describes the run in progress.
      domesticCourierError: null,
    },
  });

  return {
    request,
    vendorId: adapter.vendorId,
    orgName: shipment.org.name,
    pickupPointId: shipment.domesticCourierWarehouseId,
    vendorOrderId: shipment.domesticCourierOrderId,
    awbNumber: shipment.domesticAwbNumber,
    labelDocumentId: shipment.domesticLabelDocumentId,
    arenaLabelDocumentId: shipment.arenaLabelDocumentId,
  };
}

/** Adapter lookup for the steps that follow, with the same refusal as above. */
function requireAdapter(vendorId: string) {
  const adapter = resolveBookingAdapter(vendorId);
  if (!adapter) {
    throw new NonRetriableError(
      `Booking adapter "${vendorId}" is no longer registered.`,
    );
  }
  return adapter;
}

/**
 * Adapter failures the adapter itself has judged permanent become permanent
 * here. Everything else is left to Inngest's backoff.
 */
function rethrowAsInngestError(err: unknown): never {
  if (err instanceof BookingAdapterError && !err.retriable) {
    throw new NonRetriableError(err.message);
  }
  throw err;
}

// ---------------------------------------------------------------------------

export const bookDomesticCourier = inngest.createFunction(
  {
    id: "book-domestic-courier",
    name: "Book domestic courier and fetch AWB label",

    // The automatic path and the ops re-drive, one body. Both are safe to run
    // against a shipment that is already part-way through.
    triggers: [domesticCourierRequested, domesticCourierRetryRequested],

    concurrency: [
      // The one that matters. An automatic booking and an impatient ops retry
      // arriving together must not race into two orders for one parcel.
      { limit: 1, key: "event.data.shipmentId" },
      // And a burst of bookings must not turn into a burst at the vendor.
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
        tags: { location: "bookDomesticCourier", shipmentId },
      });

      // The money stays where it is. A courier that would not take the order is
      // not the same as a booking the customer no longer wants, and refunding
      // on a failed API call would be guessing at which. Ops decide.
      const shipment = await prisma.shipment
        .update({
          where: { id: shipmentId },
          data: {
            domesticCourierStatus: DomesticCourierStatus.FAILED,
            domesticCourierError: reason,
          },
          select: { org: { select: { name: true } } },
        })
        .catch(() => null);

      await notifyCourierBookingFailed({
        shipmentId,
        shipmentNumber,
        orgName: shipment?.org.name ?? "a customer",
        reason,
      }).catch(() => {
        // Sentry already has the original failure; a notification that cannot
        // be written must not mask it.
      });
    },
  },

  async ({ event, step, logger, attempt }) => {
    const { shipmentId, shipmentNumber, orgId } = event.data;
    const allowAutoAssign = event.data.allowAutoAssign === true;

    // ── 1. What are we booking, and how far did we get last time? ───────────
    const prepared = await step.run("prepare-booking", () =>
      prepareBooking(shipmentId),
    );

    const alreadyBooked = Boolean(prepared.awbNumber);

    /**
     * Arena's own label for the waybill the courier issued.
     *
     * BEST EFFORT, DELIBERATELY. Three steps that report their own failures and
     * never throw (see lib/labels/awb/filing.ts), so nothing in here can fail a
     * run that has already taken money, placed the order and been given a
     * waybill. If it does not get filed, the customer still has the courier's
     * label, and this one is still rendered on demand by
     * GET /api/labels/<shipmentId> and filed by the next re-drive.
     *
     * A closure rather than a helper because it runs from two places — the
     * already-booked early return below and the end of a fresh booking — and it
     * must use the same step ids in both. It runs at most once per run, so
     * those ids stay unique.
     */
    const fileArenaLabel = async (): Promise<void> => {
      if (prepared.arenaLabelDocumentId) return;

      // The waybill is read from the shipment row rather than passed in, because
      // on a fresh booking `prepared` predates the assign step that wrote it. A
      // row with no AWB yet comes back as a refusal, not a blank barcode.
      const rendered = await step.run("render-arena-label", () =>
        renderArenaLabelForShipment(shipmentId),
      );

      if (!rendered.ok) {
        logger.warn(
          `Arena label not rendered for ${shipmentNumber}: ${rendered.reason}`,
        );
        return;
      }

      const uploaded = await step.run("upload-arena-label", () =>
        uploadArenaLabel({
          shipmentId,
          base64: rendered.base64,
          fileName: rendered.fileName,
          mimeType: rendered.mimeType,
        }),
      );

      if (!uploaded.ok) {
        logger.warn(
          `Arena label not stored for ${shipmentNumber}: ${uploaded.reason}`,
        );
        return;
      }

      const filed = await step.run("save-arena-label-document", () =>
        fileArenaLabelDocument({
          shipmentId,
          awbNumber: rendered.awbNumber,
          stored: uploaded.stored,
        }),
      );

      if (!filed.ok) {
        logger.warn(
          `Arena label not filed for ${shipmentNumber}: ${filed.reason}`,
        );
      }
    };

    if (alreadyBooked && prepared.labelDocumentId) {
      logger.info(
        `Shipment ${prepared.request.displayReference} already has AWB ${prepared.awbNumber} and its label. Nothing to book.`,
      );

      // The vendor's label is filed, but ours may not be: this shipment may
      // predate it, or an earlier run may have failed here. Cheap to attempt
      // and a no-op once it exists.
      await fileArenaLabel();

      // Still announced. This run may be a retry of one that died after filing
      // the label but before telling the customer, and the announcement is
      // idempotent on its own notification ledger.
      await step.run("announce-awb", () =>
        announceDomesticAwb({ shipmentId, orgId, shipmentNumber }),
      );

      return { booked: true, awbNumber: prepared.awbNumber, skipped: true };
    }

    // ── 2. The exact service the customer paid for ──────────────────────────
    //
    // Resolved BEFORE anything is created at the vendor, so we never leave an
    // order behind that we would then refuse to assign.
    let courierId: string | null = null;

    if (!alreadyBooked) {
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

      courierId = resolved.courierId;

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
    }

    // ── 3. Pickup point ─────────────────────────────────────────────────────
    let pickupPointId = prepared.pickupPointId;

    if (!alreadyBooked && !pickupPointId) {
      const registered = await step.run("register-pickup-point", async () => {
        const adapter = requireAdapter(prepared.vendorId);
        try {
          const result = await adapter.ensurePickupPoint(prepared.request);

          // Written immediately. A crash between here and the push must not
          // cost a second pickup point at the vendor.
          if (result.pickupPointId) {
            await prisma.shipment.update({
              where: { id: shipmentId },
              data: { domesticCourierWarehouseId: result.pickupPointId },
            });
          }

          return result;
        } catch (err) {
          rethrowAsInngestError(err);
        }
      });

      pickupPointId = registered.pickupPointId;
    }

    // ── 4. The order ────────────────────────────────────────────────────────
    let vendorOrderId = prepared.vendorOrderId;

    if (!alreadyBooked && !vendorOrderId) {
      const created = await step.run("create-order", async () => {
        const adapter = requireAdapter(prepared.vendorId);

        // Only on a retry, and only then: this is a round trip that exists
        // solely to catch a push whose response we lost.
        if (attempt > 0) {
          const existing = await adapter.findExistingOrder(
            prepared.request.reference,
          );
          if (existing) {
            await prisma.shipment.update({
              where: { id: shipmentId },
              data: {
                domesticCourierOrderId: existing.vendorOrderId,
                domesticCourierBookedAt: new Date(),
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
              domesticCourierOrderId: result.vendorOrderId,
              domesticCourierBookedAt: new Date(),
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
        "No courier order id is on file for this shipment, and none was created.",
      );
    }

    // ── 5. The waybill ──────────────────────────────────────────────────────
    let awbNumber = prepared.awbNumber;

    if (!awbNumber) {
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

        // The waybill and the timeline entry land together: a shipment showing
        // an AWB with no history of where it came from is what makes a support
        // call take twenty minutes.
        await prisma.$transaction([
          prisma.shipment.update({
            where: { id: shipmentId },
            data: {
              domesticAwbNumber: result.awbNumber,
              domesticCourierName: result.courierName,
              domesticTrackingUrl: result.trackingUrl ?? undefined,
              domesticCourierStatus: DomesticCourierStatus.BOOKED,
              domesticCourierError: null,
            },
          }),
          prisma.shipmentStatusEvent.create({
            data: {
              shipmentId,
              // Not a status change. The parcel has not moved; we simply hold
              // a waybill for it now.
              fromStatus: ShipmentStatus.BOOKED,
              toStatus: ShipmentStatus.BOOKED,
              note: `Courier booked. AWB ${result.awbNumber}${
                result.courierName ? ` (${result.courierName})` : ""
              }${courierId ? "" : ". Courier auto-assigned."}`,
              changedByType: "SYSTEM",
            },
          }),
        ]);

        return result;
      });

      awbNumber = assigned.awbNumber;

      // ── 6. The physical pickup ────────────────────────────────────────────
      //
      // Best effort, and swallowed on purpose. Several vendors schedule on
      // assign and treat a second request as an error, and none of them will
      // un-book an order because this failed. Failing the run here would
      // re-enter it holding an AWB it can no longer use.
      const waybillForPickup = assigned.awbNumber;
      const pickupPointForPickup = pickupPointId;

      await step.run("schedule-pickup", async () => {
        const adapter = requireAdapter(prepared.vendorId);
        try {
          // The whole booking, not just the order id: vendors disagree about
          // what a pickup hangs off. Shipmozo attaches it to the order,
          // SpeedoPost to a warehouse and a carrier. See SchedulePickupInput.
          await adapter.schedulePickup({
            vendorOrderId: orderId,
            awbNumber: waybillForPickup,
            pickupPointId: pickupPointForPickup,
            courierId,
            request: prepared.request,
          });
          return { scheduled: true };
        } catch (err) {
          Sentry.captureException(err, {
            level: "warning",
            tags: { location: "bookDomesticCourier:schedulePickup", shipmentId },
          });
          return { scheduled: false };
        }
      });
    }

    // ── 7. The label ────────────────────────────────────────────────────────
    //
    // Fetch, store and file are three steps for the same reason the invoice job
    // splits render from upload: they fail for unrelated reasons, and a retry
    // should not redo the parts that worked. The customer's booking is already
    // complete at this point — this is the piece that lets them print it.
    if (!prepared.labelDocumentId) {
      const waybill = awbNumber;

      const fetched = await step.run("fetch-label", async () => {
        const adapter = requireAdapter(prepared.vendorId);
        try {
          const label = await adapter.fetchLabel({
            vendorOrderId,
            awbNumber: waybill,
          });
          // Step output crosses a JSON boundary, so the bytes travel as base64.
          // A waybill is one page and comes to tens of kilobytes.
          return {
            base64: Buffer.from(label.bytes).toString("base64"),
            mimeType: label.mimeType,
            fileName: label.fileName,
          };
        } catch (err) {
          rethrowAsInngestError(err);
        }
      });

      const stored = await step.run("upload-label", () =>
        uploadLabel({
          bytes: Uint8Array.from(Buffer.from(fetched.base64, "base64")),
          fileName: fetched.fileName,
          mimeType: fetched.mimeType,
        }),
      );

      await step.run("save-label-document", async () => {
        const document = await prisma.shipmentDocument.create({
          data: {
            shipmentId,
            docType: ShipmentDocType.AIRWAY_BILL,
            label: `Shipping label (AWB ${waybill})`,
            fileUrl: stored.fileUrl,
            fileKey: stored.fileKey,
            fileName: stored.fileName,
            fileSize: stored.fileSize,
            mimeType: stored.mimeType,
            // The customer paid for this shipment; the label is theirs to
            // print. Vendor masking covers international rates only.
            visibleToClient: true,
            uploadedByType: "SYSTEM",
          },
          select: { id: true },
        });

        await prisma.shipment.update({
          where: { id: shipmentId },
          data: { domesticLabelDocumentId: document.id },
        });

        return { documentId: document.id };
      });
    }

    // ── 8. Arena's own label for the same waybill ───────────────────────────
    //
    // After the vendor's, and never in place of it: the courier's label is the
    // one their network was built around, and ours is filed beside it so both
    // can be printed and compared. Same AWB, same barcode. Best effort by
    // construction — see the closure at the top of this handler.
    await fileArenaLabel();

    // ── Tell the customer ───────────────────────────────────────────────────
    //
    // The booking confirmation email promised the waybill "as soon as it is
    // issued". This is where that promise is kept: an in-app notification and an
    // email with the label attached. Its own step, after the label is filed, so
    // the customer is never told about a document that is not there yet.
    await step.run("announce-awb", () =>
      announceDomesticAwb({ shipmentId, orgId, shipmentNumber }),
    );

    return { booked: true, awbNumber, skipped: false };
  },
);

// ---------------------------------------------------------------------------

/**
 * Read the waybill and its label off the row, then tell the customer.
 *
 * The domestic twin of announceIntlAwb in bookInternationalCarrier.ts, and split
 * the same way: the shared half — send once, attach the label, never throw —
 * lives in lib/booking/awbAnnounce.ts, and only the column names differ here.
 *
 * Reads from the database rather than taking values from step output, because
 * this runs on two paths: a fresh booking that has just filed its label, and a
 * re-drive of a shipment that already had one. The row is what both agree on.
 */
async function announceDomesticAwb(input: {
  shipmentId: string;
  orgId: string;
  shipmentNumber: string;
}) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: input.shipmentId },
    select: {
      domesticAwbNumber: true,
      domesticCourierName: true,
      domesticTrackingUrl: true,
      domesticLabelDocumentId: true,
      arenaLabelDocumentId: true,
    },
  });

  if (!shipment?.domesticAwbNumber) return { announced: false, emailed: false };

  // Both labels ride along, the courier's first. Order is the message: the one
  // at the top of the attachment list is the one to put on the parcel.
  const documentIds = [
    shipment.domesticLabelDocumentId,
    shipment.arenaLabelDocumentId,
  ].filter((id): id is string => Boolean(id));

  const labels = documentIds.length
    ? await prisma.shipmentDocument
        .findMany({
          where: { id: { in: documentIds } },
          select: { id: true, fileUrl: true, fileName: true },
        })
        // findMany does not promise the order of an `in`, and here the order is
        // meaningful, so it is restored from the ids rather than assumed.
        .then((rows) =>
          documentIds
            .map((id) => rows.find((row) => row.id === id))
            .filter((row) => Boolean(row?.fileUrl && row.fileName))
            .map((row) => ({ fileUrl: row!.fileUrl, fileName: row!.fileName })),
        )
    : [];

  return announceAwbReady({
    shipmentId: input.shipmentId,
    orgId: input.orgId,
    shipmentNumber: input.shipmentNumber,
    awbNumber: shipment.domesticAwbNumber,
    carrierName: shipment.domesticCourierName,
    trackingUrl: shipment.domesticTrackingUrl,
    labels,
  });
}

// ---------------------------------------------------------------------------

/**
 * Emitted by the booking action once a DOMESTIC shipment commits. Kept next to
 * the function that consumes it so the two are read together.
 *
 * The `id` makes it idempotent inside Inngest's 24-hour dedupe window: a
 * booking action whose tail somehow runs twice cannot queue two courier
 * bookings for one parcel.
 */
export function domesticCourierRequestedEvent(input: {
  shipmentId: string;
  shipmentNumber: string;
  orgId: string;
}) {
  return domesticCourierRequested.create(input, {
    id: `domestic-courier-${input.shipmentId}`,
  });
}
