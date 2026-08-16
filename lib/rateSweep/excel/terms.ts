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
 * ── WHERE THE LATER CLAUSES CAME FROM ───────────────────────────────────────
 * The surcharge, documentation and back-billing clauses were written against a
 * consolidator tariff circulated in the trade (Orbit, dated 16.07.2026), which
 * carries its conditions as note rows under each carrier tab rather than as a
 * terms page. Everything taken from it is stated as a general position. No
 * figure from that document is reproduced here, deliberately: their thresholds
 * and their amounts are theirs, ours come from our own carrier contracts, and a
 * number in this file would be wrong the moment either contract moved. State
 * that a charge exists and who bears it. Never what it costs.
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
      `Carriers price by their own zone tables rather than by country. A carrier may move a country from one zone to another, which changes the rate for that country without anything in this document having changed.`,
      `Each service carries a minimum chargeable weight. A shipment lighter than that minimum is charged at the minimum for the service.`,
      `Rates are quoted for the service and mode named on each sheet. A document, a parcel and a commercial consignment of the same weight are priced differently, and a document above the carrier's document weight limit is charged as a parcel.`,
      `Rates in this document are given errors and omissions excepted. An obvious clerical error is not binding on either of us.`,
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
      `The divisor above applies to the express services in this workbook. Economy, cargo and surface services use different divisors, so the same carton can carry a different volumetric weight on a different service.`,
      `Chargeable weight is rounded up to the next slab shown in this rate card. Where a shipment has several pieces, each piece is rounded up on its own to the carrier's increment before the shipment total is arrived at.`,
      `Carriers also measure girth, calculated as the length plus twice the width plus twice the height. A piece above the carrier's girth threshold is charged at a fixed minimum chargeable weight for that piece, however light it actually is.`,
      `Carriers reweigh and remeasure every shipment at their hub. Where their measurement exceeds the weight booked, the difference is rebilled at the applicable slab rate, plus any carrier reweigh administration fee. This applies even after a shipment has been delivered.`,
      `The carrier's own record is the final weight. It is generated once the shipment leaves their hub and is confirmed to us only when they invoice, so a reweigh difference can reach you weeks after delivery.`,
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
      `Duties and taxes a carrier has already advanced at the destination remain payable even where the shipment is subsequently abandoned, destroyed or returned at the shipper's request.`,
      `Where a service is offered on a duty-paid basis, the carrier charges a service fee for advancing the duty in addition to the duty itself, usually as a percentage of the sum advanced against a minimum.`,
      `Rates offered for personal effects or gift shipments apply to those shipments only. A trade or commercial quantity moved on such a service can be detained and assessed for duty in the ordinary way, which is then payable.`,
      `Customs clearance charges where a shipment moves under a commercial declaration rather than a courier declaration, and export declaration charges where the declared value exceeds the threshold set by the authority at either end.`,
      `Dangerous goods, lithium battery, and restricted commodity handling charges. These require a separate quotation and prior approval.`,
      `Customs examination, inspection, X-ray, fumigation and any charge raised by an authority at either end, including fines and penalties.`,
      `Terminal handling, delivery order, import facilitation and any similar charge raised by a terminal, airline or handling agent.`,
      `Storage, demurrage and detention arising from delays in customs clearance or in the consignee accepting delivery.`,
      `Transit insurance. Cover is available on request and is charged separately.`,
      `Charges arising from an incorrect, incomplete or undeliverable address, including address correction fees and re-attempted delivery.`,
      `Return to origin where a shipment cannot be delivered or is refused. Return freight is charged at the carrier's prevailing tariff, together with any clearance charge at either end.`,
      `Cash on delivery collection, where the service offers it. Where the consignee declines to pay, the amount and the collection charge are billed to the shipper.`,
      `Pickup from the shipper's premises, unless the selected service is marked as including pickup. A pickup from a location other than the address on the account is charged at the rate for the higher of the two locations.`,
      `Packing, palletising and labelling.`,
      `Any charge arising from an inaccurate description, HS code or declared value on the commercial invoice.`,
      `The carrier surcharges listed below, other than the fuel and security surcharges, which are included as described above.`,
    ],
  };
}

/**
 * The surcharge list, split out from the exclusions on purpose.
 *
 * These are not things Arena chose not to include. They are levers the carriers
 * pull, mostly after a shipment has already moved, and the reader needs to see
 * that as a category rather than as more small print. Each line names a charge
 * that exists in at least one of our carriers' tariffs today.
 *
 * NO AMOUNTS AND NO THRESHOLDS. They differ per carrier, they are renegotiated,
 * and a stale number on a customer document is worse than no number at all.
 */
export function surchargesSection(): TermsSection {
  return {
    heading: "Carrier surcharges",
    clauses: [
      `Fuel surcharge. Included in the prices shown, at the rate prevailing on the capture date on the cover and at no other. Each carrier sets its own and revises it as often as weekly, so a booking placed later is priced at the fuel rate in force on that day.`,
      `Demand, peak-season and currency surcharges. Carriers introduce these at short notice, apply them for as long as they choose, and are not obliged to give us warning.`,
      `Remote-area or extended-area delivery surcharge, applied to specific destination postcodes and typically charged per kilogram against a minimum.`,
      `Residential-address delivery surcharge, where the carrier applies one.`,
      `Elevated-risk and restricted-destination surcharges, applied to countries the carriers serve under conditions of war, civil unrest or sustained security threat. Where a destination appears on more than one such list, more than one surcharge applies.`,
      `Additional handling surcharge, charged per piece where a piece exceeds the carrier's limit on weight, on any single dimension, or on girth. More than one of these can apply to the same piece. The rates in this workbook assume standard cartons, so please ask us to quote an oversize or overweight consignment before you book it.`,
      `Non-conveyable or irregular-piece surcharge, charged where a piece is not packed in a rectangular corrugated carton. Wood, metal, plastic, drums, sacks and irregular shapes all attract it.`,
      `Non-stackable surcharge, charged per piece where a consignment is marked fragile or do not stack, or is packed so that nothing can be loaded above it. It is among the largest surcharges any carrier levies.`,
      `Address correction surcharge, charged where the carrier has to establish the correct address in order to complete a delivery, or re-attempts at the same address.`,
      `Environmental and regulatory levies, including green or clean-transport charges introduced by a carrier or by a municipal authority.`,
      `Other than fuel and security, none of the surcharges above is included in the prices shown. They are raised on us by the carrier, in most cases after the shipment has already moved, and are invoiced to you separately when they reach us.`,
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
      `Uplift is subject to space being available on the carrier's flights. A flight cancellation, a delay, an embargo or a load restriction imposed by an airline is outside our control and does not alter the freight payable.`,
      `Economy and consolidated services depart once a minimum load has been built for the destination, so a light shipment on such a service can wait for the next consolidation.`,
      `Same-day pickup is arranged where the request reaches us before the cut-off for that day. A request after the cut-off is collected on the next working day.`,
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
      `KYC documentation of the shipper is mandatory under Indian customs regulation and must be complete before handover. Bookings are accepted only against a completed account, and identification of the actual shipper is required with every shipment, including shipments tendered to us on behalf of another party.`,
      `Booking a shipment authorises Arena and its customs brokers to act as the shipper's agent for the purpose of arranging customs clearance, and to prepare, sign and file the shipping bill, the e-way bill and any other statutory form required to move, clear or deliver the shipment. The declarations so filed are made on the shipper's instructions and remain the shipper's responsibility.`,
      `Where a leg of the shipment moves by road within India above the value prescribed for it, an e-way bill is required and must be furnished by the shipper.`,
      `Exports against payment require the shipper to comply with FEMA and RBI regulations, including realisation of export proceeds. Arena provides transport services only and does not advise on these obligations.`,
      `Goods prohibited or restricted for export from India, or for import into the destination country, will not be carried. The shipper is responsible for confirming the admissibility of their goods at the destination.`,
      `The shipper warrants that no shipment contains a hazardous commodity under the current edition of the IATA Dangerous Goods Regulations, or any commodity restricted for carriage under Indian customs rules, unless it has been declared and accepted in advance in writing.`,
      `Every shipment is subject to security screening and physical inspection at acceptance, and to inspection by the authorities at either end. Carriers and authorities may open a shipment without reference to us.`,
      `Undeclared or misdeclared contents may be seized by an authority at either end. Any resulting penalty, storage or return cost is to the shipper's account.`,
      `Where a banned or illegal item is found in a shipment, responsibility for it rests with the shipper, who agrees to cooperate with any resulting investigation and to bear its consequences.`,
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
      `Carriers audit shipments and raise charges on us for some months after a shipment has moved. Any such charge is invoiced to you when it reaches us, and the fact that a shipment was invoiced once already does not close it.`,
      `Proof of delivery is provided on request and can be verified online. The absence of a proof of delivery is not a ground for withholding payment of an invoice.`,
      `Where an account is overdue, or a charge on an earlier shipment remains unpaid, Arena may decline to accept further shipments and may hold shipments already in its possession until the account is settled.`,
      `A booking may be cancelled without charge before the shipment is handed to the carrier. After handover, freight is payable in full and cancellation is subject to the carrier's own terms.`,
      `Arena acts as an agent arranging carriage with its carrier partners. Carriage is performed under the carrier's own terms and conditions, including their limits of liability.`,
      `Liability for loss or damage is limited to the carrier's published liability under the applicable convention, unless transit insurance has been purchased for the shipment.`,
      `Insurance is the shipper's responsibility. A shipment moving without cover moves at the owner's risk, and fragile, brittle and electronic goods, and goods packed by the shipper, travel at the shipper's risk in any event.`,
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
    surchargesSection(),
    transitSection(),
    documentationSection(),
    commercialSection(),
  ];
}

/**
 * The short version, for the foot of every rate sheet.
 *
 * Somebody will print one sheet and never open the terms tab. These lines are
 * the ones that must travel with the numbers, chosen because each maps to a
 * charge the reader would otherwise not expect to pay. Keep the list short:
 * it is repeated at the foot of every sheet, and a wall of small print at the
 * bottom of a rate grid gets read as decoration.
 */
export const SHEET_FOOTNOTES: string[] = [
  `Chargeable weight = greater of actual and volumetric weight (L×W×H cm ÷ ${INTERNATIONAL_VOLUMETRIC_DIVISOR}). Carriers reweigh and rebill any difference.`,
  `Destination duties, taxes and customs charges are NOT included unless the service is marked Duty Paid. They are payable by the consignee before delivery.`,
  `Carrier surcharges are not included: fuel, demand and currency, remote area, residential, elevated-risk destinations, additional handling for oversize, irregular or non-stackable pieces, and address correction. Most are raised on us after a shipment has moved.`,
  `Transit times exclude customs clearance and are not guaranteed. Uplift is subject to space on the carrier's flights.`,
  `Indicative rates, subject to reconfirmation at booking. Full terms are on the "Terms & Conditions" sheet of this workbook.`,
];

/** Stamped across an internal file so a printed page cannot be mistaken. */
export const INTERNAL_STAMP =
  "INTERNAL ONLY — RAW CARRIER COST, NO ARENA MARGIN APPLIED. DO NOT SEND TO A CUSTOMER.";
