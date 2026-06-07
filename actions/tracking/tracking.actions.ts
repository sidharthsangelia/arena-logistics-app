/**
 * TRACKING SERVER ACTION
 * -----------------------------------------------------------------------------
 * Next.js Server Action for shipment tracking.
 * Mirrors the pattern of rates.actions.ts.
 *
 * Can be called directly from Client Components — no fetch() needed.
 * Validates input with Zod before forwarding to the service layer.
 */

"use server";

import { trackShipment } from "@/lib/services/tracking.services";
import { CanonicalTrackResponse } from "@/lib/tracking-adapters/core/tracking.types";
import { z } from "zod";


// --- VALIDATION --------------------------------------------------------------

const TrackActionSchema = z.object({
  awb: z.string().min(1, "AWB is required").max(50).trim(),
  vendorId: z.string().optional(),
});

export type TrackActionInput = z.infer<typeof TrackActionSchema>;

export interface TrackActionResult {
  success: boolean;
  data: CanonicalTrackResponse | null;
  validationError?: string;
}

// --- ACTION ------------------------------------------------------------------

export async function trackShipmentAction(
  input: TrackActionInput
): Promise<TrackActionResult> {
  const parsed = TrackActionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      data: null,
      validationError: parsed.error.issues.map((e) => e.message).join(", "),
    };
  }

  const response = await trackShipment(parsed.data);

  // Strip raw error details before sending to client
  if (response.error) {
    const { raw: _raw, ...safeError } = response.error;
    return { success: response.success, data: { ...response, error: safeError } };
  }

  return { success: response.success, data: response };
}