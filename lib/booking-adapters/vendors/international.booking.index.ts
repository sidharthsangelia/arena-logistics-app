/**
 * INTERNATIONAL BOOKING VENDOR REGISTRATION
 * -----------------------------------------------------------------------------
 * The one module that knows which vendors can actually book an export. Import
 * this (never an adapter directly) and the registry is populated as a side
 * effect, exactly like ./domestic.booking.index.ts.
 *
 * To add an international vendor:
 *   1. Create vendors/<vendor>/<vendor>.booking.adapter.ts extending
 *      BaseInternationalBookingAdapter.
 *   2. Add the two lines below (import + register).
 * The booking job, the ops screens and the schema stay untouched — they all work
 * through the vendorId recorded on the shipment.
 *
 * The vendorId MUST match the rate adapter's, because that is the id snapshotted
 * on the shipment when the customer picks a service, and it is how this layer
 * finds the vendor that quoted the price they paid.
 *
 * WHY SHIPMOZO APPEARS IN BOTH THIS FILE AND THE DOMESTIC ONE
 * It sells both, under one vendorId, through two different sets of endpoints.
 * The two registries keep the two adapters from overwriting each other. See the
 * note in lib/booking-adapters/core/registry.ts.
 */

import { internationalBookingAdapterRegistry } from "../core/registry";
import { AramexBookingAdapter } from "./aramex/aramex.booking.adapter";
import { ShipmozoInternationalBookingAdapter } from "./shipmozo-intl/shipmozo-intl.booking.adapter";
import { SkartBookingAdapter } from "./skart/skart.booking.adapter";

internationalBookingAdapterRegistry.register(
  new ShipmozoInternationalBookingAdapter(),
);
internationalBookingAdapterRegistry.register(new SkartBookingAdapter());

/**
 * Registered unconditionally, like the others, and with one consequence worth
 * stating: an Aramex-quoted shipment that used to wait for a human is now booked
 * automatically.
 *
 * That only applies to shipments quoted AFTER the multi-account rate adapter
 * shipped. Older Aramex quotes carry no account key, so `resolveServiceId`
 * returns null and the orchestrator stops — which is exactly what happens to
 * them today. See the header of aramex.booking.adapter.ts for why the adapter
 * refuses rather than choosing an account.
 */
internationalBookingAdapterRegistry.register(new AramexBookingAdapter());

// ↓ Future international vendors — add as needed.
//   ShipGlobal is a RATE vendor today: rates are live but booking is halted
//   pending answers from their tech team, so it is quotable and not bookable
//   through the API. It registers here the day that is resolved, and nothing
//   outside this folder changes.
// import { ShipGlobalBookingAdapter } from "./shipglobal/shipglobal.booking.adapter";
// internationalBookingAdapterRegistry.register(new ShipGlobalBookingAdapter());

export { internationalBookingAdapterRegistry };

/**
 * The adapter that can book this shipment, or null when none can.
 *
 * Null is a real outcome, not a bug: a shipment quoted by a vendor with no
 * booking integration is bookable by hand and nothing else. The caller says so
 * plainly rather than falling back to whichever vendor happens to be registered
 * — a consignment flying on a carrier nobody chose is worse than one waiting.
 */
export function resolveIntlBookingAdapter(vendorId: string | null | undefined) {
  if (!vendorId) return null;
  return internationalBookingAdapterRegistry.get(vendorId) ?? null;
}
