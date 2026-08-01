import "server-only";

import { prisma } from "@/utils/db";
import { ShipmentMode, ShipmentStatus } from "@/generated/prisma";
import type { TrackingLegKind } from "@/lib/tracking-adapters/core/tracking.types";

export { looksLikeShipmentNumber } from "./queryShape";

/**
 * lib/tracking/shipmentResolve.ts
 *
 * Turns whatever somebody typed into the track box into a plan: which vendor to
 * ask, for which waybill, on which leg.
 *
 * Customers hold two different numbers and cannot be expected to know which is
 * which. Ours (ARN260130748291) is on the confirmation email and the invoice;
 * the carrier's AWB is on the label. Both must work, so this looks the entered
 * value up against our own number AND every waybill column we record, in one
 * indexed query.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It never falls back to "some shipment that looks similar". A miss returns
 * null and the caller asks the vendors directly with the raw string — a carrier
 * AWB for a shipment Arena never booked is a legitimate thing to type, and the
 * customer gets a real answer instead of "not found".
 */

// --- SCOPE -------------------------------------------------------------------

/**
 * Who is asking. Arena staff resolve any booking; a tenant resolves only their
 * own org's, so our shipment numbers cannot be walked from another account.
 * The distinction is decided from the session in the server action, never
 * passed in from the client.
 */
export type TrackingScope =
  | { kind: "arena" }
  | { kind: "org"; orgId: string };

// --- PLAN --------------------------------------------------------------------

/** One vendor lookup to perform. */
export interface TrackingLegPlan {
  kind: TrackingLegKind;
  label: string;
  /** Adapter to call. Null means there is no adapter for this vendor. */
  vendorId: string | null;
  awb: string;
  /** The courier we recorded at booking, e.g. "Delhivery". */
  carrier?: string;
}

export interface ResolvedShipment {
  id: string;
  shipmentNumber: string;
  mode: ShipmentMode;
  status: ShipmentStatus;
  /** Legs with a waybill, in journey order. Empty until a carrier issues one. */
  legs: TrackingLegPlan[];
  /** "Mumbai, Maharashtra → Dubai, United Arab Emirates" */
  route: string;
  /** Best carrier name we hold, for the header when no leg reports one. */
  carrier: string | null;
  /** Actual weight in kg, when recorded. */
  weightKg?: number;
  /** Number of physical boxes. */
  pieces?: number;
  bookedAt: Date | null;
}

// --- LOOKUP ------------------------------------------------------------------

/**
 * Find the booking behind an entered number, or null.
 *
 * The OR spans our shipment number and all four waybill columns, every one of
 * which is indexed (shipmentNumber is unique; mawb, hawb and domesticAwb have
 * their own indexes). firstMileTrackingNumber does not, but it is only reached
 * on a miss against the others and the table is small enough that it is not
 * worth a migration yet.
 */
export async function resolveTrackedShipment(
  rawQuery: string,
  scope: TrackingScope,
): Promise<ResolvedShipment | null> {
  const query = rawQuery.trim();
  if (!query) return null;

  const number = query.toUpperCase();

  const shipment = await prisma.shipment.findFirst({
    where: {
      ...(scope.kind === "org" ? { orgId: scope.orgId } : {}),
      OR: [
        { shipmentNumber: number },
        { domesticAwbNumber: query },
        { hawbNumber: query },
        { mawbNumber: query },
        { firstMileTrackingNumber: query },
      ],
    },
    select: {
      id: true,
      shipmentNumber: true,
      mode: true,
      status: true,
      bookedAt: true,
      totalActualWeightKg: true,

      selectedVendorId: true,
      selectedVendorName: true,

      mawbNumber: true,
      hawbNumber: true,
      carrierAirline: true,

      pickupIncluded: true,
      firstMileTrackingNumber: true,
      firstMileVendorId: true,
      firstMileVendorName: true,

      domesticAwbNumber: true,
      domesticCourierVendorId: true,
      domesticCourierName: true,

      pickupAddress: { select: { city: true, state: true, country: true } },
      deliveryAddress: { select: { city: true, state: true, country: true } },
      packages: { select: { quantity: true } },
    },
    // A waybill belongs to exactly one shipment, so this only breaks a tie
    // between rows that share a number they should not share.
    orderBy: { createdAt: "desc" },
  });

  if (!shipment) return null;

  const legs: TrackingLegPlan[] = [];

  if (shipment.mode === ShipmentMode.DOMESTIC) {
    // One door → door courier move. Its progress IS the shipment's progress.
    if (shipment.domesticAwbNumber) {
      legs.push({
        kind: "main",
        label: "Courier",
        // The vendor recorded at booking; every domestic order is placed
        // through a booking adapter whose id matches a tracking adapter's.
        vendorId: shipment.domesticCourierVendorId ?? "shipmozo",
        awb: shipment.domesticAwbNumber,
        carrier: shipment.domesticCourierName ?? undefined,
      });
    }
  } else {
    // International. The door → hub courier runs ahead of, and then alongside,
    // the air leg, so both are tracked and merged rather than one replacing
    // the other — the pickup history stays visible after the parcel flies.
    if (shipment.pickupIncluded && shipment.firstMileTrackingNumber) {
      legs.push({
        kind: "first_mile",
        label: "Door pickup",
        vendorId: shipment.firstMileVendorId ?? "shipmozo",
        awb: shipment.firstMileTrackingNumber,
        carrier: shipment.firstMileVendorName ?? undefined,
      });
    }

    // HAWB first: it is the shipper's own waybill and the one a customer is
    // told to track by. The MAWB covers the whole consolidated load.
    const airAwb = shipment.hawbNumber?.trim() || shipment.mawbNumber?.trim();
    if (airAwb) {
      legs.push({
        kind: "main",
        label: "Air leg",
        vendorId: shipment.selectedVendorId ?? null,
        awb: airAwb,
        carrier: shipment.carrierAirline ?? shipment.selectedVendorName ?? undefined,
      });
    }
  }

  const carrier =
    shipment.mode === ShipmentMode.DOMESTIC
      ? shipment.domesticCourierName ?? shipment.selectedVendorName
      : shipment.carrierAirline ?? shipment.selectedVendorName;

  return {
    id: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    mode: shipment.mode,
    status: shipment.status,
    legs,
    route: `${placeOf(shipment.pickupAddress)} → ${placeOf(shipment.deliveryAddress)}`,
    carrier: carrier ?? null,
    weightKg: shipment.totalActualWeightKg
      ? Number(shipment.totalActualWeightKg)
      : undefined,
    pieces:
      shipment.packages.reduce((n, p) => n + Math.max(1, p.quantity), 0) ||
      undefined,
    bookedAt: shipment.bookedAt,
  };
}

/** "Mumbai, Maharashtra" — state dropped when it repeats the city or is absent. */
function placeOf(
  address: { city: string; state: string | null; country: string } | null,
): string {
  if (!address) return "—";
  const parts = [address.city?.trim()];
  const state = address.state?.trim();
  if (state && state.toLowerCase() !== address.city?.trim().toLowerCase()) {
    parts.push(state);
  }
  return parts.filter(Boolean).join(", ") || address.country;
}
