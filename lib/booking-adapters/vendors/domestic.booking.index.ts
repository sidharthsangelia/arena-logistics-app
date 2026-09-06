/**
 * DOMESTIC BOOKING VENDOR REGISTRATION
 * -----------------------------------------------------------------------------
 * The one module that knows which vendors can actually book. Import this (never
 * an adapter directly) and the registry is populated as a side effect, exactly
 * like lib/rate-adapters/vendors/domestic.index.ts.
 *
 * To add a domestic vendor:
 *   1. Create vendors/<vendor>/<vendor>.booking.adapter.ts extending
 *      BaseBookingAdapter.
 *   2. Add the two lines below (import + register).
 * The booking job, the ops screens and the schema stay untouched — they all
 * work through the vendorId recorded on the shipment.
 *
 * The vendorId MUST match the rate adapter's, because that is the id snapshotted
 * on the shipment when the customer picks a service, and it is how this layer
 * finds the vendor that quoted the price they paid.
 */

import { bookingAdapterRegistry } from "../core/registry";
import { ShipmozoBookingAdapter } from "./shipmozo/shipmozo.booking.adapter";
import { SpeedoPostBookingAdapter } from "./speedopost/speedopost.booking.adapter";

bookingAdapterRegistry.register(new ShipmozoBookingAdapter());

/**
 * SPEEDOPOST — BOOKABLE SINCE 2026-09-05, WITH TWO THINGS TO KNOW.
 *
 * Registering it here is what closes the gap that made SpeedoPost quote-only:
 * `resolveBookingAdapter("speedopost")` now returns an adapter, so a customer
 * who selects a SpeedoPost service gets an order placed rather than a held
 * payment and a CRITICAL notification. DOMESTIC_BOOKABLE_VENDOR_IDS in
 * lib/booking/domesticRequest.ts is the list that lets the booking wizard offer
 * it, and the two must be changed together: an entry in that list without an
 * adapter here is the take-the-money-and-stall bug.
 *
 *   1. THEIR CREATE IS NOT SAFELY RETRYABLE. SpeedoPost publishes no way to ask
 *      whether they already hold an order under our reference, so
 *      `findExistingOrder` returns null and the adapter refuses to retry a
 *      create whose outcome it could not read. That turns a possible second
 *      parcel into a failed booking ops re-drive by hand. The header of
 *      speedopost.booking.adapter.ts explains the trade.
 *
 *   2. SPEEDOPOST_CLIENT_CODE MUST BE SET. It is required on every order and
 *      SpeedoPost has never explained where ours comes from. `isConfigured`
 *      returns false without it, which the job turns into a clean permanent
 *      failure rather than a rejected payload.
 */
bookingAdapterRegistry.register(new SpeedoPostBookingAdapter());

// ↓ Future domestic vendors — add as needed
// import { DelhiveryBookingAdapter } from "./delhivery/delhivery.booking.adapter";
// bookingAdapterRegistry.register(new DelhiveryBookingAdapter());

export { bookingAdapterRegistry };

/**
 * The adapter that can book this shipment, or null when none can.
 *
 * Null is a real outcome, not a bug: a shipment quoted by a vendor with no
 * booking integration is bookable by hand and nothing else. The caller says so
 * plainly rather than falling back to whichever vendor happens to be registered
 * — a parcel moving on a courier nobody chose is worse than a parcel waiting.
 */
export function resolveBookingAdapter(vendorId: string | null | undefined) {
  if (!vendorId) return null;
  return bookingAdapterRegistry.get(vendorId) ?? null;
}
