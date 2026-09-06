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
 * SPEEDOPOST — QUOTES HERE, BOOKS SINCE 2026-09-05.
 *
 * Registered here so the DOMESTIC RATE CALCULATOR prices SpeedoPost alongside
 * Shipmozo, and now backed by a booking adapter in
 * lib/booking-adapters/vendors/domestic.booking.index.ts, so a customer can
 * actually buy what is quoted. The analysis behind that adapter, including the
 * questions still open with SpeedoPost, is in speedopostBooking.md.
 *
 * The registry is shared, so the two booking surfaces still opt in by name
 * instead of taking whatever is registered:
 *   - DOMESTIC_BOOKABLE_VENDOR_IDS in lib/booking/domesticRequest.ts pins the
 *     domestic booking wizard's service step. SpeedoPost is on it.
 *   - FIRST_MILE_VENDOR_IDS in lib/booking/firstMile.ts pins the export
 *     door → hub leg. SpeedoPost is NOT on it, and that is a judgement rather
 *     than an oversight: see the note on that constant.
 * Both lists mean "can quote AND book", and a name belongs on one only while an
 * adapter for it is registered.
 *
 * Tracking has been registered throughout in
 * lib/tracking-adapters/vendors/tracking.index.ts, so scans have always come
 * back regardless of who placed the order.
 */
domesticAdapterRegistry.register(new SpeedoPostDomesticAdapter());

// ↓ Future domestic vendors — add as needed
// import { DelhiveryDomesticAdapter } from "./delhivery-domestic/delhivery-domestic.adapter";
// domesticAdapterRegistry.register(new DelhiveryDomesticAdapter());
