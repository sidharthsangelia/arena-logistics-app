/**
 * lib/rateSweep/excel/terms.ts
 *
 * The words that make a rate card defensible.
 *
 * ── READ BEFORE CHANGING ────────────────────────────────────────────────────
 * A quotation is the document a customer waves when a bill differs from what
 * they expected. Almost every argument in this business comes from one of four
 * places, and each has a clause below written specifically to pre-empt it:
 *
 *   1. Weight. We quote on chargeable weight; the carrier reweighs and
 *      rebills. A customer who was never told about volumetric weight
 *      experiences that as an invented charge.
 *   2. Duties and taxes. Unless a service is duty paid, the destination
 *      customs bill goes to the receiver. This surprises people at the door.
 *   3. Surcharges. Fuel moves monthly, remote-area applies on postcodes the
 *      customer thought were ordinary, and neither is in the headline rate.
 *   4. Transit time. Carrier estimates exclude customs. Quoting them without
 *      that qualifier turns an estimate into a promise.
 *
 * ── THE COMMERCIAL TERMS ARE A BUSINESS DECISION, NOT A TECHNICAL ONE ───────
 * Sections marked REVIEW below state payment, cancellation and liability
 * positions. They are written to a conservative industry-standard default. They
 * have NOT been reviewed by anyone at Arena with authority to set them, and
 * they should be, once, before the first file goes out. Everything else on this
 * page is a statement of fact about how the rates were produced and is safe as
 * written.
 */

import { INTERNATIONAL_VOLUMETRIC_DIVISOR } from "@/lib/pricing/chargeableWeight";

import { SWEEP_ORIGIN } from "../config";

export interface TermsSection {
  heading: string;
  /** Each string is one numbered clause. */
  clauses: string[];
  /**
   * True for sections stating a commercial position Arena must confirm rather
   * than a fact about the data. Surfaced in the admin UI, not in the file.
   */
  needsBusinessReview?: boolean;
}

export interface TermsContext {
  capturedOn: string;
  validUntil: string;
  markupApplied: boolean;
}

/**
 * How the numbers were arrived at. Facts, not policy: every clause here is
 * checkable against lib/rateSweep/config.ts.
 */
export function basisOfRatesSection(context: TermsContext): TermsSection {
  return {
    heading: "Basis of these rates",
    clauses: [
      `All rates are quoted from ${SWEEP_ORIGIN.city} (PIN ${SWEEP_ORIGIN.pincode}), India. Rates from any other origin will differ and must be requested separately.`,
      `Rates are quoted to the principal city of each destination country. Deliveries to remote, rural or offshore postcodes attract a remote-area surcharge that is not included here and is confirmed at the time of booking.`,
      `Prices shown are per shipment for the stated chargeable weight, in Indian Rupees (INR).`,
      `Rates were obtained from our carrier partners on ${context.capturedOn} and are valid for quotation until ${context.validUntil}.`,
      `Carrier tariffs, fuel surcharges and currency-linked components are revised by the carriers periodically and without notice to us. Rates are therefore indicative and are reconfirmed at the point of booking.`,
      context.markupApplied
        ? `Prices shown are Arena's all-inclusive charge to you for the freight component, as described under "What is included" below.`
        : `Prices shown are landed carrier cost before Arena's service charge. This document is for internal use only.`,
    ],
  };
}

/** The weight clause. The single most common source of a disputed invoice. */
export function chargeableWeightSection(): TermsSection {
  return {
    heading: "How weight is charged",
    clauses: [
      `International shipments are charged on chargeable weight, which is the GREATER of the actual gross weight and the volumetric weight.`,
      `Volumetric weight in kilograms = (Length × Width × Height in centimetres) ÷ ${INTERNATIONAL_VOLUMETRIC_DIVISOR}.`,
      `A light but bulky parcel will therefore be charged above its actual weight. Please check the volumetric weight of your packaging before accepting a rate from this document.`,
      `Chargeable weight is rounded up to the next slab shown in this rate card.`,
      `Carriers reweigh and remeasure every shipment at their hub. Where their measurement exceeds the weight booked, the difference is rebilled at the applicable slab rate, plus any carrier reweigh administration fee. This applies even after a shipment has been delivered.`,
      `Weights and dimensions declared at booking are the shipper's responsibility. Arena does not verify them before handover.`,
    ],
  };
}

/** What the price covers, stated positively, so the exclusions are unambiguous. */
export function inclusionsSection(): TermsSection {
  return {
    heading: "What is included in the price",
    clauses: [
      `Freight from our ${SWEEP_ORIGIN.city} hub to the destination address.`,
      `Carrier fuel surcharge and security surcharge prevailing at the date shown on the cover.`,
      `Goods and Services Tax (GST) on the freight component at the applicable Indian rate.`,
      `Standard export documentation handling and filing by Arena.`,
      `Online tracking from handover to delivery.`,
    ],
  };
}

/**
 * The exclusions. Long on purpose. Every line is a charge that has surprised
 * somebody, and a clause here costs nothing while the argument costs a customer.
 */
export function exclusionsSection(): TermsSection {
  return {
    heading: "What is NOT included",
    clauses: [
      `Destination customs duties, import taxes, VAT/GST and clearance charges. Unless a service is explicitly marked "Duty Paid" in this document, these are billed to the consignee by the carrier at the destination and are payable before delivery. Where the consignee refuses them, they are recharged to the shipper together with any return freight.`,
      `Remote-area or extended-area delivery surcharge, which the carriers apply to specific destination postcodes.`,
      `Residential-address delivery surcharge, where the carrier applies one.`,
      `Oversize, overweight or non-stackable piece surcharges. Any single piece above 30kg, or longer than 120cm on any side, must be quoted separately.`,
      `Dangerous goods, lithium battery, and restricted commodity handling charges. These require a separate quotation and prior approval.`,
      `Customs examination, inspection, X-ray, fumigation and any charge raised by an authority at either end.`,
      `Storage, demurrage and detention arising from delays in customs clearance or in the consignee accepting delivery.`,
      `Transit insurance. Cover is available on request and is charged separately.`,
      `Charges arising from an incorrect, incomplete or undeliverable address, including address correction fees, re-attempted delivery and return-to-origin freight.`,
      `Pickup from the shipper's premises, unless the selected service is marked as including pickup.`,
      `Packing, palletising and labelling.`,
      `Any charge arising from an inaccurate description, HS code or declared value on the commercial invoice.`,
    ],
  };
}

/** Transit. Stated as an estimate every time it is stated at all. */
export function transitSection(): TermsSection {
  return {
    heading: "Transit times",
    clauses: [
      `Transit times shown are the carrier's published estimates in working days from the date of departure, not from the date of pickup or handover.`,
      `They EXCLUDE the time taken for export clearance in India and import clearance at the destination, which is outside any carrier's control.`,
      `They exclude weekends and public holidays at origin, transit and destination.`,
      `Transit times are estimates and are not guaranteed. Arena does not offer money-back service guarantees and does not accept liability for losses arising from late delivery.`,
    ],
  };
}

/** Documents. Preventing the shipment that gets stuck before it moves. */
export function documentationSection(): TermsSection {
  return {
    heading: "Documentation and compliance",
    clauses: [
      `All shipments require a commercial invoice or a CSB-IV declaration as applicable, with a truthful description of goods, HS code, quantity and value.`,
      `KYC documentation of the shipper is mandatory under Indian customs regulation and must be complete before handover.`,
      `Exports against payment require the shipper to comply with FEMA and RBI regulations, including realisation of export proceeds. Arena provides transport services only and does not advise on these obligations.`,
      `Goods prohibited or restricted for export from India, or for import into the destination country, will not be carried. The shipper is responsible for confirming the admissibility of their goods at the destination.`,
      `Undeclared or misdeclared contents may be seized by an authority at either end. Any resulting penalty, storage or return cost is to the shipper's account.`,
    ],
  };
}

/**
 * REVIEW. Commercial position, written to a conservative default.
 * Confirm with the business before the first file leaves the building.
 */
export function commercialSection(): TermsSection {
  return {
    heading: "Commercial terms",
    needsBusinessReview: true,
    clauses: [
      `This document is a quotation and not a contract of carriage. A contract arises only when a shipment is booked and accepted by Arena.`,
      `Rates are offered for the validity period shown on the cover and are subject to change or withdrawal before a booking is confirmed.`,
      `Rates are offered on the basis of the volumes and lanes discussed. Materially different volumes, commodities or lanes may be re-quoted.`,
      `Payment is due as agreed in the account terms. Where no terms have been agreed in writing, charges are payable in advance of handover.`,
      `Reweigh differences, destination charges recharged to the shipper, and return freight are invoiced separately after the shipment and are payable on presentation.`,
      `A booking may be cancelled without charge before the shipment is handed to the carrier. After handover, freight is payable in full and cancellation is subject to the carrier's own terms.`,
      `Arena acts as an agent arranging carriage with its carrier partners. Carriage is performed under the carrier's own terms and conditions, including their limits of liability.`,
      `Liability for loss or damage is limited to the carrier's published liability under the applicable convention, unless transit insurance has been purchased for the shipment.`,
      `Arena is not liable for indirect or consequential loss, including loss of profit, loss of market or contractual penalties suffered by the shipper or consignee.`,
      `Nothing in this document limits any liability that cannot be limited under Indian law.`,
      `Disputes are subject to the exclusive jurisdiction of the courts at New Delhi, India.`,
    ],
  };
}

/** The full set, in reading order. */
export function allTermsSections(context: TermsContext): TermsSection[] {
  return [
    basisOfRatesSection(context),
    chargeableWeightSection(),
    inclusionsSection(),
    exclusionsSection(),
    transitSection(),
    documentationSection(),
    commercialSection(),
  ];
}

/**
 * The short version, for the foot of every rate sheet.
 *
 * Somebody will print one sheet and never open the terms tab. These four lines
 * are the ones that must travel with the numbers, chosen because each maps to a
 * charge the reader would otherwise not expect to pay.
 */
export const SHEET_FOOTNOTES: string[] = [
  `Chargeable weight = greater of actual and volumetric weight (L×W×H cm ÷ ${INTERNATIONAL_VOLUMETRIC_DIVISOR}). Carriers reweigh and rebill any difference.`,
  `Destination duties, taxes and customs charges are NOT included unless the service is marked Duty Paid. They are payable by the consignee before delivery.`,
  `Remote-area, residential, oversize and dangerous-goods surcharges are not included. Transit times exclude customs clearance and are not guaranteed.`,
  `Indicative rates, subject to reconfirmation at booking. Full terms are on the "Terms & Conditions" sheet of this workbook.`,
];

/** Stamped across an internal file so a printed page cannot be mistaken. */
export const INTERNAL_STAMP =
  "INTERNAL ONLY — RAW CARRIER COST, NO ARENA MARGIN APPLIED. DO NOT SEND TO A CUSTOMER.";
