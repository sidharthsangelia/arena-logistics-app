/**
 * lib/booking/domesticRequest.ts
 *
 * Builds the rate request for a DOMESTIC booking: the customer's pickup address
 * to the receiver's address, both Indian pincodes.
 *
 * This is the domestic flow's equivalent of buildRateRequest in ServiceStep
 * (international) and buildFirstMileRequest in lib/booking/firstMile.ts
 * (door → hub). The important difference from the first-mile one is the
 * destination: there the parcel goes to an Arena hub and the international leg
 * takes over, here it goes all the way to the receiver's door and that IS the
 * shipment.
 *
 * The org's markup is applied inside getDomesticRatesAction, same as every
 * other flow, so nothing here deals with pricing.
 */

import type { BookingFormData, ConsignorForm } from "@/types/booking.types";
import type { RateRequest } from "@/lib/types";
import {
  boxesToRatePackages,
  totalActualWeight,
  totalBoxCount,
  totalDeclaredValue,
} from "@/lib/booking/cargo";

/**
 * The address the courier collects from: the dedicated pickup address when the
 * customer entered a separate one, otherwise the sender. Mirrors both
 * firstMilePickupSource and the fallback createShipmentAction uses when it
 * persists the pickup Address, so all three agree on which address is which.
 */
export function domesticPickupSource(data: BookingFormData): ConsignorForm {
  return !data.pickupSameAsSender && data.pickup ? data.pickup : data.consignor;
}

/**
 * What the courier collects from the receiver on a COD booking: the declared
 * value of the goods.
 *
 * This is NOT the freight. The customer still pays Arena for shipping out of
 * their wallet at booking, exactly as on a prepaid shipment — COD is Shipmozo's
 * facility for collecting the goods value from the receiver and remitting it.
 * Deriving it from the boxes rather than asking for it separately means the
 * figure the courier collects can never quietly disagree with the figure the
 * shipment is declared and insured at.
 */
export function domesticCodAmount(data: BookingFormData): number {
  return totalDeclaredValue(data.boxes ?? []);
}

/**
 * Builds the domestic RateRequest. Throws with a message worth showing when a
 * pincode is missing — the adapter would reject it anyway, but with a vendor
 * error that tells the customer nothing about what to fix.
 */
export function buildDomesticRateRequest(data: BookingFormData): RateRequest {
  const source = domesticPickupSource(data);

  const pickupPincode = (source.postalCode ?? "").trim();
  if (!pickupPincode) {
    throw new Error(
      "A pickup pincode is required to price this shipment. Add it to the sender or pickup address.",
    );
  }

  const deliveryPincode = (data.consignee.postalCode ?? "").trim();
  if (!deliveryPincode) {
    throw new Error(
      "A delivery pincode is required to price this shipment. Add it to the receiver's address.",
    );
  }

  const boxes = data.boxes ?? [];
  if (!boxes.length) {
    throw new Error("At least one box is required to price this shipment.");
  }

  const declaredValue = totalDeclaredValue(boxes);

  return {
    origin: {
      city: source.city,
      pincode: pickupPincode,
      countryCode: "IN",
      country: "India",
      line1: source.addressLine1,
    },
    destination: {
      city: data.consignee.city,
      pincode: deliveryPincode,
      countryCode: "IN",
      country: "India",
      line1: data.consignee.addressLine1,
    },
    shipment: {
      packages: boxesToRatePackages(boxes),
      declaredValue,
      description: boxes[0]?.contents[0]?.description || "General Cargo",

      // COD is priced, not applied afterwards: the collection fee differs
      // between couriers, so quoting prepaid and switching later would show a
      // price the customer never pays.
      paymentType: data.codEnabled ? "COD" : "PREPAID",
      codAmount: data.codEnabled ? declaredValue : undefined,

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
