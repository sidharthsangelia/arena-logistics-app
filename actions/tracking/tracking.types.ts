import type { CanonicalTrackResponse } from "@/lib/tracking-adapters/core/tracking.types";

/**
 * Types for the tracking server action.
 *
 * They live here rather than in tracking.actions.ts because a `"use server"`
 * module may only export async functions — every other export is compiled into
 * a callable server reference, and a type is not one.
 */

export interface TrackActionInput {
  /** Our shipment number (ARN…) or a carrier AWB. Both are accepted. */
  awb: string;
}

export interface TrackActionResult {
  success: boolean;
  data: CanonicalTrackResponse | null;
  validationError?: string;
}
