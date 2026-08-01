/**
 * TRACKING SERVER ACTION
 * -----------------------------------------------------------------------------
 * The one entry point behind the track box on both dashboards.
 *
 * Accepts either number a customer might be holding: Arena's own shipment
 * number (ARN260130748291) or a carrier AWB. The service layer works out which
 * it is and what to do about it — see lib/services/shipmentTracking.service.ts.
 *
 * WHO IS ASKING IS DECIDED HERE, NOT PASSED IN
 * A server action is reachable by direct POST, so the caller's org is taken
 * from the session and never from the arguments. Arena staff resolve any
 * booking; a tenant resolves only their own org's, which is what stops our
 * shipment numbers from being walked from another account. A carrier AWB is
 * still looked up openly for everyone: it is the carrier's number, a customer
 * may hold one for a shipment Arena never booked, and it reveals nothing about
 * our records.
 */

"use server";

import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import {
  trackByQuery,
  type TrackingScope,
} from "@/lib/services/shipmentTracking.service";
import { getOrgShell } from "@/utils/tenant";
import type { TrackActionResult } from "./tracking.types";

const ARENA_ORG_ID = process.env.ARENA_ORG_ID!;

// --- VALIDATION --------------------------------------------------------------

const TrackActionSchema = z.object({
  awb: z.string().min(1, "Enter a shipment number or AWB").max(50).trim(),
});

// --- ACTION ------------------------------------------------------------------

export async function trackShipmentAction(input: {
  awb: string;
}): Promise<TrackActionResult> {
  const parsed = TrackActionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      data: null,
      validationError: parsed.error.issues.map((e) => e.message).join(", "),
    };
  }

  const scope = await resolveScope();

  if (!scope) {
    return {
      success: false,
      data: null,
      validationError: "Sign in to track a shipment.",
    };
  }

  try {
    const response = await trackByQuery({ query: parsed.data.awb, scope });

    // Strip raw vendor error details before anything crosses to the client.
    if (response.error) {
      const { raw: _raw, ...safeError } = response.error;
      return { success: response.success, data: { ...response, error: safeError } };
    }

    return { success: response.success, data: response };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { location: "trackShipmentAction" },
      extra: { query: parsed.data.awb, scope: scope.kind },
    });
    return {
      success: false,
      data: null,
      validationError: "Tracking is unavailable right now. Please try again.",
    };
  }
}

/**
 * The caller's standing, from the session alone. Null when nobody is signed in
 * or the session carries no organisation — in which case nothing is looked up
 * at all, rather than falling back to an unscoped search.
 */
async function resolveScope(): Promise<TrackingScope | null> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return null;

  if (orgId === ARENA_ORG_ID) return { kind: "arena" };

  const org = await getOrgShell();
  if (!org) return null;

  return { kind: "org", orgId: org.id };
}
