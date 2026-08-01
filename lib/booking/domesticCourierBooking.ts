/**
 * lib/booking/domesticCourierBooking.ts
 *
 * Shared contract for the ops controls over a domestic courier booking. The
 * types live here rather than in the "use server" action file, which may only
 * export async functions, so the actions and the panel agree on one shape.
 */

export interface DomesticCourierActionResult {
  success: boolean;
  message: string;
}

/** What the ops panel needs to render, straight off the shipment row. */
export interface DomesticCourierPanelState {
  status: "NOT_REQUIRED" | "PENDING" | "BOOKED" | "FAILED" | "CANCELLED";
  vendorName: string | null;
  /** The service the customer chose and paid for. */
  selectedProductName: string | null;
  /** The courier the vendor actually assigned. */
  courierName: string | null;
  orderId: string | null;
  awbNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  error: string | null;
  attempts: number;
  bookedAt: string | null;
}
