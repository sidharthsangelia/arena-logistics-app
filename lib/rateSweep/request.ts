/**
 * lib/rateSweep/request.ts
 *
 * Turns one cell of the matrix into the canonical rate request the adapters
 * already understand.
 *
 * PURE MODULE. No Prisma, no server-only, no network. The sweep's most
 * important invariant lives here (the box never out-weighs the slab) and pure
 * code is code the tests can hold to it across all thirty slabs at once.
 *
 * Nothing vendor-specific appears below. Each adapter takes this same shape and
 * translates it: sKart reads the chargeable weight and the country name,
 * ShipGlobal the weight and the postcode, Aramex the city, Shipmozo the box
 * array and the declared value. That is exactly why the sweep can enumerate the
 * adapter registry instead of knowing who is in it.
 */

import type {
  CanonicalPackage,
  CanonicalRateRequest,
} from "@/lib/rate-adapters/core/types";

import {
  BOX_PROFILE,
  SWEEP_DECLARED_VALUE,
  SWEEP_ORIGIN,
  SWEEP_SHIPMENT_PURPOSE,
  nominalBoxForWeight,
  type NominalBox,
  type SweepCountry,
} from "./config";

export interface SweepCell {
  country: SweepCountry;
  weightKg: number;
}

/** Everything about a cell that gets written to the call row. */
export interface SweepCellDescriptor {
  destCountryCode: string;
  destCity: string;
  destPostcode: string;
  syntheticPostcode: boolean;
  weightKg: number;
  boxProfile: string;
  box: NominalBox;
  shipmentPurpose: string;
  declaredValue: number;
  originPincode: string;
  originCity: string;
}

export function describeCell(cell: SweepCell): SweepCellDescriptor {
  return {
    destCountryCode: cell.country.code,
    destCity: cell.country.city,
    destPostcode: cell.country.postcode,
    syntheticPostcode: cell.country.syntheticPostcode ?? false,
    weightKg: cell.weightKg,
    boxProfile: BOX_PROFILE,
    box: nominalBoxForWeight(cell.weightKg),
    shipmentPurpose: SWEEP_SHIPMENT_PURPOSE,
    declaredValue: SWEEP_DECLARED_VALUE,
    originPincode: SWEEP_ORIGIN.pincode,
    originCity: SWEEP_ORIGIN.city,
  };
}

/**
 * Build the request for one cell.
 *
 * The single box carries the whole slab weight, and its dimensions are chosen
 * (see nominalBoxForWeight) so volumetric lands at about half of it. Every
 * adapter computes chargeable as max(actual, volumetric) one way or another, so
 * the chargeable weight resolves to the slab for all of them and a row labelled
 * 2kg holds the price of 2kg.
 *
 * The legacy top-level `weight` / `quantity` / `dimensions` fields are filled in
 * as well as `packages`. `packages` is the source of truth for every adapter in
 * the registry today, but the canonical type still carries the older single-box
 * shape for external /api/rates callers, and leaving it inconsistent with the
 * package array would be a trap for whoever writes the next adapter.
 */
export function buildSweepRequest(cell: SweepCell): CanonicalRateRequest {
  const descriptor = describeCell(cell);
  const { box } = descriptor;

  const pkg: CanonicalPackage = {
    quantity: 1,
    weightKg: descriptor.weightKg,
    lengthCm: box.lengthCm,
    widthCm: box.widthCm,
    heightCm: box.heightCm,
  };

  return {
    origin: {
      line1: SWEEP_ORIGIN.line1,
      city: SWEEP_ORIGIN.city,
      pincode: SWEEP_ORIGIN.pincode,
      countryCode: SWEEP_ORIGIN.countryCode,
      country: SWEEP_ORIGIN.country,
    },

    destination: {
      city: cell.country.city,
      pincode: cell.country.postcode,
      countryCode: cell.country.code,
      country: cell.country.name,
    },

    shipment: {
      packages: [pkg],

      // Legacy aggregate view of the same single box.
      weight: descriptor.weightKg,
      quantity: 1,
      dimensions: {
        length: box.lengthCm,
        width: box.widthCm,
        height: box.heightCm,
        unit: "cm",
      },

      // Generic and stable. A description that varied by lane would be one more
      // uncontrolled variable in a dataset whose whole value is that only the
      // country and the weight change between rows.
      description: "General merchandise",
      goodsOriginCountry: SWEEP_ORIGIN.countryCode,

      declaredValue: descriptor.declaredValue,
      packageType: "SPS",
      shipmentPurpose: SWEEP_SHIPMENT_PURPOSE,
    },
  };
}
