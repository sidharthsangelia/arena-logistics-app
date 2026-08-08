/**
 * lib/invoices/manual/catalog.ts
 *
 * The seed for the charge-type catalog: every charge Arena bills off-platform,
 * with the SAC code and GST rate it defaults to.
 *
 * PURE MODULE. Read by the seed script on the server and by the picker in the
 * browser as a fallback ordering, so no "server-only", no prisma, no env.
 *
 * ── THIS IS A SEED, NOT THE SOURCE OF TRUTH ─────────────────────────────────
 * ChargeType rows in the database are authoritative. This list creates them the
 * first time and never overwrites a rate, SAC or label an admin has since
 * corrected: scripts/seedChargeTypes.ts upserts on `code` and only fills fields
 * on insert. Adding an entry here and re-running the seed is how a new charge
 * ships; editing one here does NOT change an existing row, on purpose.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── ABOUT THE RATES ─────────────────────────────────────────────────────────
 * Everything taxable is seeded at 18% with SAC 996812, because that is what
 * applies to the overwhelming majority of freight and courier services and
 * because a wrong-but-consistent default is correctable in one screen, whereas
 * sixty individually guessed rates are not auditable at all.
 *
 * The exception is the reimbursement group. Those are seeded at 0% AND flagged
 * `defaultReimbursement`, which is a stronger statement than a zero rate: it
 * keeps the amount out of taxable value entirely rather than declaring a
 * zero-rated supply. See the note on ManualInvoiceCharge.reimbursement.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { ChargeApplicability } from "@/generated/prisma";

export interface SeedChargeType {
  code: string;
  label: string;
  description?: string;
  sacCode?: string;
  defaultRatePercent?: number;
  defaultReimbursement?: boolean;
  applicability?: ChargeApplicability;
  sortOrder: number;
}

/** SAC for courier and goods transport. The default on everything taxable. */
export const DEFAULT_SAC_CODE = "996812";
/** The rate everything taxable is seeded at. */
export const DEFAULT_GST_RATE = 18;

/**
 * Ordered so the picker opens on what is needed almost every time. Freight and
 * fuel surcharge are on nearly every invoice; ODC and DG certification are on
 * roughly none, and being fifty rows down costs nothing because the picker
 * searches by name.
 */
export const CHARGE_TYPE_SEED: readonly SeedChargeType[] = [
  // ── the core three, on almost every invoice ──────────────────────────────
  {
    code: "freight-charges",
    label: "Freight charges",
    description: "The line haul itself",
    sortOrder: 10,
  },
  {
    code: "fuel-surcharge",
    label: "Fuel surcharge",
    description: "FSC, usually a percentage of freight",
    sortOrder: 20,
  },
  {
    code: "other-charges",
    label: "Other charges",
    description: "Anything with no better line of its own",
    sortOrder: 30,
  },

  // ── air freight ──────────────────────────────────────────────────────────
  {
    code: "airfreight-charges",
    label: "Airfreight charges",
    applicability: ChargeApplicability.AIR,
    sortOrder: 100,
  },
  {
    code: "airline-charges",
    label: "Airline charges",
    applicability: ChargeApplicability.AIR,
    sortOrder: 110,
  },
  {
    code: "airline-do-charges",
    label: "Airline DO charges",
    description: "Delivery order released by the airline at destination",
    applicability: ChargeApplicability.AIR,
    defaultRatePercent: 0,
    defaultReimbursement: true,
    sortOrder: 120,
  },
  {
    code: "ahs-charges",
    label: "AHS charges",
    description: "Air handling surcharge",
    applicability: ChargeApplicability.AIR,
    sortOrder: 130,
  },
  {
    code: "tsp-charges-origin",
    label: "TSP charges at origin",
    description: "Terminal service provider, origin",
    applicability: ChargeApplicability.AIR,
    sortOrder: 140,
  },
  {
    code: "tsp-charges-destination",
    label: "TSP charges at destination",
    description: "Terminal service provider, destination",
    applicability: ChargeApplicability.AIR,
    sortOrder: 150,
  },
  {
    code: "demand-surcharge",
    label: "Demand surcharge",
    applicability: ChargeApplicability.AIR,
    sortOrder: 160,
  },
  {
    code: "airport-storage-charges",
    label: "Airport storage charges",
    applicability: ChargeApplicability.AIR,
    sortOrder: 170,
  },
  {
    code: "cartage-warehouse-to-airport",
    label: "Cartage, warehouse to airport",
    applicability: ChargeApplicability.AIR,
    sortOrder: 180,
  },
  {
    code: "muc-charges",
    label: "MUC charges",
    description: "Minimum usage charge",
    applicability: ChargeApplicability.AIR,
    sortOrder: 190,
  },

  // ── sea freight ──────────────────────────────────────────────────────────
  {
    code: "ocean-freight-charges",
    label: "Ocean freight charges",
    description: "O/F",
    applicability: ChargeApplicability.SEA,
    sortOrder: 200,
  },
  {
    code: "thc-charges",
    label: "THC charges",
    description: "Terminal handling",
    applicability: ChargeApplicability.SEA,
    sortOrder: 210,
  },
  {
    code: "bl-charges",
    label: "BL charges",
    description: "Bill of lading",
    applicability: ChargeApplicability.SEA,
    sortOrder: 220,
  },
  {
    code: "swbl-charges",
    label: "SWBL charges",
    description: "Sea waybill / switch bill of lading",
    applicability: ChargeApplicability.SEA,
    sortOrder: 230,
  },
  {
    code: "seal-charges",
    label: "SEAL charges",
    applicability: ChargeApplicability.SEA,
    sortOrder: 240,
  },
  {
    code: "container-detention-charges",
    label: "Container detention charges",
    applicability: ChargeApplicability.SEA,
    sortOrder: 250,
  },
  {
    code: "sea-freight-custom-charges",
    label: "Sea freight custom charges",
    applicability: ChargeApplicability.SEA,
    sortOrder: 260,
  },
  {
    code: "toll-charges",
    label: "TOLL charges",
    applicability: ChargeApplicability.SEA,
    sortOrder: 270,
  },

  // ── pickup, delivery and ground handling ─────────────────────────────────
  {
    code: "pickup-charges",
    label: "Pick up charges",
    sortOrder: 300,
  },
  {
    code: "delivery-charges",
    label: "Delivery charges",
    sortOrder: 310,
  },
  {
    code: "handling-charges",
    label: "Handling charges",
    sortOrder: 320,
  },
  {
    code: "loading-unloading-charges",
    label: "Loading and unloading charges",
    sortOrder: 330,
  },
  {
    code: "storage-warehousing-charges",
    label: "Storage and warehousing charges",
    sortOrder: 340,
  },
  {
    code: "detention-charges",
    label: "Detention charges",
    sortOrder: 350,
  },
  {
    code: "oda-location-charges",
    label: "ODA location charges",
    description: "Out of delivery area",
    sortOrder: 360,
  },

  // ── packing and preparation ──────────────────────────────────────────────
  {
    code: "packing-charges",
    label: "Packing charges",
    sortOrder: 400,
  },
  {
    code: "pallet-charges",
    label: "Pallet charges",
    sortOrder: 410,
  },
  {
    code: "palletization-origin",
    label: "Palletisation charges at origin",
    sortOrder: 420,
  },
  {
    code: "palletization-destination",
    label: "Palletisation charges at destination",
    sortOrder: 430,
  },
  {
    code: "fumigation-charges",
    label: "Fumigation charges",
    sortOrder: 440,
  },
  {
    code: "dg-packing-charges",
    label: "DG packing charges",
    description: "Dangerous goods packing",
    sortOrder: 450,
  },
  {
    code: "dg-certification-charges",
    label: "DG certification charges",
    sortOrder: 460,
  },

  // ── customs and documentation ────────────────────────────────────────────
  {
    code: "custom-clearance-charges",
    label: "Custom clearance charges",
    applicability: ChargeApplicability.INTERNATIONAL,
    sortOrder: 500,
  },
  {
    code: "custom-inspection-charges",
    label: "Custom inspection charges",
    applicability: ChargeApplicability.INTERNATIONAL,
    sortOrder: 510,
  },
  {
    code: "documentation-charges",
    label: "Documentation charges",
    sortOrder: 520,
  },
  {
    code: "acmes-charges",
    label: "ACMES charges",
    sortOrder: 530,
  },

  // ── oversize and special handling ────────────────────────────────────────
  {
    code: "oversize-charges",
    label: "Oversize charges",
    sortOrder: 600,
  },
  {
    code: "odc-charges",
    label: "ODC charges",
    description: "Over dimensional cargo",
    sortOrder: 610,
  },
  {
    code: "odd-dimension-charges",
    label: "Odd dimension charges",
    sortOrder: 620,
  },

  // ── reimbursements: money paid out and recovered, not revenue ────────────
  //
  // Every one of these is seeded with defaultReimbursement true and a zero
  // rate. Under GST these are pure-agent recoveries: they belong on the
  // invoice and they do not belong in Arena's taxable turnover. Charging tax
  // on recovered duty is the mistake that costs a year of credit notes, so the
  // default is set here rather than left to whoever fills the form.
  {
    code: "destination-duty-taxes",
    label: "Destination duty and taxes",
    description: "Levied at destination, recovered from the customer",
    applicability: ChargeApplicability.INTERNATIONAL,
    defaultRatePercent: 0,
    defaultReimbursement: true,
    sortOrder: 700,
  },
  {
    code: "origin-country-taxes",
    label: "Origin country taxes",
    applicability: ChargeApplicability.INTERNATIONAL,
    defaultRatePercent: 0,
    defaultReimbursement: true,
    sortOrder: 710,
  },
  {
    code: "reverse-charges",
    label: "Reverse charges",
    description: "Recovered on a reverse-charge basis",
    defaultRatePercent: 0,
    defaultReimbursement: true,
    sortOrder: 720,
  },

  // ── miscellaneous ────────────────────────────────────────────────────────
  {
    code: "miscellaneous-charges",
    label: "Miscellaneous charges",
    sortOrder: 900,
  },
];

/**
 * Fields that describe the shipment rather than a charge. The screenshot lists
 * these alongside the charge rows, but they are consignment attributes, not
 * money, and they are captured on ManualInvoiceConsignment instead:
 *
 *   Forwarder name, item description, place of supply, airlines, SAC code,
 *   job number, currency, origin/destination airport or port, MAWB, HAWB,
 *   gross and chargeable weight, total packages, reference number, goods
 *   description, export invoice number, shipper, consignee, sub agent,
 *   particulars, container number, total boxes, pallets and cartons.
 *
 * Recorded here so the next person comparing this file to that screenshot can
 * see they were considered rather than missed.
 */
export const NON_CHARGE_FIELDS_NOTE = true;
