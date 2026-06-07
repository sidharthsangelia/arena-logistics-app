/**
 * TRACKING VENDOR REGISTRATION
 * -----------------------------------------------------------------------------
 * This is the ONE file you touch when adding a new tracking vendor.
 *
 * Steps to add a new vendor (e.g. FedEx):
 *   1. Create src/lib/adapters/vendors/fedex/
 *   2. Add   fedex.tracking.types.ts   (vendor-specific shapes)
 *   3. Add   fedex.tracking.adapter.ts (extend BaseTrackingAdapter)
 *   4. Add the two lines below:
 *        import { FedExTrackingAdapter } from "./fedex/fedex.tracking.adapter";
 *        trackingAdapterRegistry.register(new FedExTrackingAdapter());
 *
 * That's it. The service layer, API route, and canonical types stay untouched.
 */

import { trackingAdapterRegistry } from "../core/tracking.registry";
import { SkartTrackingAdapter } from "./skart/skart.tracking.adapter";
import { AramexTrackingAdapter } from "./aramex/aramex.tracking.adapter";

trackingAdapterRegistry.register(new SkartTrackingAdapter());
trackingAdapterRegistry.register(new AramexTrackingAdapter());

// ↓ Future vendors — uncomment / add as needed
// import { FedExTrackingAdapter } from "./fedex/fedex.tracking.adapter";
// trackingAdapterRegistry.register(new FedExTrackingAdapter());

// import { DHLTrackingAdapter } from "./dhl/dhl.tracking.adapter";
// trackingAdapterRegistry.register(new DHLTrackingAdapter());

export { trackingAdapterRegistry };