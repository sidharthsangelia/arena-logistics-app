/**
 * lib/booking/firstMile.ts
 *
 * First-mile (door → carrier hub) config + request builder.
 *
 * When a customer opts into door pickup on the Packages step, the parcel first
 * travels from the sender's door to the nearest international-carrier hub via a
 * DOMESTIC courier (priced through Shipmozo's domestic rate calculator). This
 * module is the single source of truth for:
 *
 *   1. The hub registry — currently a CONFIG CONSTANT with one entry (Dwarka).
 *      Nearest-hub selection is a future change; for now every shipment routes
 *      to Dwarka regardless of pickup location.
 *   2. Resolving which address the parcel is collected from (pickup vs sender).
 *   3. Building the canonical RateRequest handed to getDomesticRatesAction.
 *
 * The org's markup is applied inside getDomesticRatesAction (same as the intl
 * flow), so nothing here deals with pricing/markup — it only shapes the request.
 */

import type { BookingFormData, ConsignorForm } from "@/types/booking.types";
import type { RateRequest } from "@/lib/types";
import {
  boxesToRatePackages,
  totalActualWeight,
  totalBoxCount,
  totalDeclaredValue,
} from "@/lib/booking/cargo";

// ---------------------------------------------------------------------------
// Which vendors may quote a first-mile leg
// ---------------------------------------------------------------------------

/**
 * The first-mile step prices through the DOMESTIC rate registry, which now
 * holds more vendors than can actually collect a parcel for us.
 *
 * A first-mile pickup is not a quote, it is a leg of an export that gets booked
 * by `lib/inngest/functions/bookFirstMilePickup.ts` — through the same
 * `resolveBookingAdapter` lookup as a domestic booking. A vendor with no
 * booking adapter selected here would take the customer's money and then leave
 * the door → hub leg of an international shipment unplaced.
 *
 * So this list is "vendors that can quote AND book", not "vendors that can
 * quote". The domestic booking wizard pins the same rule in
 * DOMESTIC_BOOKABLE_VENDOR_IDS.
 *
 * SPEEDOPOST IS DELIBERATELY ABSENT, even though it gained a booking adapter on
 * 2026-09-05 and is on the domestic list. The difference is the deadline. This
 * leg has to reach an Arena hub in time for a specific export, and SpeedoPost
 * publishes no way to ask whether an order they never answered about actually
 * landed, so its adapter refuses to retry an ambiguous create and hands the
 * booking to ops instead (the reasoning is in the header of
 * speedopost.booking.adapter.ts). A domestic door → door shipment in that state
 * waits a few hours for a person. A first-mile leg in that state misses a
 * flight. Revisit once SpeedoPost answers whether `clientOrderId` is enforced
 * unique, which is the question that would let the retry be safe.
 */
export const FIRST_MILE_VENDOR_IDS = ["shipmozo"] as const;

// ---------------------------------------------------------------------------
// Hub registry (config constant for now — nearest-hub routing is future)
// ---------------------------------------------------------------------------

export interface FirstMileHub {
  /** Stable id persisted on the shipment snapshot. */
  id: string;
  /** Human label shown in the UI and stored in firstMileHubLabel. */
  label: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string; // ISO alpha-2
  /**
   * Consignee contact for the first-mile forward order (the parcel is delivered
   * TO the hub). Phone is required by Shipmozo; it can be overridden per env
   * with SHIPMOZO_HUB_PHONE / SHIPMOZO_HUB_CONTACT_NAME / SHIPMOZO_HUB_EMAIL.
   */
  contactName?: string;
  phone?: string;
  email?: string;
}

export const FIRST_MILE_HUBS: FirstMileHub[] = [
  {
    id: "dwarka-del",
    label: "Dwarka, New Delhi",
    line1: "KH. NO. 174, Dhulsiras, Dwarka, Phase-2, Sector-24",
    city: "New Delhi",
    state: "Delhi",
    postalCode: "110077",
    country: "India",
    countryCode: "IN",
    contactName: "Arena Logistics Hub",
  },
];

/**
 * Resolves the hub the parcel should be routed to. Nearest-hub selection is a
 * future change — today it always returns the single Dwarka hub. Never throws:
 * an empty registry would be a deploy/config error, but callers should degrade
 * gracefully rather than crash the wizard, so we return null in that case.
 */
export function resolveFirstMileHub(_data: BookingFormData): FirstMileHub | null {
  return FIRST_MILE_HUBS[0] ?? null;
}

// ---------------------------------------------------------------------------
// Pickup source — where the parcel is physically collected
// ---------------------------------------------------------------------------

/**
 * The address the first-mile courier collects from: the dedicated pickup
 * address when the user entered a separate one, otherwise the sender. Mirrors
 * the same fallback used when persisting the pickup Address in createShipment.
 */
export function firstMilePickupSource(data: BookingFormData): ConsignorForm {
  return !data.pickupSameAsSender && data.pickup ? data.pickup : data.consignor;
}

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------

/**
 * Builds the domestic RateRequest for the door → hub leg. The Shipmozo domestic
 * adapter only needs pincodes + the box array, so the important fields are the
 * origin/destination pincodes and the real per-box packages.
 *
 * Throws if the pickup pincode is missing — a first-mile quote is impossible
 * without it, and surfacing that as a clear error beats sending a request the
 * adapter would reject with a vendor-level message.
 */
export function buildFirstMileRequest(
  data: BookingFormData,
  hub: FirstMileHub,
): RateRequest {
  const source = firstMilePickupSource(data);

  const pickupPincode = (source.postalCode ?? "").trim();
  if (!pickupPincode) {
    throw new Error(
      "A pickup pincode is required to price door pickup. Add it to the sender/pickup address.",
    );
  }

  const boxes = data.boxes;
  if (!boxes.length) {
    throw new Error("At least one box is required to price door pickup.");
  }

  const packages = boxesToRatePackages(boxes);

  return {
    origin: {
      city: source.city,
      pincode: pickupPincode,
      countryCode: "IN",
      country: "India",
      line1: source.addressLine1,
    },
    destination: {
      city: hub.city,
      pincode: hub.postalCode,
      countryCode: hub.countryCode,
      country: hub.country,
      line1: hub.line1,
    },
    shipment: {
      packages,
      // Domestic (India → India) declared value drives Shipmozo's ROV; reuse
      // the same total declared cargo value as the intl leg.
      declaredValue: totalDeclaredValue(boxes),
      description: boxes[0]?.contents[0]?.description || "General Cargo",
      // Legacy aggregate fallback — first box represents dimensions.
      weight: totalActualWeight(boxes),
      quantity: totalBoxCount(boxes),
      dimensions: {
        length: Math.max(Number(boxes[0]?.lengthCm) || 0, 1),
        width: Math.max(Number(boxes[0]?.widthCm) || 0, 1),
        height: Math.max(Number(boxes[0]?.heightCm) || 0, 1),
        unit: "cm" as const,
      },
    },
  };
}
