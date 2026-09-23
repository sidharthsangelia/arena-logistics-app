/**
 * ARAMEX TRACKING ADAPTER
 * -----------------------------------------------------------------------------
 * Reads a consignment's scans from Aramex and returns them as a canonical
 * timeline.
 *
 * ── THIS WAS A STUB AND IS NOW REAL ─────────────────────────────────────────
 * The previous version was written against the tracking manual's prose and got
 * the response shape, the request flag and the date format wrong — see the note
 * in ./aramex.tracking.types.ts. It was nonetheless REGISTERED, which means the
 * tracking service's AUTO mode (no vendorId given) has been calling it and
 * getting nothing back for every Aramex waybill it was asked about.
 *
 * ── WHY IT TRIES EVERY ACCOUNT ──────────────────────────────────────────────
 * Arena holds several Aramex contracts (lib/aramex/accounts.ts) and a waybill
 * belongs to exactly one of them. The canonical tracking request carries an AWB
 * and nothing else — there is no account hint, and adding one would change a
 * core type for every vendor to serve this one.
 *
 * So the accounts are tried in order and the first that returns SCANS wins.
 * That is cheap (one small read per account, stopping at the first hit),
 * needs no caller change, and degrades honestly: if no account has scans but one
 * of them answered, the empty result it gave is returned rather than an error,
 * because "booked, not yet scanned" is a real and common state.
 */

import { BaseTrackingAdapter } from "../../core/base.tracking.adapter";
import type {
  CanonicalTrackRequest,
  CanonicalTrackResult,
  TrackingEvent,
  TrackingEventType,
} from "../../core/tracking.types";
import type {
  AramexTrackRequest,
  AramexTrackResponse,
  AramexTrackingUpdate,
} from "./aramex.tracking.types";

import {
  aramexAccounts,
  aramexClientInfo,
  aramexConfigurationGap,
} from "@/lib/aramex/accounts";
import { describeResponseErrors } from "@/lib/aramex/notifications";
import { parseWcfDate } from "@/lib/aramex/wcfDate";

const ARAMEX_TRACK_URL =
  process.env.ARAMEX_TRACK_API_URL ??
  "https://ws.aramex.net/ShippingAPI.V2/Tracking/Service_1_0.svc/json/TrackShipments";

const ARAMEX_TRACK_TIMEOUT_MS = Number(
  process.env.ARAMEX_TRACK_TIMEOUT_MS ?? 30_000,
);

/**
 * Aramex operational codes → canonical event types.
 *
 * ── READ THIS BEFORE ADDING A CODE ──────────────────────────────────────────
 * Aramex does not publish this mapping, and the codes are not stable enough
 * across their regions to be worth pretending otherwise. So the codes below are
 * only the ones observed in their own documentation and samples, and the REAL
 * classifier is the description text (see `classify`): every scan carries a
 * human-readable `UpdateDescription`, and that is what Aramex's own tracking
 * page renders.
 *
 * The consequence of a miss is "unknown", which the UI shows as a plain timeline
 * entry with its description intact. That is a perfectly readable outcome, which
 * is why this map is allowed to be incomplete and why nothing here guesses.
 */
const ARAMEX_CODE_MAP: Readonly<Record<string, TrackingEventType>> = {
  SH001: "booked",
  SH003: "in_transit",
  SH005: "in_transit",
  SH006: "in_transit",
  SH014: "delivered",
  SH029: "out_for_delivery",
  SH043: "picked_up",
  SH103: "exception",
  SH104: "attempted",
};

/**
 * Description-text rules, in priority order.
 *
 * ORDER MATTERS and the first two are why. "Delivery attempted" and "Returned to
 * shipper" both contain words that a naive "delivered" test matches, so the
 * negative cases are checked first. A shipment marked delivered when it was
 * refused at the door is the one mistake in this file a customer would actually
 * notice.
 */
const DESCRIPTION_RULES: readonly {
  pattern: RegExp;
  type: TrackingEventType;
}[] = [
  { pattern: /return|rts\b|sent back/i, type: "returned" },
  { pattern: /attempt|undeliver|unsuccessful|no answer|refus/i, type: "attempted" },
  { pattern: /hold|held|exception|damage|delay|detain|seiz|clearance issue/i, type: "exception" },
  { pattern: /delivered|consignee|signed|receiv(ed|er) signature/i, type: "delivered" },
  { pattern: /out for delivery|with (the )?courier|on vehicle/i, type: "out_for_delivery" },
  { pattern: /picked up|collected|pickup/i, type: "picked_up" },
  { pattern: /transit|departed|arrived|processed|customs|facility|sorted|uplift|flight/i, type: "in_transit" },
  { pattern: /shipment created|record created|booked|manifest/i, type: "booked" },
];

export class AramexTrackingAdapter extends BaseTrackingAdapter<
  AramexTrackRequest[],
  AramexTrackResponse
> {
  readonly vendorId = "aramex";
  readonly vendorName = "Aramex";

  /**
   * One request per configured account.
   *
   * Returned as an array for the same reason the rate adapter's fan-out is: it
   * keeps the multi-account behaviour inside the base class's three-step
   * contract instead of overriding `fetchTracking` and losing its error
   * handling.
   */
  protected transformRequest(input: CanonicalTrackRequest): AramexTrackRequest[] {
    const accounts = aramexAccounts();

    if (accounts.length === 0) {
      throw new Error(`Aramex is not configured: ${aramexConfigurationGap()}`);
    }

    return accounts.map((account) => ({
      ClientInfo: aramexClientInfo(account),
      Shipments: [input.awb],
      // Always the full history. A timeline is the point.
      GetLastTrackingUpdateOnly: false,
      Transaction: { Reference1: input.awb },
    }));
  }

  /**
   * Try each account until one has scans.
   *
   * Stops at the first account with events rather than calling all of them, so
   * the common case (the waybill belongs to the first contract) costs exactly
   * one request. The last successful response is the fallback, which is what
   * makes "booked but not yet scanned" report as an empty timeline instead of a
   * vendor error.
   */
  protected async callVendorApi(
    requests: AramexTrackRequest[],
  ): Promise<AramexTrackResponse> {
    let lastSuccess: AramexTrackResponse | null = null;
    const failures: string[] = [];

    for (const request of requests) {
      let response: AramexTrackResponse;

      try {
        response = await this.post(request);
      } catch (err) {
        failures.push(err instanceof Error ? err.message : "unknown error");
        continue;
      }

      if (hasEvents(response, request.Shipments[0])) return response;

      lastSuccess = response;
    }

    if (lastSuccess) return lastSuccess;

    throw new Error(
      `Aramex Tracking API error: ${failures.join("; ") || "no account could be queried"}`,
    );
  }

  protected transformResponse(
    response: AramexTrackResponse,
    awb: string,
  ): CanonicalTrackResult {
    const updates = updatesFor(response, awb);

    const events: TrackingEvent[] = updates
      .map((update) => toEvent(update))
      // A scan whose timestamp could not be read is dropped rather than dated
      // 1970 and sorted to the bottom of a customer's timeline. See parseWcfDate.
      .filter((event): event is TrackingEvent => event !== null);

    // Newest-first, which is the canonical contract.
    events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return {
      vendorId: this.vendorId,
      vendorName: this.vendorName,
      shipmentInfo: {
        awb,
        // Aramex's tracking call returns operational scans and no shipment
        // metadata. Route, service and weight come from our own record, which
        // the merge step in lib/services/shipmentTracking.service.ts supplies.
        weight: readWeight(updates),
      },
      events,
      latestEvent: events[0] ?? null,
      isDelivered: events.some((e) => e.eventType === "delivered"),
    };
  }

  // -------------------------------------------------------------------------

  private async post(request: AramexTrackRequest): Promise<AramexTrackResponse> {
    const res = await fetch(ARAMEX_TRACK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
      cache: "no-store",
      signal: AbortSignal.timeout(ARAMEX_TRACK_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(
        `Aramex Tracking API returned ${res.status} ${res.statusText}`,
      );
    }

    const json = (await res.json()) as AramexTrackResponse;

    if (json.HasErrors) {
      throw new Error(describeResponseErrors(json, "Unknown Aramex error"));
    }

    return json;
  }
}

// ---------------------------------------------------------------------------

/**
 * The scans for one waybill.
 *
 * Aramex keys `TrackingResults` by the AWB as a string. The exact-key match is
 * tried first and a single-entry response is accepted regardless of its key,
 * because a leading zero or a stray space on either side would otherwise lose a
 * result that is plainly the one we asked for.
 */
function updatesFor(
  response: AramexTrackResponse,
  awb: string,
): AramexTrackingUpdate[] {
  const results = response.TrackingResults ?? [];
  if (results.length === 0) return [];

  const wanted = awb.trim();
  const exact = results.find((r) => r.Key?.trim() === wanted);
  if (exact) return exact.Value ?? [];

  return results.length === 1 ? (results[0].Value ?? []) : [];
}

function hasEvents(response: AramexTrackResponse, awb: string): boolean {
  return updatesFor(response, awb).length > 0;
}

function toEvent(update: AramexTrackingUpdate): TrackingEvent | null {
  const timestamp = parseWcfDate(update.UpdateDateTime);
  if (!timestamp) return null;

  const status = update.UpdateDescription?.trim() || "Update";

  return {
    timestamp,
    status,
    description: update.Comments?.trim() || status,
    location: update.UpdateLocation?.trim() || "",
    eventType: classify(update),
    rawStatusCode: update.UpdateCode?.trim() || undefined,
  };
}

/**
 * Code first, then the description text.
 *
 * The code is checked first because it is exact where it is known at all; the
 * description is what carries the meaning in every other case. A ProblemCode
 * beats both: Aramex sets it only when something has actually gone wrong, and a
 * scan that says "Arrived at facility" while carrying a problem code is not a
 * plain in-transit event.
 */
function classify(update: AramexTrackingUpdate): TrackingEventType {
  const code = update.UpdateCode?.trim().toUpperCase();
  if (code && ARAMEX_CODE_MAP[code]) return ARAMEX_CODE_MAP[code];

  const text = `${update.UpdateDescription ?? ""} ${update.Comments ?? ""}`;

  for (const rule of DESCRIPTION_RULES) {
    if (rule.pattern.test(text)) return rule.type;
  }

  if (update.ProblemCode?.trim()) return "exception";

  return "unknown";
}

/**
 * Aramex's own weight for the consignment, when a scan reports one.
 *
 * Sent as a string, and only on some scans. Worth surfacing because it is the
 * figure they will actually invoice on — a discrepancy against what we quoted
 * is something ops want to see rather than discover on a statement.
 */
function readWeight(updates: AramexTrackingUpdate[]): number | undefined {
  for (const update of updates) {
    const raw = update.ChargeableWeight ?? update.GrossWeight;
    const value = Number(String(raw ?? "").trim());
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}
