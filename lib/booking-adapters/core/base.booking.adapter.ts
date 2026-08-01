/**
 * BASE BOOKING ADAPTER (Abstract)
 * -----------------------------------------------------------------------------
 * Every domestic courier vendor extends this. Unlike the rate adapter, which
 * has one public method, booking is a sequence of calls that each fail for
 * their own reasons, so the contract is a set of small operations rather than
 * one `book()`.
 *
 * THAT SHAPE IS DELIBERATE. The caller is a durable Inngest function that runs
 * one operation per step. Steps memoise, so an order that was pushed and then
 * failed to get a courier resumes at the assign — it does not push a second
 * order. Collapsing this into a single `book()` would make every retry start
 * from the beginning, and a duplicated parcel is a real cost to a real
 * customer.
 *
 * HOW TO ADD A NEW DOMESTIC VENDOR
 * -----------------------------------------------------------------------------
 *   1. Create lib/booking-adapters/vendors/<vendor>/
 *   2. Write <vendor>.booking.adapter.ts extending BaseBookingAdapter
 *   3. Register it in vendors/domestic.booking.index.ts
 *   Nothing else changes: the job, the ops screens and the schema are all
 *   written against this interface.
 */

import type {
  AssignedCarrier,
  CanonicalBookingRequest,
  CreateOrderResult,
  ExistingOrder,
  LabelFile,
  PickupPointResult,
} from "./types";

/**
 * One failure type for the whole layer, so the job has a single thing to catch.
 *
 * `retriable` is the field that matters. The job turns `retriable: false` into
 * an Inngest NonRetriableError, which stops it burning four more attempts on
 * something that cannot succeed — a pincode the vendor does not serve, an API
 * key that is wrong. Default is true, because an unrecognised failure is more
 * often the network than the request.
 */
export class BookingAdapterError extends Error {
  readonly vendorId: string;
  readonly retriable: boolean;
  readonly status?: number;

  constructor(
    vendorId: string,
    message: string,
    opts?: { retriable?: boolean; status?: number; cause?: unknown },
  ) {
    super(message, opts?.cause ? { cause: opts.cause } : undefined);
    this.name = "BookingAdapterError";
    this.vendorId = vendorId;
    this.retriable = opts?.retriable ?? true;
    this.status = opts?.status;
  }
}

export abstract class BaseBookingAdapter {
  /** Unique machine-readable key. Matches the rate adapter's vendorId. */
  abstract readonly vendorId: string;

  /** Human-readable label for logs, errors and the ops screens. */
  abstract readonly vendorName: string;

  /** False when the credentials are missing. Checked before anything is pushed. */
  abstract isConfigured(): boolean;

  /**
   * Register (or reuse) the pickup location with the vendor.
   *
   * Vendors that take the pickup address inline should return
   * `{ pickupPointId: null }` and do nothing.
   */
  abstract ensurePickupPoint(
    request: CanonicalBookingRequest,
  ): Promise<PickupPointResult>;

  /** Create the order. Must not assign a courier — that is the next step. */
  abstract createOrder(
    request: CanonicalBookingRequest,
    pickupPointId: string | null,
  ): Promise<CreateOrderResult>;

  /**
   * Assign the service the customer paid for and return its waybill.
   *
   * `courierId` absent means the caller has explicitly accepted an auto-assign;
   * an adapter must never quietly substitute a courier of its own choosing.
   */
  abstract assignCarrier(input: {
    vendorOrderId: string;
    courierId?: string | null;
  }): Promise<AssignedCarrier>;

  /** The printable waybill. Bytes, so the caller can store it anywhere. */
  abstract fetchLabel(input: {
    vendorOrderId: string;
    awbNumber: string;
  }): Promise<LabelFile>;

  /**
   * Ask the vendor to schedule the physical pickup.
   *
   * Optional by default because several vendors schedule automatically on
   * assign. Failing here must never undo an assigned order, so the caller
   * treats it as best-effort.
   */
  async schedulePickup(vendorOrderId: string): Promise<void> {
    void vendorOrderId;
  }

  /** Cancel the order at the vendor. Used by ops, never automatically. */
  abstract cancelOrder(vendorOrderId: string): Promise<void>;

  /**
   * Best-effort "do you already have this?" lookup, keyed on OUR reference.
   *
   * Exists for exactly one failure: the create call landed at the vendor and
   * the response was lost in transit. A blind retry in that state creates a
   * second parcel. Adapters that cannot answer should return null rather than
   * throw — a failed lookup must not fail the booking.
   */
  async findExistingOrder(reference: string): Promise<ExistingOrder | null> {
    void reference;
    return null;
  }
}
