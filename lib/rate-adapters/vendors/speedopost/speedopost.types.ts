/**
 * SPEEDOPOST — RATE ADAPTER-LOCAL TYPES
 * -----------------------------------------------------------------------------
 * The wire shapes live in lib/speedopost/types.ts (shared with the tracking
 * adapter and with the booking work that follows). What lives HERE is the pair
 * of them the rate adapter works in, and nothing else.
 *
 * SpeedoPost prices ONE segment per call: `orderType` is required and it
 * changes which providers answer. B2C is the parcel network, B2B the freight
 * network, and a customer shipping India → India could legitimately want
 * either. So one canonical rate request fans out into two vendor calls and the
 * results merge back into one quote list — which is why the adapter's
 * TVendorRequest and TVendorResponse are bundles rather than the raw payload
 * and the raw response.
 */

import type {
  SpeedoPostOrderType,
  SpeedoPostRateOption,
  SpeedoPostRatePayload,
} from "@/lib/speedopost/types";

/** One segment's call: the payload, plus the segment it prices. */
export interface SpeedoPostRateCall {
  orderType: SpeedoPostOrderType;
  payload: SpeedoPostRatePayload;
}

/** Everything transformRequest produces — one entry per segment to price. */
export interface SpeedoPostRateRequestBundle {
  calls: SpeedoPostRateCall[];
}

/** One segment's answer, with the segment carried alongside it. */
export interface SpeedoPostRateSegmentResult {
  orderType: SpeedoPostOrderType;
  options: SpeedoPostRateOption[];
}

/**
 * Everything callVendorApi returns.
 *
 * `failures` is deliberately part of the success path. One segment failing
 * while the other prices the lane is a partial answer, not an error — the
 * customer still gets real quotes — but it must not vanish silently either, so
 * it travels with the result and is logged.
 */
export interface SpeedoPostRateResponseBundle {
  segments: SpeedoPostRateSegmentResult[];
  failures: { orderType: SpeedoPostOrderType; message: string }[];
}
