/**
 * lib/labels/awb/fromShipment.ts
 *
 * A booked domestic shipment, as label data.
 *
 * ── THE PRIVACY RULE IS ENFORCED BY WHAT THIS FILE CAN SEE ──────────────────
 * The item table must carry a CATEGORY, never a product name. A comment saying
 * so would be worth nothing, so the select below simply does not fetch
 * `packages.contents`. `PackageContentItem.description` holds the specific
 * product ("Apple iPhone 15 Pro, 256GB"); `PackageItem.description` holds the
 * box-level summary ("Apparel carton"), which is the category this label wants.
 *
 * The narrow select is the enforcement. There is no path from this function to
 * a product name, so no future edit can leak one onto the outside of a carton
 * by accident. Widening the select is the thing to refuse in review.
 *
 * ── THE BARCODE CARRIES THE CARRIER'S NUMBER ────────────────────────────────
 * `domesticAwbNumber`, not `shipmentNumber`. The label is Arena-branded but it
 * has to survive the courier's own sortation network, and those scanners expect
 * the waybill the courier issued. An ARN in that barcode produces a label that
 * looks perfect and cannot be routed, which is the most expensive way for this
 * to be wrong. Our own reference still appears, as the order id and ref, with
 * its own barcode for our own handling.
 */

import "server-only";

import { Prisma, ShipmentMode } from "@/generated/prisma";
import { prisma } from "@/utils/db";

import {
  describeDimensions,
  describeItems,
  splitServiceName,
} from "./shipmentShape";
import { AwbLabelDataError, type AwbLabelData } from "./types";

const ADDRESS_SELECT = {
  contactName: true,
  companyName: true,
  contactPhone: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  postalCode: true,
} satisfies Prisma.AddressSelect;

/**
 * Everything the label reads, and deliberately nothing more.
 *
 * `packages.contents` is absent on purpose. See the note at the top.
 */
export const LABEL_SHIPMENT_SELECT = {
  id: true,
  shipmentNumber: true,
  orgId: true,
  mode: true,

  codEnabled: true,
  codAmount: true,
  totalActualWeightKg: true,

  selectedProductName: true,
  domesticCourierName: true,
  domesticAwbNumber: true,

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
    },
  },
} satisfies Prisma.ShipmentSelect;

export type LabelShipment = Prisma.ShipmentGetPayload<{
  select: typeof LABEL_SHIPMENT_SELECT;
}>;

/** Arena's own legal identity, as it must read on the return-to block. */
const ARENA_LEGAL_NAME = "ARENA CARGO AND LOGISTICS INDIA PRIVATE LIMITED";

// ---------------------------------------------------------------------------

/** Prisma Decimal | number | string | null → number. */
function num(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "object" && "toNumber" in (value as object)) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value) || 0;
}

function joinAddress(address: {
  line1: string | null;
  line2: string | null;
}): string {
  return [address.line1, address.line2]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Package rows carry Prisma Decimals; the shape helpers want plain numbers.
 * Converted here, at the database boundary, so the rules stay pure.
 */
function toLabelPackages(packages: LabelShipment["packages"]) {
  return packages.map((pkg) => ({
    description: pkg.description,
    quantity: pkg.quantity,
    lengthCm: num(pkg.lengthCm),
    widthCm: num(pkg.widthCm),
    heightCm: num(pkg.heightCm),
  }));
}

// ---------------------------------------------------------------------------

/**
 * Build label data from a loaded shipment.
 *
 * Pure, so it can be tested without a database. The loading and the org scoping
 * are the caller's job; see `loadLabelData` below.
 */
export function buildLabelData(shipment: LabelShipment): AwbLabelData {
  if (shipment.mode !== ShipmentMode.DOMESTIC) {
    throw new AwbLabelDataError(
      `Shipment ${shipment.shipmentNumber} is international; its carrier issues its own waybill and label.`,
    );
  }

  const awbNumber = shipment.domesticAwbNumber?.trim();
  if (!awbNumber) {
    // Not a bug and not a data error the customer can fix: the courier order
    // simply has not returned a waybill yet. Named clearly so the route can
    // answer with something better than a 500.
    throw new AwbLabelDataError(
      `Shipment ${shipment.shipmentNumber} has no courier AWB yet, so there is nothing to print.`,
    );
  }

  const to = shipment.deliveryAddress;
  const from = shipment.pickupAddress;

  const service = splitServiceName(
    shipment.domesticCourierName ?? shipment.selectedProductName,
  );

  const boxes = toLabelPackages(shipment.packages);
  const weightKg = num(shipment.totalActualWeightKg);

  return {
    receiverName: to.contactName?.trim() || to.companyName?.trim() || "Consignee",
    receiverAddress: joinAddress(to),
    receiverCity: to.city?.trim() ?? "",
    receiverState: to.state?.trim() ?? "",
    receiverPinCode: to.postalCode?.trim() ?? "",
    receiverMobile: to.contactPhone?.trim() ?? "",

    courierName: service.courierName,
    courierWeightTier: service.courierWeightTier,
    awbNumber,
    dimensions: describeDimensions(boxes),
    weight: weightKg > 0 ? `${weightKg.toFixed(2)} kg` : "",

    // Arena is the return address, not the customer: the parcel was collected
    // into our network and an undelivered one comes back to us.
    senderCompanyName: ARENA_LEGAL_NAME,
    senderContactName: from.contactName?.trim() || shipment.org.name,
    senderAddress: [joinAddress(from), from.city, from.state, from.postalCode]
      .map((part) => part?.toString().trim())
      .filter(Boolean)
      .join(", "),
    senderMobile: from.contactPhone?.trim() ?? "",

    orderId: shipment.shipmentNumber,
    refId: shipment.id,
    paymentType: shipment.codEnabled ? "COD" : "PREPAID",
    codAmount: shipment.codEnabled ? num(shipment.codAmount) : undefined,

    items: describeItems(boxes),
  };
}

/**
 * Load one shipment and turn it into label data.
 *
 * The org id goes INTO the where clause, never into a check afterwards, so
 * another org's shipment id resolves to nothing rather than to something this
 * function then has to decide about. Same rule as the invoice download route.
 */
export async function loadLabelData(
  shipmentId: string,
  orgId: string,
): Promise<AwbLabelData | null> {
  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, orgId },
    select: LABEL_SHIPMENT_SELECT,
  });

  if (!shipment) return null;

  return buildLabelData(shipment);
}

/**
 * The same load with no org in the where clause.
 *
 * ONLY for callers that are not acting on behalf of a request: the booking job
 * is handed a shipment id by an event it emitted itself, so there is no user
 * whose org could be checked and nothing an org id would protect against.
 *
 * Anything reachable from an HTTP request must use `loadLabelData` above. The
 * two are deliberately separate functions rather than one with an optional
 * org id, because an optional scope is one forgotten argument away from being
 * no scope at all.
 */
export async function loadLabelDataUnscoped(
  shipmentId: string,
): Promise<AwbLabelData | null> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: LABEL_SHIPMENT_SELECT,
  });

  if (!shipment) return null;

  return buildLabelData(shipment);
}
