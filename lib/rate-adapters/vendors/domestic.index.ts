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
// import { SpeedoPostDomesticAdapter } from "./speedopost/speedopost.adapter";

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
 * SPEEDOPOST — WITHDRAWN FROM THE CALCULATOR, NOT DELETED.
 *
 * Its rate adapter still lives under ./speedopost/ and still compiles and
 * type-checks; it is simply not registered, so `getRates` never fans out to it
 * and no customer is offered a SpeedoPost service. The reason it went is the
 * asymmetry documented in speedopostBooking.md: SpeedoPost could quote but
 * never book, so every quote it won was a shipment paid for and then placed by
 * hand.
 *
 * To bring it back, uncomment the import above and the register below. Two
 * other places opt in alongside it, and all three are needed for a working
 * vendor:
 *   1. DOMESTIC_CALCULATOR_VENDORS in lib/types.ts   (the calculator filter)
 *   2. A SpeedoPost adapter in
 *      lib/booking-adapters/vendors/domestic.booking.index.ts, without which
 *      the same take-the-money-and-stall behaviour returns
 *   3. FIRST_MILE_VENDOR_IDS in lib/booking/firstMile.ts, only once (2) is done
 *
 * Tracking is untouched on purpose — it stays registered in
 * lib/tracking-adapters/vendors/tracking.index.ts so SpeedoPost shipments
 * already in flight keep reporting scans.
 */
// domesticAdapterRegistry.register(new SpeedoPostDomesticAdapter());

// ↓ Future domestic vendors — add as needed
// import { DelhiveryDomesticAdapter } from "./delhivery-domestic/delhivery-domestic.adapter";
// domesticAdapterRegistry.register(new DelhiveryDomesticAdapter());
