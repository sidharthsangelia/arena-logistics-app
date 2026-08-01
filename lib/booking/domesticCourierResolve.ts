/**
 * WHICH COURIER DID THE CUSTOMER ACTUALLY PAY FOR?
 * -----------------------------------------------------------------------------
 * Domestic vendors identify a service by their own courier id, and that id is
 * what has to go back to them at booking time. It is snapshotted when the
 * customer selects a rate, so the normal answer is "read the snapshot".
 *
 * The fallback exists for rows that predate the snapshot, and for quotes whose
 * vendor returned no id: re-quote the same route and match on the stored
 * product name. Same route, same boxes, so the same courier list comes back.
 *
 * Returning null is meaningful and must not be papered over. It means the
 * service the customer bought can no longer be identified, and shipping them on
 * a different courier at that point is a decision for a person, not a default.
 * Shared by the international first-mile leg and the domestic door → door
 * booking, which face the identical problem on the identical vendor.
 */

import "server-only";

import { domesticAdapterRegistry } from "@/lib/rate-adapters/vendors/domestic.index";
import type {
  CanonicalPackage,
  CanonicalRateRequest,
} from "@/lib/rate-adapters/core/types";
import { getRates } from "@/lib/services/rate-calculator.service";

export interface CourierResolveEndpoint {
  city: string;
  pincode: string;
  line1: string;
}

export interface CourierResolveInput {
  /** The vendor whose courier id we need, e.g. "shipmozo". */
  vendorId: string;
  /** The product name snapshotted at booking, used to match a fresh quote. */
  productName: string | null;
  /** The id snapshotted at booking. When present, nothing else runs. */
  snapshotCourierId: string | null;
  origin: CourierResolveEndpoint;
  destination: CourierResolveEndpoint;
  /** Plain numbers — Decimals are converted by the caller. */
  packages: {
    quantity: number;
    weightKg: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    declaredValue?: number | null;
  }[];
}

export async function resolveExactCourierId(
  input: CourierResolveInput,
): Promise<string | null> {
  if (input.snapshotCourierId?.trim()) return input.snapshotCourierId.trim();

  const productName = input.productName?.trim().toLowerCase();
  if (!productName) return null;

  const boxes: CanonicalPackage[] = input.packages.map((p) => ({
    quantity: Math.max(1, p.quantity),
    weightKg: p.weightKg,
    lengthCm: p.lengthCm,
    widthCm: p.widthCm,
    heightCm: p.heightCm,
  }));
  if (!boxes.length) return null;

  const totalWeight = boxes.reduce((a, b) => a + b.weightKg * b.quantity, 0);
  const totalDeclared = input.packages.reduce(
    (a, p) => a + (p.declaredValue ?? 0) * Math.max(1, p.quantity),
    0,
  );
  const first = boxes[0];

  const request: CanonicalRateRequest = {
    origin: {
      city: input.origin.city,
      pincode: input.origin.pincode,
      countryCode: "IN",
      country: "India",
      line1: input.origin.line1,
    },
    destination: {
      city: input.destination.city,
      pincode: input.destination.pincode,
      countryCode: "IN",
      country: "India",
      line1: input.destination.line1,
    },
    shipment: {
      packages: boxes,
      weight: totalWeight || 0.5,
      quantity: boxes.reduce((a, b) => a + b.quantity, 0) || 1,
      dimensions: {
        length: Math.max(1, first.lengthCm),
        width: Math.max(1, first.widthCm),
        height: Math.max(1, first.heightCm),
        unit: "cm",
      },
      declaredValue: totalDeclared || undefined,
    },
  };

  // Markup changes the price, never which courier id comes back, so quote at 0%.
  const res = await getRates(request, {
    vendorIds: [input.vendorId],
    markupPercent: 0,
    registry: domesticAdapterRegistry,
  });

  const match = res.quotes.find(
    (q) => q.productName?.trim().toLowerCase() === productName,
  );
  return match?.courierId ?? null;
}
