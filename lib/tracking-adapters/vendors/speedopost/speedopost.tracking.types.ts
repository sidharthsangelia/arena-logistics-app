/**
 * SPEEDOPOST — TRACKING ADAPTER-LOCAL TYPES
 * -----------------------------------------------------------------------------
 * The response shape lives in lib/speedopost/types.ts, shared with the rate
 * adapter and the client. Only the request shape is adapter-local, because it
 * is the one thing the tracking layer alone decides.
 *
 * SpeedoPost's TrackingDetails takes `trackingType` alongside the number, and
 * "AWB" is the only value their documentation ever shows. It is carried as a
 * field rather than hard-coded into the call so a second lookup mode (by client
 * order id, say) is a change to the transform and nothing else.
 */

import type { SpeedoPostTrackingType } from "@/lib/speedopost/types";

export interface SpeedoPostTrackRequest {
  awb: string;
  trackingType: SpeedoPostTrackingType;
}

export type { SpeedoPostTrackData } from "@/lib/speedopost/types";
