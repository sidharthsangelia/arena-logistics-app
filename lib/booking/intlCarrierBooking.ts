/**
 * lib/booking/intlCarrierBooking.ts
 *
 * Shared contract for the ops controls over an international carrier booking.
 * The types live here rather than in the "use server" action file, which may
 * only export async functions, so the actions and the panel agree on one shape.
 *
 * Sibling of ./domesticCourierBooking.ts, and deliberately a near-copy of it
 * rather than a shared generic: the two panels read differently because the two
 * bookings behave differently (no auto-assign here, a customs-data failure mode
 * there is not), and a union type covering both would push that difference into
 * every field's doc comment.
 */

export interface IntlCarrierPanelState {
  status: "NOT_REQUIRED" | "PENDING" | "BOOKED" | "FAILED" | "CANCELLED";
  vendorName: string | null;
  /** The service the customer chose and paid for. */
  selectedProductName: string | null;
  /** The carrier the vendor actually assigned. */
  carrierName: string | null;
  orderId: string | null;
  awbNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  error: string | null;
  attempts: number;
  bookedAt: string | null;
  /**
   * Whether automatic booking is on. Shown so an ops person looking at a
   * NOT_REQUIRED row can tell "this feature is off" apart from "this booking
   * was skipped", which are otherwise the same empty panel.
   */
  autoBookEnabled: boolean;
}
