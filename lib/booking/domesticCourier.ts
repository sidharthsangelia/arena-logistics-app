/**
 * DOMESTIC COURIER BOOKING: SHIPMENT → CANONICAL REQUEST
 * -----------------------------------------------------------------------------
 * The translation between what we stored at booking and what a courier vendor
 * needs to create an order. Kept out of the Inngest function so the function
 * reads as orchestration and this reads as data, and so the validation below
 * can be reasoned about (and tested) on its own.
 *
 * VALIDATION IS THE POINT OF THIS FILE. Everything it throws is a fact about
 * the booking that no number of retries will change: a delivery address with no
 * phone number is not a transient failure. Those come back as
 * DomesticBookingDataError, which the caller turns into a permanent failure and
 * a message ops can act on, rather than four more attempts at the same refusal.
 */

import type { Prisma } from "@/generated/prisma";
import type { CanonicalBookingRequest } from "@/lib/booking-adapters/core/types";
import type { ServiceOption } from "@/types/booking.types";
import { normalizeIndianMobile } from "./phone";

/** Bad data, not a bad connection. Never retried. */
export class DomesticBookingDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomesticBookingDataError";
  }
}

// ---------------------------------------------------------------------------

const ADDRESS_SELECT = {
  contactName: true,
  companyName: true,
  contactPhone: true,
  contactEmail: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  postalCode: true,
} satisfies Prisma.AddressSelect;

/**
 * Everything the booking job reads. Exported as one object so the job, the ops
 * retry action and this builder cannot drift into disagreeing about which
 * fields were loaded.
 */
export const DOMESTIC_COURIER_SHIPMENT_SELECT = {
  id: true,
  shipmentNumber: true,
  orgId: true,
  mode: true,
  status: true,
  bookedAt: true,
  createdAt: true,

  codEnabled: true,
  codAmount: true,
  quotedTotal: true,
  totalActualWeightKg: true,

  selectedVendorId: true,
  selectedProductName: true,
  chargesSnapshot: true,

  domesticCourierVendorId: true,
  domesticCourierOrderId: true,
  domesticCourierWarehouseId: true,
  domesticCourierName: true,
  domesticCourierStatus: true,
  domesticAwbNumber: true,
  domesticTrackingUrl: true,
  domesticLabelDocumentId: true,

  org: { select: { name: true } },
  pickupAddress: { select: ADDRESS_SELECT },
  deliveryAddress: { select: ADDRESS_SELECT },
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

export type DomesticCourierShipment = Prisma.ShipmentGetPayload<{
  select: typeof DOMESTIC_COURIER_SHIPMENT_SELECT;
}>;

// ---------------------------------------------------------------------------

/** Prisma Decimal | number | string | null → number. */
function num(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "object" && "toNumber" in (value as object)) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value) || 0;
}

type AddressRow = DomesticCourierShipment["pickupAddress"];

function toParty(address: AddressRow, label: string) {
  const rawPhone = address.contactPhone?.trim();
  const postalCode = address.postalCode?.trim();
  const line1 = address.line1?.trim();

  // Each of these is something a courier physically cannot work without, and
  // each names the exact field so ops can fix it in one look.
  if (!rawPhone) {
    throw new DomesticBookingDataError(
      `The ${label} address has no phone number. Couriers refuse an order without one.`,
    );
  }

  // Checked here, not just at the form, because the row may predate the form
  // rule or have been written by another path. A number the courier will not
  // accept is a permanent failure: five retries end in the same refusal, hours
  // later, with the vendor's own unhelpful wording. Better to say which field
  // and why, once.
  const phone = normalizeIndianMobile(rawPhone);
  if (!phone) {
    throw new DomesticBookingDataError(
      `The ${label} phone number (${rawPhone}) is not a valid Indian mobile. ` +
        `Couriers need ten digits starting 6 to 9.`,
    );
  }
  if (!postalCode) {
    throw new DomesticBookingDataError(
      `The ${label} address has no pincode.`,
    );
  }
  if (!line1) {
    throw new DomesticBookingDataError(
      `The ${label} address has no street address.`,
    );
  }

  return {
    contactName: address.contactName?.trim() || "",
    companyName: address.companyName?.trim() || null,
    phone,
    email: address.contactEmail?.trim() || null,
    line1,
    line2: address.line2?.trim() || null,
    city: address.city?.trim() || "",
    state: address.state?.trim() || "",
    postalCode,
  };
}

/**
 * The service the customer chose, as snapshotted at booking.
 *
 * chargesSnapshot is the ServiceOption the wizard sent, spread over a `price`.
 * It is Json in the database, so it is read defensively: a missing courierId is
 * an ordinary case the caller already handles by re-quoting.
 */
export function readServiceSnapshot(
  shipment: Pick<DomesticCourierShipment, "chargesSnapshot">,
): Partial<ServiceOption> {
  const snapshot = shipment.chargesSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return {};
  }
  return snapshot as Partial<ServiceOption>;
}

/** The vendor that should book this shipment: the one that quoted it. */
export function resolveBookingVendorId(
  shipment: Pick<
    DomesticCourierShipment,
    "domesticCourierVendorId" | "selectedVendorId" | "chargesSnapshot"
  >,
): string | null {
  // An order already pushed belongs to whoever holds it, regardless of what the
  // quote said. Only then fall back to the selection.
  return (
    shipment.domesticCourierVendorId?.trim() ||
    shipment.selectedVendorId?.trim() ||
    readServiceSnapshot(shipment).vendorId?.trim() ||
    null
  );
}

/**
 * Build the vendor-neutral booking request.
 *
 * `orderDate` is derived from bookedAt rather than "today" so that a retry a
 * day later still sends the date the customer actually booked on.
 */
export function buildDomesticBookingRequest(
  shipment: DomesticCourierShipment,
): CanonicalBookingRequest {
  if (!shipment.packages.length) {
    throw new DomesticBookingDataError(
      "The shipment has no packages, so there is nothing to book.",
    );
  }

  const pickup = toParty(shipment.pickupAddress, "pickup");
  const delivery = toParty(shipment.deliveryAddress, "delivery");

  if (!delivery.state || !delivery.city) {
    throw new DomesticBookingDataError(
      "The delivery address is missing its city or state. Couriers need both to route a parcel.",
    );
  }

  const parcels = shipment.packages.map((p) => ({
    quantity: Math.max(1, p.quantity),
    weightKg: num(p.weightKg),
    lengthCm: num(p.lengthCm),
    widthCm: num(p.widthCm),
    heightCm: num(p.heightCm),
  }));

  // The stored total is what the customer was quoted on. Falling back to the
  // sum of the boxes covers old rows that never had one.
  const totalActualWeightKg =
    num(shipment.totalActualWeightKg) ||
    parcels.reduce((sum, p) => sum + p.weightKg * p.quantity, 0);

  if (totalActualWeightKg <= 0) {
    throw new DomesticBookingDataError(
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
        ? p.contents.reduce((s, c) => s + num(c.unitValue) * Math.max(1, c.quantity), 0)
        : num(p.declaredValue) * Math.max(1, p.quantity)),
    0,
  );

  const service = readServiceSnapshot(shipment);
  const vendorId = resolveBookingVendorId(shipment);
  if (!vendorId) {
    throw new DomesticBookingDataError(
      "No vendor is recorded against this booking, so there is nobody to book it with.",
    );
  }

  return {
    reference: shipment.id,
    displayReference: shipment.shipmentNumber,
    orderDate: (shipment.bookedAt ?? shipment.createdAt)
      .toISOString()
      .slice(0, 10),

    pickup,
    delivery,

    parcels,
    totalActualWeightKg,
    items,
    declaredValue,

    payment: shipment.codEnabled
      ? { type: "COD", codAmount: num(shipment.codAmount) || declaredValue }
      : { type: "PREPAID" },

    freightCharge: num(shipment.quotedTotal) || null,

    service: {
      vendorId,
      courierId: service.courierId?.trim() || null,
      productName: shipment.selectedProductName ?? service.productName ?? null,
    },
  };
}
