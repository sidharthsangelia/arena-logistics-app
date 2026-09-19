/**
 * lib/publicApi/serialize.ts
 * -----------------------------------------------------------------------------
 * The boundary between what we know and what a partner site is told.
 *
 * Everything leaving /api/v1 passes through here. Two jobs:
 *
 *  1. SHAPE. The canonical types are internal and will keep changing — they
 *     carry vendor ids, raw status codes and debugging fields. The public shape
 *     is a deliberate, documented subset, so refactoring the adapters cannot
 *     accidentally become a breaking change for an integrator.
 *
 *  2. BRANDING. An external website is a customer surface by definition, so the
 *     sourcing vendor is masked exactly as it is for a tenant: through
 *     lib/branding/serviceName.ts, the same single decision point the
 *     calculator, quote sheet and PDFs use. See carrierBranding.md.
 *
 * ── THE LEAK GUARD ──────────────────────────────────────────────────────────
 * Masking each field by hand is only as good as the list of fields somebody
 * remembered. Vendor names turn up in places nobody predicted: inside a vendor
 * error message, inside a tracking event description a courier wrote. So after
 * the shaping is done, `scrubVendorBrands` walks the finished object and masks
 * any remaining string that still names a sourcing vendor, and reports to
 * Sentry when it has to — a hit means a field is being forgotten upstream and
 * wants fixing at the source, not just scrubbing here.
 *
 * This is belt and braces on purpose. carrierBranding.md 12.2 records what the
 * failure costs: a customer who reads "sKart" on a quote can search for sKart
 * and buy direct.
 */

import * as Sentry from "@sentry/nextjs";

import { brandServiceName, containsVendorBrand } from "@/lib/branding/serviceName";
import type {
  CanonicalChargeBreakdown,
  RateQuote,
  VendorError,
} from "@/lib/rate-adapters/core/types";
import type {
  CanonicalTrackResult,
  TrackingEvent,
  TrackingEventType,
  TrackingLegKind,
  TrackingLegSummary,
} from "@/lib/tracking-adapters/core/tracking.types";

// ---------------------------------------------------------------------------
// Public shapes — this is the documented contract. Change with a version bump.
// ---------------------------------------------------------------------------

export interface PublicCharge {
  /** e.g. "Freight", "Fuel Surcharge", "GST". Vendor wording, brand-masked. */
  name: string;
  /** Sell amount for this line, markup already applied. */
  amount: number;
  currency: string;
  /**
   * The vendor's own tax split, passed through as given, with markup applied.
   *
   * Only the fields the vendor actually itemised are present: a source that
   * reports one combined figure produces taxAmount alone, and one that splits
   * an intra-state supply produces cgst and sgst. We do not derive the missing
   * ones. An invented split that ends up on an invoice is a dispute, and the
   * vendor is the only authority on which heads a charge falls under.
   */
  igst?: number;
  cgst?: number;
  sgst?: number;
  taxAmount?: number;
}

export interface PublicQuote {
  /**
   * Stable within one response only: the caller uses it to tie a chosen row
   * back to the quote it came from. It is NOT a booking token and carries no
   * meaning on a later request.
   */
  id: string;
  /** Brand-masked service name, e.g. "Arena Direct", "DHL Express". */
  service: string;
  /**
   * The source's own id for this exact service, where it has one. Null for
   * sources that do not expose one.
   *
   * It is an opaque token, not a carrier name, so it carries no branding. Its
   * use is precision: a caller that stores it can refer to the exact service a
   * customer chose rather than re-matching on a display name that may be
   * spelled differently on the next call.
   */
  courierId?: string | null;
  currency: string;
  /** Sell price including tax. This is the number to show a customer. */
  totalWithTax: number;
  /** Sell price excluding tax. */
  totalWithoutTax: number;
  /** Estimated transit days. 0 means the vendor did not say. */
  transitDays: number;
  charges: PublicCharge[];
}

/** A vendor that failed, told without naming the vendor. */
export interface PublicWarning {
  /**
   * NO_SERVICE   the lane is not served by one of our sources
   * RATE_LIMITED that source was throttling us
   * UNAVAILABLE  that source errored or timed out
   */
  code: "NO_SERVICE" | "RATE_LIMITED" | "UNAVAILABLE";
  message: string;
}

export interface PublicTrackingEvent {
  /** ISO-8601 UTC. */
  timestamp: string;
  status: string;
  description: string;
  location: string;
  eventType: TrackingEventType;
  /** Which leg produced it, on a merged multi-leg timeline. */
  leg?: TrackingLegKind;
  legLabel?: string;
}

export interface PublicTrackingLeg {
  kind: TrackingLegKind;
  label: string;
  awb: string | null;
  carrier?: string;
  eventCount: number;
}

export interface PublicTrackingResult {
  shipment: {
    awb: string;
    /** Arena shipment number, present only when it resolved to our booking. */
    reference?: string;
    route?: string;
    /** Brand-masked carrier name. */
    carrier?: string;
    /** Brand-masked service name. */
    service?: string;
    shipDate?: string;
    weightKg?: number;
    pieces?: number;
    destination?: string;
  };
  status: {
    /** Latest event's label, e.g. "Out for Delivery". Null before any scan. */
    current: string | null;
    eventType: TrackingEventType | null;
    isDelivered: boolean;
    /** ISO-8601 timestamp of the latest event, or null. */
    lastUpdatedAt: string | null;
  };
  legs: PublicTrackingLeg[];
  /** Newest first. */
  events: PublicTrackingEvent[];
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

function toPublicCharge(charge: CanonicalChargeBreakdown): PublicCharge {
  // Every tax field the vendor set is passed through as it stands. An earlier
  // version collapsed igst/cgst/sgst into one figure, on the grounds that a
  // partner site rendering a price drawer has no use for the split. That was a
  // decision about someone else's UI made inside our serialiser, and it threw
  // away the only authoritative record of which heads a charge falls under.
  //
  // Absent stays absent. Deriving a combined taxAmount by summing a split the
  // vendor did not report would invent the very fact this exists to preserve.
  return {
    name: brandServiceName(charge.name) || charge.name,
    amount: charge.amount,
    currency: charge.currency,
    ...(charge.igst !== undefined ? { igst: charge.igst } : {}),
    ...(charge.cgst !== undefined ? { cgst: charge.cgst } : {}),
    ...(charge.sgst !== undefined ? { sgst: charge.sgst } : {}),
    ...(charge.taxAmount !== undefined ? { taxAmount: charge.taxAmount } : {}),
  };
}

/**
 * One marked-up quote, as a partner sees it.
 *
 * `index` only feeds the row id. It is not an ordering guarantee — the service
 * layer already sorts cheapest first and we preserve that order.
 */
export function toPublicQuote(quote: RateQuote, index: number): PublicQuote {
  return {
    id: `q_${index + 1}`,
    // `false` is not a decision made here: an external caller is never Arena
    // staff, so there is no branch. Passing the flag at all would invite one.
    service: brandServiceName(quote.productName),
    ...(quote.courierId !== undefined ? { courierId: quote.courierId } : {}),
    currency: quote.currency,
    totalWithTax: quote.totalWithTax,
    totalWithoutTax: quote.totalWithoutTax,
    transitDays: quote.tatDays,
    charges: quote.charges.map(toPublicCharge),
  };
}

/**
 * A vendor failure, reduced to something safe to publish.
 *
 * The vendor's own message is DISCARDED, not masked: it routinely names the
 * vendor ("Shipmozo track-order error: …"), sometimes quotes an internal
 * account id, and is written for our engineers. What a partner needs is which
 * of three situations they are in, and each of those gets one fixed sentence.
 */
export function toPublicWarning(error: VendorError): PublicWarning {
  switch (error.kind) {
    case "NO_SERVICE":
      return {
        code: "NO_SERVICE",
        message: "One of our sources does not serve this route.",
      };
    case "RATE_LIMITED":
      return {
        code: "RATE_LIMITED",
        message: "One of our sources is temporarily throttling requests.",
      };
    case "AUTH_ERROR":
    case "CONFIG_ERROR":
    case "TIMEOUT":
    case "VENDOR_ERROR":
    case "UNKNOWN":
    default:
      return {
        code: "UNAVAILABLE",
        message: "One of our sources did not respond in time.",
      };
  }
}

/**
 * True when every vendor that failed did so by declining the lane.
 *
 * The distinction decides the HTTP status when there are no quotes: an
 * unserviceable lane is a valid, complete answer (200 with an empty list), and
 * four sources being down is not (502). An integrator has to be able to tell
 * "nobody flies there" from "try again in a minute".
 */
export function allFailuresAreNoService(errors: VendorError[]): boolean {
  return errors.length > 0 && errors.every((e) => e.kind === "NO_SERVICE");
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

function toPublicEvent(event: TrackingEvent): PublicTrackingEvent {
  return {
    timestamp: event.timestamp,
    status: event.status,
    description: event.description,
    location: event.location,
    eventType: event.eventType,
    // rawStatusCode is deliberately dropped: it is a vendor's internal code,
    // documented nowhere a partner can read, and stable only by accident.
    ...(event.leg ? { leg: event.leg } : {}),
    ...(event.legLabel ? { legLabel: event.legLabel } : {}),
  };
}

function toPublicLeg(leg: TrackingLegSummary): PublicTrackingLeg {
  return {
    kind: leg.kind,
    label: leg.label,
    awb: leg.awb,
    ...(leg.carrier ? { carrier: brandServiceName(leg.carrier) } : {}),
    eventCount: leg.eventCount,
    // leg.error is an internal diagnostic ("the lookup broke" vs "no scans
    // yet"). Ops needs it; a partner cannot act on it.
  };
}

export function toPublicTrackingResult(
  result: CanonicalTrackResult,
): PublicTrackingResult {
  const info = result.shipmentInfo;
  const latest = result.latestEvent;

  return {
    shipment: {
      awb: info.awb,
      ...(info.reference ? { reference: info.reference } : {}),
      ...(info.route ? { route: info.route } : {}),
      ...(info.carrier ? { carrier: brandServiceName(info.carrier) } : {}),
      ...(info.service ? { service: brandServiceName(info.service) } : {}),
      ...(info.shipDate ? { shipDate: info.shipDate } : {}),
      ...(info.weight !== undefined ? { weightKg: info.weight } : {}),
      ...(info.numberOfPieces !== undefined ? { pieces: info.numberOfPieces } : {}),
      ...(info.destination ? { destination: info.destination } : {}),
    },
    status: {
      current: latest?.status ?? null,
      eventType: latest?.eventType ?? null,
      isDelivered: result.isDelivered,
      lastUpdatedAt: latest?.timestamp ?? null,
    },
    legs: (result.legs ?? []).map(toPublicLeg),
    events: result.events.map(toPublicEvent),
  };
}

// ---------------------------------------------------------------------------
// The leak guard
// ---------------------------------------------------------------------------

/**
 * Walk a finished payload and mask any string that still names a sourcing
 * vendor. Returns a new object; the input is not mutated.
 *
 * `where` is a label for the Sentry event, e.g. "rates:international". A hit is
 * reported once per response, not once per string, and the report names the
 * paths that tripped — never their values, since those contain the leak we are
 * trying not to spread into a third system.
 */
export function scrubVendorBrands<T>(payload: T, where: string): T {
  const hits: string[] = [];
  const cleaned = walk(payload, "", hits) as T;

  if (hits.length > 0) {
    Sentry.captureMessage("Public API response contained a sourcing vendor name", {
      level: "warning",
      tags: { location: "publicApi.scrubVendorBrands", endpoint: where },
      extra: { paths: hits.slice(0, 20), count: hits.length },
    });
  }

  return cleaned;
}

function walk(value: unknown, path: string, hits: string[]): unknown {
  if (typeof value === "string") {
    if (!containsVendorBrand(value)) return value;
    hits.push(path || "(root)");
    // brandServiceName removes the token and keeps the rest of the sentence,
    // which is what we want for a description as much as for a service label.
    return brandServiceName(value);
  }

  if (Array.isArray(value)) {
    return value.map((item, i) => walk(item, `${path}[${i}]`, hits));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = walk(child, path ? `${path}.${key}` : key, hits);
    }
    return out;
  }

  return value;
}
