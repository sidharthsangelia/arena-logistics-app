/**
 * lib/inngest/functions/bookInternationalCarrier.ts
 *
 * Turns a paid international booking into a waybill: check the export is
 * placeable at all, identify the exact service the customer bought, register the
 * exporter, push the booking, get the waybill, then file the label against the
 * shipment and release the first-mile pickup.
 *
 * ── WHY THIS IS DURABLE AND NOT A SERVER ACTION ─────────────────────────────
 * Up to six vendor calls, any of which can fail on its own. Run inline in the
 * booking action, one flaky call would either fail a booking the customer has
 * already paid for, or leave a half-created export behind with no record of how
 * far it got. Here each call is a step: the state between them is persisted, a
 * retry resumes at the first thing that has not succeeded, and a booking that
 * cannot be placed at all ends as a flagged row rather than a lost consignment.
 *
 * ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
 * Three layers, because the expensive mistake here is a SECOND export.
 *
 *   1. Steps memoise. A retry after the booking was pushed resumes at the label.
 *   2. Every external id is written to the shipment the moment the vendor
 *      returns it, so even a completely fresh run reuses the shipper and
 *      booking that already exist instead of creating more.
 *   3. Before re-pushing after a failed attempt, the adapter is asked whether
 *      the vendor already holds a booking under our reference. This is the one
 *      case layers 1 and 2 cannot cover: the push landed and the response was
 *      lost, so nothing was written on our side.
 *
 * Layer 3 is best-effort and vendor-dependent: sKart publishes no lookup, which
 * is exactly why its adapter refuses to retry an ambiguous create at all (see
 * the note on `call` in skart.booking.adapter.ts). Between the two mechanisms,
 * no vendor is ever asked twice for the same consignment.
 *
 * Together they mean this function is safe to invoke by hand, which is exactly
 * what the ops retry button does.
 *
 * ── WHY THERE IS NO AUTO-ASSIGN ─────────────────────────────────────────────
 * The domestic job has an `allowAutoAssign` escape hatch: domestic couriers are
 * broadly interchangeable at a given price, so ops can knowingly accept a
 * substitution. International carriers are not. Transit time, duty handling and
 * customs paperwork all differ between DHL, FedEx and Skynet, and the customer
 * chose on those. An unidentifiable service is always a stop here.
 *
 * ── THE WHOLE PIPELINE, AND WHERE TO CHANGE EACH PART ───────────────────────
 * A customer pays for an export, and this is everything that happens after,
 * in order. Start here when something is wrong and you do not yet know where.
 *
 *   customer pays
 *     └─ actions/book/createShipment.action.ts
 *          commits the booking, then sends THREE events. Gated on
 *          INTL_AUTO_BOOK_ENABLED (lib/booking/intlAutoBook.ts) — with it off,
 *          nothing below runs automatically and ops book by hand.
 *          │
 *          ├─ shipment/booked ─────────► generateShipmentInvoice.ts
 *          │     Arena's own tax invoice (PDF + the confirmation email that
 *          │     carries it). Independent of the carrier booking on purpose:
 *          │     one failing must not hold up the other.
 *          │     Change the document → lib/invoices/tax/
 *          │
 *          └─ shipment/intl-carrier.requested ─► THIS FILE
 *                1. prepare      refuse what must not be booked, mark attempt
 *                2. preflight    would the vendor take it? names its own field
 *                3. resolve      the exact service the customer paid for
 *                4. shipper      exporter of record (Shipmozo only)
 *                5. booking      push it; a one-call vendor returns the AWB here
 *                6. assign       the AWB, for vendors that issue it separately
 *                7. documents    fetch, upload, file the label on the shipment
 *                8. announce     notify + email the customer their label
 *                9. release      send the door pickup, now it has somewhere to go
 *                     │
 *                     └─ shipment/first-mile.requested ─► bookFirstMilePickup.ts
 *                          door → hub courier. Reuses the DOMESTIC adapters,
 *                          because that leg is a domestic forward order.
 *
 * WHERE TO CHANGE WHAT
 *   Add a vendor ........... lib/booking-adapters/vendors/<vendor>/ then register
 *                            in vendors/international.booking.index.ts. Nothing
 *                            outside that folder changes. Full recipe in
 *                            core/base.international.adapter.ts.
 *   What we declare ........ lib/booking/internationalCarrier.ts (shipment →
 *                            canonical request) and each vendor's *.mapper.ts
 *                            (canonical → that vendor's payload).
 *   Exporter papers ........ lib/booking/exportProfile.ts (IEC, AD code, LUT)
 *   Retry / cancel by ops .. actions/book/intlCarrierBooking.action.ts, shown by
 *                            components/booking/arena/IntlCarrierPanel.tsx
 *   Customer's email ....... lib/email/shipment/copy.ts (getAwbReadyCopy)
 *   Customer's notification. lib/notifications/emit.ts (notifyAwbReady)
 *   Send-once rule ......... lib/booking/awbAnnounce.ts
 *   Events / retries ....... lib/inngest/client.ts, and the config block below
 * ────────────────────────────────────────────────────────────────────────────
 */

import * as Sentry from "@sentry/nextjs";
import { NonRetriableError } from "inngest";

import {
  IntlBookingStatus,
  type Prisma,
  ShipmentDocType,
  ShipmentMode,
  ShipmentStatus,
} from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { BookingAdapterError } from "@/lib/booking-adapters/core/base.booking.adapter";
import type {
  CanonicalIntlBookingRequest,
  CreatedIntlBooking,
  IntlVendorDocumentRef,
} from "@/lib/booking-adapters/core/intl.types";
import { resolveIntlBookingAdapter } from "@/lib/booking-adapters/vendors/international.booking.index";
import {
  INTL_CARRIER_SHIPMENT_SELECT,
  IntlBookingDataError,
  buildIntlBookingRequest,
  readVendorDocumentRefs,
} from "@/lib/booking/internationalCarrier";
import { announceAwbReady } from "@/lib/booking/awbAnnounce";
import { uploadLabel } from "@/lib/booking/labelStorage";
import { notifyIntlBookingFailed } from "@/lib/notifications/emit";

import {
  firstMileRequested,
  inngest,
  intlCarrierRequested,
  intlCarrierRetryRequested,
} from "../client";

// ---------------------------------------------------------------------------

interface PreparedIntlBooking {
  request: CanonicalIntlBookingRequest;
  vendorId: string;
  orgName: string;
  pickupIncluded: boolean;
  /** Ids already held from an earlier attempt. Null means "not done yet". */
  shipperId: string | null;
  vendorOrderId: string | null;
  awbNumber: string | null;
  labelDocumentId: string | null;
  /** Document URLs the vendor returned at booking, recovered from the row. */
  documentRefs: IntlVendorDocumentRef[];
}

/**
 * Load the shipment, refuse the ones that must not be booked, and mark the
 * attempt.
 *
 * Everything thrown here is permanent by construction: a shipment that is not
 * international will not become international, and a vendor with no booking
 * adapter will not grow one during a retry. Marking the attempt in the same
 * query keeps the counter honest even when the run dies immediately afterwards.
 */
async function prepareBooking(shipmentId: string): Promise<PreparedIntlBooking> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: INTL_CARRIER_SHIPMENT_SELECT,
  });

  if (!shipment) {
    throw new NonRetriableError(
      `Shipment ${shipmentId} no longer exists; nothing to book.`,
    );
  }
  if (shipment.mode !== ShipmentMode.INTERNATIONAL) {
    throw new NonRetriableError(
      `Shipment ${shipment.shipmentNumber} is domestic. Its courier booking is placed by bookDomesticCourier, not here.`,
    );
  }
  if (
    shipment.status === ShipmentStatus.DRAFT ||
    shipment.status === ShipmentStatus.PENDING_PAYMENT
  ) {
    throw new NonRetriableError(
      `Shipment ${shipment.shipmentNumber} is not booked yet; no carrier booking should exist for it.`,
    );
  }
  if (shipment.status === ShipmentStatus.CANCELLED) {
    throw new NonRetriableError(
      `Shipment ${shipment.shipmentNumber} is cancelled; booking a carrier for it would send a consignment nobody expects.`,
    );
  }

  let request: CanonicalIntlBookingRequest;
  try {
    request = buildIntlBookingRequest(shipment);
  } catch (err) {
    if (err instanceof IntlBookingDataError) {
      throw new NonRetriableError(err.message);
    }
    throw err;
  }

  const adapter = resolveIntlBookingAdapter(request.service.vendorId);
  if (!adapter) {
    throw new NonRetriableError(
      `No international booking integration exists for vendor "${request.service.vendorId}". This booking has to be placed by hand.`,
    );
  }
  if (!adapter.isConfigured()) {
    throw new NonRetriableError(
      `${adapter.vendorName} API credentials are not configured on the server.`,
    );
  }

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      intlBookingVendorId: adapter.vendorId,
      // PENDING unless it is already done: a retry of the label step alone must
      // not walk a BOOKED consignment back to PENDING.
      intlBookingStatus: shipment.intlAwbNumber
        ? IntlBookingStatus.BOOKED
        : IntlBookingStatus.PENDING,
      intlBookingAttempts: { increment: 1 },
      // Cleared so the error on the row always describes the run in progress.
      intlBookingError: null,
    },
  });

  return {
    request,
    vendorId: adapter.vendorId,
    orgName: shipment.org.name,
    pickupIncluded: shipment.pickupIncluded,
    shipperId: shipment.intlShipperId,
    vendorOrderId: shipment.intlBookingOrderId,
    awbNumber: shipment.intlAwbNumber,
    labelDocumentId: shipment.intlLabelDocumentId,
    // Recovered from the row, not from step memory. A fresh run days later —
    // an ops retry of a booking that succeeded but whose label upload did not —
    // skips create-booking entirely, and for a vendor that returns its
    // documents only once that would otherwise leave the label unreachable.
    documentRefs: readVendorDocumentRefs(shipment),
  };
}

/** Adapter lookup for the steps that follow, with the same refusal as above. */
function requireAdapter(vendorId: string) {
  const adapter = resolveIntlBookingAdapter(vendorId);
  if (!adapter) {
    throw new NonRetriableError(
      `International booking adapter "${vendorId}" is no longer registered.`,
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

export const bookInternationalCarrier = inngest.createFunction(
  {
    id: "book-international-carrier",
    name: "Book international carrier and fetch AWB label",

    // The automatic path and the ops re-drive, one body. Both are safe to run
    // against a shipment that is already part-way through.
    triggers: [intlCarrierRequested, intlCarrierRetryRequested],

    concurrency: [
      // The one that matters. An automatic booking and an impatient ops retry
      // arriving together must not race into two exports for one consignment.
      { limit: 1, key: "event.data.shipmentId" },
      // And a burst of bookings must not turn into a burst at the vendor.
      { limit: 5 },
    ],

    // sKart's responses carry `ratelimit-policy: 10;w=60`. Eight a minute keeps
    // us under it with room for the retries that a 429 would otherwise cause,
    // and Shipmozo is comfortable at that rate too. Deliberately NOT keyed on
    // the vendor: the limit exists to protect the tighter of the two, and one
    // shared budget is the conservative reading.
    throttle: { limit: 8, period: "60s" },

    retries: 4,

    onFailure: async ({ event, error }) => {
      const { shipmentId, shipmentNumber } = event.data.event.data as {
        shipmentId: string;
        shipmentNumber: string;
      };
      const reason = String(error?.message ?? error).slice(0, 500);

      Sentry.captureException(error, {
        tags: { location: "bookInternationalCarrier", shipmentId },
      });

      // The money stays where it is. A carrier that would not take the export is
      // not the same as a booking the customer no longer wants, and refunding on
      // a failed API call would be guessing at which. Ops decide.
      const shipment = await prisma.shipment
        .update({
          where: { id: shipmentId },
          data: {
            intlBookingStatus: IntlBookingStatus.FAILED,
            intlBookingError: reason,
          },
          select: { org: { select: { name: true } } },
        })
        .catch(() => null);

      await notifyIntlBookingFailed({
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

    // ── 1. What are we booking, and how far did we get last time? ───────────
    const prepared = await step.run("prepare-booking", () =>
      prepareBooking(shipmentId),
    );

    const alreadyBooked = Boolean(prepared.awbNumber);

    if (alreadyBooked && prepared.labelDocumentId) {
      logger.info(
        `Shipment ${prepared.request.displayReference} already has AWB ${prepared.awbNumber} and its label. Nothing to do.`,
      );

      // Both tails still run. This run may be a retry of one that died after
      // filing the label but before telling anybody, and both are idempotent at
      // their own end — the pickup on its event id, the announcement on its
      // notification ledger.
      await step.run("announce-awb", () =>
        announceIntlAwb({ shipmentId, orgId, shipmentNumber }),
      );

      const release = firstMileReleaseEvent(prepared, {
        shipmentId,
        shipmentNumber,
        orgId,
      });
      if (release) await step.sendEvent("request-first-mile", release);

      return { booked: true, awbNumber: prepared.awbNumber, skipped: true };
    }

    // ── 2. Would this export be accepted at all? ────────────────────────────
    //
    // Runs BEFORE anything is created at the vendor, and is the reason an
    // export can be booked automatically. A missing IEC, a lapsed LUT, an
    // unserviced destination: each is permanent, each names its own field, and
    // each is far better discovered here than as a vendor's 422 after the
    // customer has paid.
    if (!alreadyBooked) {
      await step.run("preflight", async () => {
        const adapter = requireAdapter(prepared.vendorId);
        try {
          await adapter.preflight(prepared.request);
          return { ok: true };
        } catch (err) {
          rethrowAsInngestError(err);
        }
      });
    }

    // ── 3. The exact service the customer paid for ──────────────────────────
    let serviceId: string | null = null;

    if (!alreadyBooked) {
      const resolved = await step.run("resolve-service", async () => {
        const adapter = requireAdapter(prepared.vendorId);
        try {
          return { serviceId: await adapter.resolveServiceId(prepared.request) };
        } catch (err) {
          rethrowAsInngestError(err);
        }
      });

      serviceId = resolved.serviceId;

      if (!serviceId) {
        // Deliberately terminal, and with no auto-assign override. See the
        // note at the top of this file: an international carrier is not a
        // commodity, and putting the consignment on a different one is not a
        // decision this function may make on anyone's behalf.
        throw new NonRetriableError(
          `Could not confirm the carrier the customer paid for${
            prepared.request.service.productName
              ? ` (${prepared.request.service.productName})`
              : ""
          }. It may no longer be offered on this route, so this booking needs to be placed by hand.`,
        );
      }
    }

    // ── 4. The exporter of record ───────────────────────────────────────────
    let shipperId = prepared.shipperId;

    if (!alreadyBooked && !shipperId) {
      const registered = await step.run("ensure-shipper", async () => {
        const adapter = requireAdapter(prepared.vendorId);
        try {
          const result = await adapter.ensureShipper(prepared.request);

          // Written immediately. A crash between here and the push must not
          // cost a second shipper record at the vendor.
          if (result.shipperId) {
            await prisma.shipment.update({
              where: { id: shipmentId },
              data: { intlShipperId: result.shipperId },
            });
          }

          return result;
        } catch (err) {
          rethrowAsInngestError(err);
        }
      });

      shipperId = registered.shipperId;
    }

    // ── 5. The booking ──────────────────────────────────────────────────────
    let vendorOrderId = prepared.vendorOrderId;
    let awbNumber = prepared.awbNumber;
    let documentRefs: CreatedIntlBooking["documents"] = prepared.documentRefs;

    if (!vendorOrderId) {
      const service = serviceId;
      const shipper = shipperId;

      const created = await step.run("create-booking", async () => {
        const adapter = requireAdapter(prepared.vendorId);

        // Only on a retry, and only then: this is a round trip that exists
        // solely to catch a push whose response we lost. Vendors that cannot
        // answer return null, which is the honest answer and not an error —
        // NEITHER vendor can today, so this is a hook for one that will rather
        // than a guard anything currently relies on. What actually prevents a
        // duplicate is each adapter refusing to retry an ambiguous create; see
        // the notes on `callCreate` in the Shipmozo adapter and `call` in
        // sKart's.
        if (attempt > 0) {
          const existing = await adapter
            .findExistingBooking(prepared.request.reference)
            .catch(() => null);

          if (existing) {
            await prisma.shipment.update({
              where: { id: shipmentId },
              data: {
                intlBookingOrderId: existing.vendorOrderId,
                intlAwbNumber: existing.awbNumber ?? undefined,
                intlCarrierName: existing.carrierName ?? undefined,
                intlBookedAt: new Date(),
              },
            });
            return {
              vendorOrderId: existing.vendorOrderId,
              awbNumber: existing.awbNumber ?? null,
              carrierName: existing.carrierName ?? null,
              trackingUrl: null,
              vendorPickupId: null,
              documents: [],
              recovered: true,
            };
          }
        }

        let result;
        try {
          result = await adapter.createBooking(prepared.request, {
            shipperId: shipper,
            serviceId: service,
          });
        } catch (err) {
          rethrowAsInngestError(err);
        }

        // Past this line the export EXISTS at the vendor, and the step must
        // never be retried again — a second run would place a second booking.
        // So a write that fails here is terminal and says the order id out
        // loud, because that id is the only handle anybody has on a consignment
        // that is now real.
        try {
          await prisma.shipment.update({
            where: { id: shipmentId },
            data: {
              intlBookingOrderId: result.vendorOrderId,
              intlVendorPickupId: result.vendorPickupId ?? undefined,
              intlBookedAt: new Date(),
              // Written here, with the order id, because this is the only
              // moment a single-call vendor names its documents. sKart returns
              // its four PDFs from the booking call and publishes no endpoint
              // to ask again.
              intlVendorDocuments: result.documents?.length
                ? (result.documents as unknown as Prisma.InputJsonValue)
                : undefined,
            },
          });
        } catch (err) {
          Sentry.captureException(err, {
            tags: { location: "bookInternationalCarrier:persistBooking", shipmentId },
          });
          throw new NonRetriableError(
            `The export was placed with ${prepared.vendorId} as order ${result.vendorOrderId}${
              result.awbNumber ? ` (AWB ${result.awbNumber})` : ""
            }, but recording it here failed: ${
              err instanceof Error ? err.message : "unknown error"
            }. Put that order id on the shipment by hand before re-driving, or the retry will book a second consignment.`,
          );
        }

        return {
          vendorOrderId: result.vendorOrderId,
          awbNumber: result.awbNumber ?? null,
          carrierName: result.carrierName ?? null,
          trackingUrl: result.trackingUrl ?? null,
          vendorPickupId: result.vendorPickupId ?? null,
          documents: result.documents ?? [],
          recovered: false,
        };
      });

      vendorOrderId = created.vendorOrderId;
      documentRefs = created.documents;

      // A single-call vendor (sKart) has already returned the waybill here, so
      // the assign step below is skipped entirely. A two-call vendor
      // (Shipmozo) returns null and the assign runs. One function, two vendor
      // shapes, no branching on a vendor name.
      if (created.awbNumber) {
        awbNumber = created.awbNumber;
        await step.run("record-booking", () =>
          recordWaybill({
            shipmentId,
            awbNumber: created.awbNumber as string,
            carrierName: created.carrierName,
            trackingUrl: created.trackingUrl,
          }),
        );
      }
    }

    if (!vendorOrderId) {
      throw new NonRetriableError(
        "No carrier booking id is on file for this shipment, and none was created.",
      );
    }

    // ── 6. The waybill, for vendors that assign it separately ───────────────
    if (!awbNumber) {
      const orderId = vendorOrderId;
      const service = serviceId;

      const assigned = await step.run("assign-carrier", async () => {
        const adapter = requireAdapter(prepared.vendorId);

        let result;
        try {
          result = await adapter.assignCarrier({
            vendorOrderId: orderId,
            serviceId: service,
            request: prepared.request,
          });
        } catch (err) {
          rethrowAsInngestError(err);
        }

        await recordWaybill({
          shipmentId,
          awbNumber: result.awbNumber,
          carrierName: result.carrierName,
          trackingUrl: result.trackingUrl ?? null,
        });

        return result;
      });

      awbNumber = assigned.awbNumber;
    }

    // ── 7. The documents ────────────────────────────────────────────────────
    //
    // Fetch, store and file are separate steps for the same reason the invoice
    // job splits render from upload: they fail for unrelated reasons, and a
    // retry should not redo the parts that worked. The customer's booking is
    // already complete at this point — this is the piece that lets them print
    // it.
    if (!prepared.labelDocumentId) {
      const waybill = awbNumber;
      const orderId = vendorOrderId;
      const refs = documentRefs;

      const fetched = await step.run("fetch-documents", async () => {
        const adapter = requireAdapter(prepared.vendorId);
        try {
          const documents = await adapter.fetchDocuments({
            vendorOrderId: orderId,
            awbNumber: waybill,
            documents: refs,
          });

          // Step output crosses a JSON boundary, so the bytes travel as base64.
          // A waybill is one page and comes to tens of kilobytes; the ops-only
          // extras are of the same order.
          return {
            documents: documents.map((doc) => ({
              kind: doc.kind,
              base64: Buffer.from(doc.bytes).toString("base64"),
              mimeType: doc.mimeType,
              fileName: doc.fileName,
            })),
          };
        } catch (err) {
          rethrowAsInngestError(err);
        }
      });

      const label = fetched.documents.find((doc) => doc.kind === "LABEL");
      if (!label) {
        throw new NonRetriableError(
          `${prepared.vendorId} returned no shipping label for AWB ${waybill}. The booking stands; the label has to be pulled from the vendor panel.`,
        );
      }

      const stored = await step.run("upload-label", () =>
        uploadLabel({
          bytes: Uint8Array.from(Buffer.from(label.base64, "base64")),
          fileName: label.fileName,
          mimeType: label.mimeType,
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
            // print. It is the ONLY vendor document they see — the commercial
            // invoice and proforma below stay internal, and the invoice the
            // customer gets is Arena's own. See carrierBranding.md.
            visibleToClient: true,
            uploadedByType: "SYSTEM",
          },
          select: { id: true },
        });

        await prisma.shipment.update({
          where: { id: shipmentId },
          data: { intlLabelDocumentId: document.id },
        });

        return { documentId: document.id };
      });

      // The vendor's own paperwork, for reconciliation and support. Best
      // effort and swallowed on purpose: these are ops conveniences, and a
      // booking that is complete for the customer must not fail because a
      // proforma PDF would not upload.
      const extras = fetched.documents.filter((doc) => doc.kind !== "LABEL");
      if (extras.length > 0) {
        await step.run("save-vendor-documents", async () => {
          const saved: string[] = [];
          for (const doc of extras) {
            try {
              const file = await uploadLabel({
                bytes: Uint8Array.from(Buffer.from(doc.base64, "base64")),
                fileName: doc.fileName,
                mimeType: doc.mimeType,
              });
              await prisma.shipmentDocument.create({
                data: {
                  shipmentId,
                  docType:
                    doc.kind === "COMMERCIAL_INVOICE" || doc.kind === "PROFORMA"
                      ? ShipmentDocType.INVOICE
                      : ShipmentDocType.OTHER,
                  label: vendorDocumentLabel(doc.kind, waybill),
                  fileUrl: file.fileUrl,
                  fileKey: file.fileKey,
                  fileName: file.fileName,
                  fileSize: file.fileSize,
                  mimeType: file.mimeType,
                  // Vendor-branded. Ops only.
                  visibleToClient: false,
                  uploadedByType: "SYSTEM",
                },
              });
              saved.push(doc.kind);
            } catch (err) {
              Sentry.captureException(err, {
                level: "warning",
                tags: {
                  location: "bookInternationalCarrier:vendorDocuments",
                  shipmentId,
                },
              });
            }
          }
          return { saved };
        });
      }
    }

    // ── 8. Tell the customer ────────────────────────────────────────────────
    //
    // The booking confirmation email promised the waybill "as soon as it is
    // issued". This is where that promise is kept: an in-app notification and an
    // email with the label attached. Its own step, after the label is filed, so
    // the customer is never told about a document that is not there yet.
    await step.run("announce-awb", () =>
      announceIntlAwb({ shipmentId, orgId, shipmentNumber }),
    );

    // ── 9. Release the door pickup ──────────────────────────────────────────
    const release = firstMileReleaseEvent(prepared, {
      shipmentId,
      shipmentNumber,
      orgId,
    });
    if (release) await step.sendEvent("request-first-mile", release);

    return { booked: true, awbNumber, skipped: false };
  },
);

// ---------------------------------------------------------------------------

/**
 * The waybill and the timeline entry land together: a shipment showing an AWB
 * with no history of where it came from is what makes a support call take
 * twenty minutes.
 */
async function recordWaybill(input: {
  shipmentId: string;
  awbNumber: string;
  carrierName: string | null;
  trackingUrl: string | null;
}): Promise<void> {
  await prisma.$transaction([
    prisma.shipment.update({
      where: { id: input.shipmentId },
      data: {
        intlAwbNumber: input.awbNumber,
        intlCarrierName: input.carrierName,
        intlTrackingUrl: input.trackingUrl ?? undefined,
        intlBookingStatus: IntlBookingStatus.BOOKED,
        intlBookingError: null,
      },
    }),
    prisma.shipmentStatusEvent.create({
      data: {
        shipmentId: input.shipmentId,
        // Not a status change. The consignment has not moved; we simply hold a
        // waybill for it now.
        fromStatus: ShipmentStatus.BOOKED,
        toStatus: ShipmentStatus.BOOKED,
        note: `Carrier booked. AWB ${input.awbNumber}${
          input.carrierName ? ` (${input.carrierName})` : ""
        }`,
        changedByType: "SYSTEM",
      },
    }),
  ]);
}

/**
 * Read the waybill and its label off the row, then tell the customer.
 *
 * Reads from the database rather than taking the values from step output,
 * because this runs on two paths: a fresh booking that has just filed its label,
 * and a re-drive of a consignment that already had one. The row is the single
 * place both agree on.
 *
 * Sending exactly once is announceAwbReady's job, not this function's — see the
 * ledger note in lib/booking/awbAnnounce.ts. That is what makes this safe to
 * reach on every run.
 */
async function announceIntlAwb(input: {
  shipmentId: string;
  orgId: string;
  shipmentNumber: string;
}) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: input.shipmentId },
    select: {
      intlAwbNumber: true,
      intlCarrierName: true,
      intlTrackingUrl: true,
      intlLabelDocumentId: true,
    },
  });

  // No waybill means there is nothing to announce. Not an error: this is
  // reached only after one was issued, so it would take a row changing
  // underneath the run.
  if (!shipment?.intlAwbNumber) return { announced: false, emailed: false };

  const label = shipment.intlLabelDocumentId
    ? await prisma.shipmentDocument.findUnique({
        where: { id: shipment.intlLabelDocumentId },
        select: { fileUrl: true, fileName: true },
      })
    : null;

  return announceAwbReady({
    shipmentId: input.shipmentId,
    orgId: input.orgId,
    shipmentNumber: input.shipmentNumber,
    awbNumber: shipment.intlAwbNumber,
    carrierName: shipment.intlCarrierName,
    trackingUrl: shipment.intlTrackingUrl,
    // A list because domestic files two labels for one waybill. An export has
    // only the carrier's, which is the one its network was built around.
    labels:
      label?.fileUrl && label.fileName
        ? [{ fileUrl: label.fileUrl, fileName: label.fileName }]
        : [],
  });
}

/**
 * The event that sends the door → hub courier, now that the export has
 * somewhere to go. Null for shipments with no door pickup, which is most of
 * them.
 *
 * The event carries an id so Inngest's own 24-hour dedupe covers a run that
 * reaches this point twice — a retry of the label step, say — without a second
 * courier arriving at a customer's door.
 */
function firstMileReleaseEvent(
  prepared: PreparedIntlBooking,
  ids: { shipmentId: string; shipmentNumber: string; orgId: string },
) {
  if (!prepared.pickupIncluded) return null;

  return firstMileRequested.create(
    {
      shipmentId: ids.shipmentId,
      shipmentNumber: ids.shipmentNumber,
      orgId: ids.orgId,
    },
    { id: `first-mile-${ids.shipmentId}` },
  );
}

function vendorDocumentLabel(kind: string, awb: string): string {
  switch (kind) {
    case "COMMERCIAL_INVOICE":
      return `Carrier commercial invoice (AWB ${awb})`;
    case "PROFORMA":
      return `Carrier proforma invoice (AWB ${awb})`;
    default:
      return `Carrier shipping pack (AWB ${awb})`;
  }
}

// ---------------------------------------------------------------------------

/**
 * Emitted by the booking action once an INTERNATIONAL shipment commits. Kept
 * next to the function that consumes it so the two are read together.
 *
 * The `id` makes it idempotent inside Inngest's 24-hour dedupe window: a booking
 * action whose tail somehow runs twice cannot queue two carrier bookings for one
 * consignment.
 */
export function intlCarrierRequestedEvent(input: {
  shipmentId: string;
  shipmentNumber: string;
  orgId: string;
}) {
  return intlCarrierRequested.create(input, {
    id: `intl-carrier-${input.shipmentId}`,
  });
}
