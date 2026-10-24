import "server-only";

import * as Sentry from "@sentry/nextjs";
import { unstable_cache } from "next/cache";

import { trackByQuery } from "@/lib/services/shipmentTracking.service";
import type { TrackingScope } from "@/lib/tracking/shipmentResolve";
import type { LiveTracking } from "@/lib/tracking/liveTracking.types";

/**
 * lib/services/shipmentLiveTracking.service.ts
 *
 * What the carrier is saying about one of our shipments, for the detail pages.
 *
 * Only Shipmozo pushes status to us (its webhook). Aramex, sKart and SpeedoPost
 * never do, so a shipment booked on them sat at "Booked" on its detail page
 * while the carrier had it delivered. This asks the carriers on page view,
 * through the same leg resolution and vendor masking the /track page uses.
 *
 * This only fetches. Moving the shipment's status from the answer is
 * lib/tracking/carrierStatusSync.ts, called by the detail page, its Refresh
 * button and the 4-hourly sync job, all of which read through this cache.
 *
 * COST
 * Cached per shipment for CACHE_TTL_SECONDS, so reloads and repeat visits do
 * not hit the carrier. The refresh button expires the tag (see
 * refreshShipmentTrackingAction). A timeout or thrown lookup is never cached,
 * so a carrier blip does not stick for the whole window.
 *
 * LATENCY
 * Only Aramex sets its own request timeout; the other clients would wait as
 * long as the carrier does. DEADLINE_MS bounds it here instead of in every
 * client, and the caller renders this inside its own <Suspense>, so the rest of
 * the page never waits on a carrier.
 */

const CACHE_TTL_SECONDS = 15 * 60;
const DEADLINE_MS = 10_000;

export function liveTrackingTag(shipmentNumber: string): string {
  return `shipment-tracking:${shipmentNumber.trim().toUpperCase()}`;
}

export async function getShipmentLiveTracking(
  shipmentNumber: string,
  scope: TrackingScope,
): Promise<LiveTracking> {
  const number = shipmentNumber.trim().toUpperCase();
  // Scope is part of the key, not just the tag: Arena staff get raw vendor
  // names and errors, a customer gets the masked ones, and one org's cached
  // answer must never be served to another.
  const scopeKey = scope.kind === "arena" ? "arena" : `org:${scope.orgId}`;

  // unstable_cache stores whatever resolves. An unavailable answer is carried
  // out of the callback by a throw instead, so it reaches the reader uncached.
  let uncached: LiveTracking | null = null;

  const read = unstable_cache(
    async () => {
      const live = await fetchLiveTracking(number, scope);
      if (live.state === "unavailable") {
        uncached = live;
        throw new Error("live tracking unavailable");
      }
      return live;
    },
    ["shipment-live-tracking", number, scopeKey],
    { tags: [liveTrackingTag(number)], revalidate: CACHE_TTL_SECONDS },
  );

  try {
    return await read();
  } catch (err) {
    if (uncached) return uncached;
    Sentry.captureException(err, {
      tags: { location: "getShipmentLiveTracking" },
      extra: { shipmentNumber: number, scope: scope.kind },
    });
    return unavailable("Tracking is unavailable right now.");
  }
}

async function fetchLiveTracking(
  shipmentNumber: string,
  scope: TrackingScope,
): Promise<LiveTracking> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), DEADLINE_MS);
  });

  try {
    const response = await Promise.race([
      trackByQuery({ query: shipmentNumber, scope }),
      deadline,
    ]);

    if (response === "timeout") {
      return unavailable("The carrier did not respond in time.");
    }

    const result = response.result;
    if (!result) {
      return unavailable(
        response.error?.message ?? "Tracking is unavailable right now.",
      );
    }

    // trackByQuery falls back to our own record when no carrier has a scan,
    // and marks that with an "internal" leg. The detail pages already show our
    // own history, so only the carrier's side is kept here.
    const usedInternal = result.legs?.some((l) => l.kind === "internal") ?? false;
    const legs = (result.legs ?? []).filter((l) => l.kind !== "internal");

    return {
      state: legs.length === 0 ? "no_waybill" : "ok",
      events: usedInternal ? [] : result.events,
      legs,
      isDelivered: !usedInternal && result.isDelivered,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { location: "fetchLiveTracking" },
      extra: { shipmentNumber, scope: scope.kind },
    });
    return unavailable("Tracking is unavailable right now.");
  } finally {
    clearTimeout(timer);
  }
}

function unavailable(message: string): LiveTracking {
  return {
    state: "unavailable",
    events: [],
    legs: [],
    isDelivered: false,
    fetchedAt: new Date().toISOString(),
    message,
  };
}
