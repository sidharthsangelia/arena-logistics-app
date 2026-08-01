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

bookingAdapterRegistry.register(new ShipmozoBookingAdapter());

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
