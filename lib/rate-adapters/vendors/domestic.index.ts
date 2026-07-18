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

// ↓ Future domestic vendors — add as needed
// import { DelhiveryDomesticAdapter } from "./delhivery-domestic/delhivery-domestic.adapter";
// domesticAdapterRegistry.register(new DelhiveryDomesticAdapter());
