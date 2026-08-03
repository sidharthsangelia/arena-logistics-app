/**
 * FIRST-MILE BOOKING: SHIPMENT → CANONICAL REQUEST
 * -----------------------------------------------------------------------------
 * The door → hub leg of an international shipment, as a DOMESTIC courier order.
 *
 * That is the whole trick, and it is why this file is short. A first-mile
 * pickup is not a special kind of booking: it is an ordinary India → India
 * forward order whose consignee happens to be Arena's hub rather than the
 * customer's customer. So it builds a CanonicalBookingRequest — the same shape
 * bookDomesticCourier uses — and rides the SAME booking adapters, the same
 * courier resolution and the same label handling. Nothing about the first mile
 * needed a vendor integration of its own, and giving it one is what left the
 * previous ops action duplicating the adapter's logic inline.
 *
 * Everything thrown here is a fact about the booking that no retry will change,
 * so it comes back as FirstMileDataError and the caller makes it permanent.
 */

import type { Prisma } from "@/generated/prisma";
import type { CanonicalBookingRequest } from "@/lib/booking-adapters/core/types";
import type { ServiceOption } from "@/types/booking.types";
import { FIRST_MILE_HUBS, type FirstMileHub } from "./firstMile";
import { normalizeIndianMobile } from "./phone";

/** Bad data, not a bad connection. Never retried. */
export class FirstMileDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirstMileDataError";
  }
}

// ---------------------------------------------------------------------------

export const FIRST_MILE_SHIPMENT_SELECT = {
  id: true,
  shipmentNumber: true,
  orgId: true,
  status: true,
  bookedAt: true,
  createdAt: true,

  pickupIncluded: true,
  firstMileVendorId: true,
  firstMileVendorName: true,
  firstMileCharge: true,
  firstMileHubLabel: true,
  firstMileChargeSnapshot: true,
  firstMileTrackingNumber: true,
  firstMileShipmozoOrderId: true,
  firstMileShipmozoWarehouseId: true,

  totalActualWeightKg: true,

  org: { select: { name: true } },
  pickupAddress: {
    select: {
      contactName: true,
      companyName: true,
      contactPhone: true,
      contactEmail: true,
      line1: true,
      line2: true,
      city: true,
      state: true,
      postalCode: true,
    },
  },
  packages: {
    select: {
      description: true,
      quantity: true,
      lengthCm: true,
      widthCm: true,
      heightCm: true,
      weightKg: true,
      declaredValue: true,
      contents: {
        select: {
          description: true,
          quantity: true,
          unitValue: true,
          hsCode: true,
        },
      },
    },
  },
} satisfies Prisma.ShipmentSelect;

export type FirstMileShipment = Prisma.ShipmentGetPayload<{
  select: typeof FIRST_MILE_SHIPMENT_SELECT;
}>;

// ---------------------------------------------------------------------------

function num(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "object" && "toNumber" in (value as object)) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value) || 0;
}

/**
 * Which hub this parcel is routed to.
 *
 * The label snapshotted at booking wins, so a shipment keeps going to the hub
 * it was quoted against even after the registry grows. Today there is one hub
 * (Dwarka); nearest-hub selection lands in resolveFirstMileHub without changing
 * anything here.
 */
export function resolveHubForShipment(
  shipment: Pick<FirstMileShipment, "firstMileHubLabel">,
): FirstMileHub {
  const matched =
    shipment.firstMileHubLabel &&
    FIRST_MILE_HUBS.find((h) => h.label === shipment.firstMileHubLabel);

  const hub = matched || FIRST_MILE_HUBS[0];
  if (!hub) {
    throw new FirstMileDataError(
      "No first-mile hub is configured, so there is nowhere to route the pickup to.",
    );
  }
  return hub;
}

/**
 * The first-mile service the customer chose, as snapshotted at booking.
 * firstMileChargeSnapshot is the ServiceOption the wizard sent, over a `price`.
 */
export function readFirstMileSnapshot(
  shipment: Pick<FirstMileShipment, "firstMileChargeSnapshot">,
): Partial<ServiceOption> {
  const snapshot = shipment.firstMileChargeSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return {};
  }
  return snapshot as Partial<ServiceOption>;
}

/** The vendor that should carry this leg: the one that quoted it. */
export function resolveFirstMileVendorId(
  shipment: Pick<
    FirstMileShipment,
    "firstMileVendorId" | "firstMileChargeSnapshot"
  >,
): string {
  return (
    shipment.firstMileVendorId?.trim() ||
    readFirstMileSnapshot(shipment).vendorId?.trim() ||
    // Shipmozo is the only domestic vendor Arena has ever priced a first mile
    // with, and rows created before firstMileVendorId existed carry nothing.
    "shipmozo"
  );
}

// ---------------------------------------------------------------------------

/**
 * Build the door → hub booking request.
 *
 * Pickup is the customer's door. Delivery is the hub, whose contact details
 * fall back to the pickup contact when the hub config leaves them blank — the
 * courier needs a name and a number at the delivery end, and inventing a hub
 * contact record for a single constant would be more config than it is worth.
 */
export function buildFirstMileBookingRequest(
  shipment: FirstMileShipment,
): CanonicalBookingRequest {
  if (!shipment.pickupIncluded) {
    throw new FirstMileDataError(
      "This shipment does not include door pickup, so there is no first mile to book.",
    );
  }
  if (!shipment.packages.length) {
    throw new FirstMileDataError(
      "The shipment has no packages, so there is nothing to collect.",
    );
  }

  const address = shipment.pickupAddress;
  const rawPhone = address.contactPhone?.trim();
  const postalCode = address.postalCode?.trim();
  const line1 = address.line1?.trim();

  if (!rawPhone) {
    throw new FirstMileDataError(
      "The pickup address has no phone number. Couriers refuse a collection without one.",
    );
  }
  const phone = normalizeIndianMobile(rawPhone);
  if (!phone) {
    throw new FirstMileDataError(
      `The pickup phone number (${rawPhone}) is not a valid Indian mobile. Couriers need ten digits starting 6 to 9.`,
    );
  }
  if (!postalCode) {
    throw new FirstMileDataError("The pickup address has no pincode.");
  }
  if (!line1) {
    throw new FirstMileDataError("The pickup address has no street address.");
  }

  const hub = resolveHubForShipment(shipment);
  const hubPhone = normalizeIndianMobile(hub.phone?.trim() || phone) ?? phone;

  const parcels = shipment.packages.map((p) => ({
    quantity: Math.max(1, p.quantity),
    weightKg: num(p.weightKg),
    lengthCm: num(p.lengthCm),
    widthCm: num(p.widthCm),
    heightCm: num(p.heightCm),
  }));

  const totalActualWeightKg =
    num(shipment.totalActualWeightKg) ||
    parcels.reduce((sum, p) => sum + p.weightKg * p.quantity, 0);

  if (totalActualWeightKg <= 0) {
    throw new FirstMileDataError(
      "The shipment has no weight recorded, so no courier can price or carry it.",
    );
  }

  const items = shipment.packages.flatMap((p) =>
    p.contents.length
      ? p.contents.map((c) => ({
          name: c.description?.trim() || "Cargo",
          quantity: Math.max(1, c.quantity),
          unitValue: num(c.unitValue),
          hsCode: c.hsCode?.trim() || null,
        }))
      : [
          {
            name: p.description?.trim() || "Cargo",
            quantity: Math.max(1, p.quantity),
            unitValue: num(p.declaredValue),
            hsCode: null,
          },
        ],
  );

  const declaredValue = shipment.packages.reduce(
    (sum, p) =>
      sum +
      (p.contents.length
        ? p.contents.reduce(
            (s, c) => s + num(c.unitValue) * Math.max(1, c.quantity),
            0,
          )
        : num(p.declaredValue) * Math.max(1, p.quantity)),
    0,
  );

  const snapshot = readFirstMileSnapshot(shipment);

  return {
    // The shipment id, echoed back as `refrence_id` on the tracking webhook.
    // The same reference the export booking uses, which is safe because the two
    // legs live at different vendors' endpoints and are told apart here by
    // which column holds the AWB.
    reference: shipment.id,
    displayReference: shipment.shipmentNumber,
    orderDate: (shipment.bookedAt ?? shipment.createdAt)
      .toISOString()
      .slice(0, 10),

    pickup: {
      contactName: address.contactName?.trim() || "Consignor",
      companyName: address.companyName?.trim() || null,
      phone,
      email: address.contactEmail?.trim() || null,
      line1,
      line2: address.line2?.trim() || null,
      city: address.city?.trim() || "",
      state: address.state?.trim() || "",
      postalCode,
    },

    // The consignee is our own hub: this is a forward order that happens to end
    // at a warehouse we control.
    delivery: {
      contactName:
        hub.contactName?.trim() || address.contactName?.trim() || "Arena Hub",
      companyName: "Arena Logistics",
      phone: hubPhone,
      email: hub.email?.trim() || address.contactEmail?.trim() || null,
      line1: hub.line1,
      line2: null,
      city: hub.city,
      state: hub.state,
      postalCode: hub.postalCode,
    },

    parcels,
    totalActualWeightKg,
    items,
    declaredValue,

    // Never COD. The customer has already paid Arena for this leg; asking our
    // own hub to hand cash to a courier on arrival would be absurd.
    payment: { type: "PREPAID" },

    freightCharge: num(shipment.firstMileCharge) || null,

    service: {
      vendorId: resolveFirstMileVendorId(shipment),
      courierId: snapshot.courierId?.trim() || null,
      productName: shipment.firstMileVendorName ?? snapshot.productName ?? null,
    },
  };
}
