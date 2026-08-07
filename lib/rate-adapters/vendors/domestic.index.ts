/**
 * DOMESTIC VENDOR REGISTRATION
 * -----------------------------------------------------------------------------
 * The domestic counterpart to vendors/index.ts. It owns a SEPARATE adapter
 * registry so domestic carriers and international carriers never leak into each
 * other's calculator — the international `getRates` fans out over
 * `adapterRegistry`, the domestic flow over `domesticAdapterRegistry`.
 *
 * To add a new domestic carrier (e.g. a direct Delhivery integration):
 *   1. Create vendors/<vendor>-domestic/  (types + adapter extending
 *      BaseVendorAdapter, producing canonical RateQuote[])
 *   2. Add the two lines below (import + register).
 * The service, action, store, form, and result UI stay untouched.
 */

import { AdapterRegistry } from "../core/registry";
import { ShipmozoDomesticAdapter } from "./shipmozo-domestic/shipmozo-domestic.adapter";
import { SpeedoPostDomesticAdapter } from "./speedopost/speedopost.adapter";

/**
 * Singleton domestic registry, pinned to globalThis (same rationale as the
 * international registry): exactly one instance per process even across HMR /
 * multiple module graphs, and `register` is idempotent so re-evaluation never
 * throws mid-request.
 */
const globalForDomesticRegistry = globalThis as unknown as {
  __arenaDomesticAdapterRegistry?: AdapterRegistry;
};

export const domesticAdapterRegistry =
  globalForDomesticRegistry.__arenaDomesticAdapterRegistry ??
  new AdapterRegistry();

globalForDomesticRegistry.__arenaDomesticAdapterRegistry =
  domesticAdapterRegistry;

domesticAdapterRegistry.register(new ShipmozoDomesticAdapter());

/**
 * SpeedoPost quotes but CANNOT YET BOOK, and that asymmetry is deliberate.
 *
 * There is no entry for "speedopost" in
 * lib/booking-adapters/vendors/domestic.booking.index.ts, so a customer who
 * selects one of these quotes in the booking wizard will pay, and
 * bookDomesticCourier will stop at `resolveBookingAdapter` returning null. The
 * money stays held (domesticCourierBooking.md D5), ops get a CRITICAL
 * COURIER_BOOKING_FAILED, and the order is placed by hand.
 *
 * That was chosen knowingly: the rates are worth having in front of customers
 * before the booking integration lands. Registering a SpeedoPost booking
 * adapter under the same vendorId is the whole fix, and nothing here changes
 * when it does.
 */
domesticAdapterRegistry.register(new SpeedoPostDomesticAdapter());

// ↓ Future domestic vendors — add as needed
// import { DelhiveryDomesticAdapter } from "./delhivery-domestic/delhivery-domestic.adapter";
// domesticAdapterRegistry.register(new DelhiveryDomesticAdapter());
