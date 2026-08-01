/**
 * Shipmozo tracking shapes. The GET /track-order response and the tracking
 * webhook payload share the same body, so both reuse ShipmozoTrackData from the
 * Shipmozo lib. This file only names the request the adapter builds internally.
 */

export type { ShipmozoTrackData, ShipmozoScanEntry } from "@/lib/shipmozo/types";

export interface ShipmozoTrackRequest {
  awb: string;
}
