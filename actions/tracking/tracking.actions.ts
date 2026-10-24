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
import { updateTag } from "next/cache";
import { z } from "zod";

import {
  trackByQuery,
  type TrackingScope,
} from "@/lib/services/shipmentTracking.service";
import {
  getShipmentLiveTracking,
  liveTrackingTag,
} from "@/lib/services/shipmentLiveTracking.service";
import type { RefreshTrackingResult } from "@/lib/tracking/liveTracking.types";
import { syncShipmentStatusFromTracking } from "@/lib/tracking/carrierStatusSync";
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

// --- REFRESH (shipment detail pages) -----------------------------------------

/**
 * Below this age a refresh returns what is cached instead of asking the
 * carrier again, so a held-down button cannot hammer a vendor API.
 */
const REFRESH_MIN_INTERVAL_MS = 60_000;

const RefreshSchema = z.object({
  shipmentNumber: z.string().min(1).max(50).trim(),
});

/**
 * The Refresh button on the shipment history panel. Re-asks the carrier, then
 * moves the shipment's status forward if the scans are ahead of it (same
 * guarded transition as the sync job; see lib/tracking/carrierStatusSync.ts).
 *
 * Scoped like the track box: a tenant can only refresh their own org's
 * shipment, because the lookup underneath resolves within their org. A number
 * from another org comes back unavailable, which is never cached, so its tag
 * is never touched.
 */
export async function refreshShipmentTrackingAction(input: {
  shipmentNumber: string;
}): Promise<RefreshTrackingResult> {
  const parsed = RefreshSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, data: null, error: "Invalid shipment number." };
  }

  const scope = await resolveScope();
  if (!scope) {
    return { success: false, data: null, error: "Sign in to track a shipment." };
  }

  const number = parsed.data.shipmentNumber;

  try {
    const current = await getShipmentLiveTracking(number, scope);
    const age = Date.now() - new Date(current.fetchedAt).getTime();

    // "unavailable" was never cached, so the read above already asked the
    // carrier just now. Anything younger than the interval is fresh enough.
    const live =
      current.state === "unavailable" || age < REFRESH_MIN_INTERVAL_MS
        ? current
        : (updateTag(liveTrackingTag(number)),
          await getShipmentLiveTracking(number, scope));

    const sync = await syncShipmentStatusFromTracking(number, live);
    return { success: true, data: live, statusChanged: sync.changed };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { location: "refreshShipmentTrackingAction" },
      extra: { shipmentNumber: number, scope: scope.kind },
    });
    return {
      success: false,
      data: null,
      error: "Tracking is unavailable right now. Please try again.",
    };
  }
}

/**
 * Fired by the history panel when the scans it was rendered with are ahead of
 * the shipment's saved status. The page itself cannot write while it renders,
 * so the panel asks once on mount.
 *
 * Reads the same cached answer the page just showed (no second carrier call)
 * under the caller's own scope, so a tenant can only ever sync their own
 * shipment: another org's number resolves to "unavailable" and syncs nothing.
 */
export async function syncShipmentStatusAction(input: {
  shipmentNumber: string;
}): Promise<{ changed: boolean }> {
  const parsed = RefreshSchema.safeParse(input);
  if (!parsed.success) return { changed: false };

  const scope = await resolveScope();
  if (!scope) return { changed: false };

  try {
    const live = await getShipmentLiveTracking(parsed.data.shipmentNumber, scope);
    const sync = await syncShipmentStatusFromTracking(
      parsed.data.shipmentNumber,
      live,
    );
    return { changed: sync.changed };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { location: "syncShipmentStatusAction" },
      extra: { shipmentNumber: parsed.data.shipmentNumber, scope: scope.kind },
    });
    return { changed: false };
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
