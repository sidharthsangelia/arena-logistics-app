/**
 * VENDOR REGISTRATION
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the ONE file you touch when adding a new vendor.
 *
 * Steps to add a new vendor (e.g. FedEx):
 *   1. Create src/lib/adapters/vendors/fedex/
 *   2. Add   fedex.types.ts    (vendor-specific shapes)
 *   3. Add   fedex.adapter.ts  (extend BaseVendorAdapter)
 *   4. Add the two lines below:
 *        import { FedExAdapter } from "./fedex/fedex.adapter";
 *        adapterRegistry.register(new FedExAdapter());
 *
 * That's it. The service layer, API route, and all types stay untouched.
 */

import { adapterRegistry } from "../core/registry";
import { SkartAdapter } from "./skart/skart.adapter";
import { AramexAdapter } from "./aramex/aramex.adapter";

adapterRegistry.register(new SkartAdapter());
adapterRegistry.register(new AramexAdapter());

// ↓ Future vendors — uncomment / add as needed
// import { FedExAdapter } from "./fedex/fedex.adapter";
// adapterRegistry.register(new FedExAdapter());

// import { DHLAdapter } from "./dhl/dhl.adapter";
// adapterRegistry.register(new DHLAdapter());

export { adapterRegistry };