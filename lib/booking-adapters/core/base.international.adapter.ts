/**
 * BASE INTERNATIONAL BOOKING ADAPTER (Abstract)
 * -----------------------------------------------------------------------------
 * Every international vendor extends this. Sibling of BaseBookingAdapter, which
 * does the same job for domestic door → door couriers.
 *
 * WHY THIS IS NOT JUST BaseBookingAdapter
 * -----------------------------------------------------------------------------
 * The domestic base decomposes a booking into five calls — pickup point, order,
 * assign, label, pickup — because Shipmozo's domestic flow genuinely needs five.
 * International does not divide the same way:
 *
 *   • Shipmozo international is create-shipper → international-push-order →
 *     assign-courier → get-order-label. Four calls, and one of them (shipper)
 *     has no domestic equivalent at all.
 *   • sKart is ONE call. /booking-api returns the AWB, the carrier, the pickup
 *     id and four PDFs together.
 *
 * Forcing sKart through the domestic shape would mean three methods that do
 * nothing and a `createOrder` secretly holding an AWB it is not allowed to
 * mention. So the contract below is deliberately coarser, and `createBooking`
 * is allowed to return an AWB. The orchestrator reads that field to decide
 * whether the assign step runs, which is how one durable function drives both
 * vendor shapes without ever branching on a vendor name.
 *
 * THE STEP SHAPE IS STILL DELIBERATE. The caller is a durable Inngest function
 * that runs one operation per step. Steps memoise, so a booking that was pushed
 * and then failed to get a label resumes at the label — it does not push a
 * second order. A duplicated export is a real cost to a real customer, and an
 * expensive one.
 *
 * HOW TO ADD A NEW INTERNATIONAL VENDOR
 * -----------------------------------------------------------------------------
 *   1. Create lib/booking-adapters/vendors/<vendor>/
 *   2. Write <vendor>.booking.adapter.ts extending this class
 *   3. Register it in vendors/international.booking.index.ts
 *   Nothing else changes: the job, the ops screens and the schema are all
 *   written against this interface. Aramex and ShipGlobal land exactly here
 *   once their booking APIs are documented.
 */

import type {
  AssignedIntlCarrier,
  CanonicalIntlBookingRequest,
  CreatedIntlBooking,
  ExistingIntlBooking,
  IntlVendorDocument,
} from "./intl.types";

export { BookingAdapterError } from "./base.booking.adapter";
import { BookingAdapterError } from "./base.booking.adapter";

export abstract class BaseInternationalBookingAdapter {
  /** Unique machine-readable key. MUST match the rate adapter's vendorId. */
  abstract readonly vendorId: string;

  /** Human-readable label for logs, errors and the ops screens. */
  abstract readonly vendorName: string;

  /** False when the credentials are missing. Checked before anything is pushed. */
  abstract isConfigured(): boolean;

  /**
   * Refuse the booking BEFORE anything exists at the vendor.
   *
   * This is the production safety net, and the reason international can be
   * booked automatically at all. An export is rejected for data reasons far more
   * often than a domestic parcel is — a missing IEC, no AD code, an unserviced
   * destination pincode — and discovering that from a vendor's 422 gives the
   * customer "booking failed" and gives ops nothing to act on.
   *
   * So every adapter states its own requirements here and throws a
   * BookingAdapterError with `retriable: false` NAMING THE FIELD. The
   * orchestrator turns that into a permanent failure carrying the message, and
   * ops read the actual problem on the booking row.
   *
   * Must not mutate anything and must not call a create endpoint. A cheap
   * read-only vendor check (serviceability, say) is fine.
   */
  abstract preflight(request: CanonicalIntlBookingRequest): Promise<void>;

  /**
   * The vendor's own id for the service the customer bought.
   *
   * The normal answer is `request.service.serviceId`, snapshotted when the
   * customer picked the rate. The fallback is a vendor lookup keyed on the
   * product name. Returning null is MEANINGFUL and must not be papered over: it
   * means the service that was sold can no longer be identified, and shipping
   * the parcel on something else is a commercial decision for a person.
   *
   * An adapter must never quietly substitute a carrier of its own choosing.
   */
  abstract resolveServiceId(
    request: CanonicalIntlBookingRequest,
  ): Promise<string | null>;

  /**
   * Register (or reuse) the shipper/exporter record with the vendor.
   *
   * Shipmozo requires one (`create-shipper` → `shipper_id`). Vendors that take
   * the exporter inline return `{ shipperId: null }` and do nothing, which is
   * why this has a default rather than being abstract.
   */
  async ensureShipper(
    request: CanonicalIntlBookingRequest,
  ): Promise<{ shipperId: string | null }> {
    void request;
    return { shipperId: null };
  }

  /**
   * Place the booking.
   *
   * Two-call vendors (Shipmozo) push the order and return no AWB; the
   * orchestrator then calls assignCarrier. One-call vendors (sKart) return the
   * AWB, the carrier and their documents from here and assignCarrier is never
   * reached. Both are correct — see the class comment.
   *
   * `serviceId` is the exact service to book. It is null only when the caller
   * has EXPLICITLY accepted an auto-assign, which never happens on the
   * automatic path.
   */
  abstract createBooking(
    request: CanonicalIntlBookingRequest,
    context: { shipperId: string | null; serviceId: string | null },
  ): Promise<CreatedIntlBooking>;

  /**
   * Assign the service the customer paid for and return its waybill.
   *
   * Only called when createBooking returned no AWB. Vendors that book in one
   * call inherit this default, which throws rather than pretending: reaching it
   * would mean the orchestrator lost the AWB it was already given, and quietly
   * assigning a second carrier is the worst available response to that.
   */
  async assignCarrier(input: {
    vendorOrderId: string;
    serviceId: string | null;
    /**
     * The consignment as it was pushed. Carried so an adapter can re-check the
     * vendor's own offer before assigning — Shipmozo's documented flow puts a
     * rate call between the push and the assign, and that call needs the
     * shipment's parameters, not just its handle.
     */
    request: CanonicalIntlBookingRequest;
  }): Promise<AssignedIntlCarrier> {
    void input;
    throw new BookingAdapterError(
      this.vendorId,
      `${this.vendorName} books in a single call and has no separate carrier assignment. Reaching this means the AWB from the booking call was lost.`,
      { retriable: false },
    );
  }

  /**
   * The booking's documents, as bytes, so the caller can store them anywhere.
   *
   * The LABEL is the one that matters and should come first when present: it is
   * the only document shown to the customer. Anything else (commercial invoice,
   * proforma, merged pack) is filed for ops. An adapter that can only produce a
   * label returns just that.
   *
   * `documents` carries the refs createBooking already returned, so a one-call
   * vendor downloads the URLs it was handed rather than asking again.
   */
  abstract fetchDocuments(input: {
    vendorOrderId: string;
    awbNumber: string;
    documents?: CreatedIntlBooking["documents"];
  }): Promise<IntlVendorDocument[]>;

  /** Cancel the booking at the vendor. Used by ops, never automatically. */
  abstract cancelBooking(vendorOrderId: string): Promise<void>;

  /**
   * Best-effort "do you already have this?" lookup, keyed on OUR reference.
   *
   * Exists for exactly one failure: the create call landed at the vendor and the
   * response was lost in transit. A blind retry in that state books a second
   * export. Adapters that cannot answer should return null rather than throw — a
   * failed lookup must not fail the booking.
   */
  async findExistingBooking(
    reference: string,
  ): Promise<ExistingIntlBooking | null> {
    void reference;
    return null;
  }
}
