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
 *   4. Delivery timing. This document states no transit time at all. A day
 *      count in writing is read as a promise, and the customs, uplift and
 *      consolidation delays that break it are outside any carrier's control.
 *      Timing is given on a call, against the lane and the booking date. Do
 *      not add a transit column, a day count or an estimate to this workbook.
 *
 * ── THE FOUR POSITIONS THE BUSINESS CHOSE ───────────────────────────────────
 * These were decided by Arena and are not defaults. Changing one is a business
 * decision, not an editing decision:
 *
 *   Liability   Capped at the freight charges paid to Arena for the shipment,
 *               however the loss arises and however Arena is characterised in
 *               the transaction. The cap is written to survive the argument
 *               that Arena contracted as a principal rather than as an agent,
 *               because that argument is winnable against us: we sell one
 *               inclusive price and never disclose the carrier's cost, which
 *               is what a principal does. The cap is expressly subject to the
 *               limits Indian law and the Carriage by Air Act do not allow to
 *               be contracted below.
 *   Payment     In advance of handover, unless credit terms have been agreed
 *               in writing on the account.
 *   Insurance   The shipper's own. Arena does not arrange or sell cover.
 *               Saying "cover available on request" would put us in the way of
 *               the IRDAI rules on who may place insurance for a fee.
 *   Claims      Notified in writing inside a fixed window. Written as a
 *               condition of a claim being considered, NOT as a time bar on
 *               suing: Section 28 of the Contract Act voids an agreement that
 *               extinguishes a right on the expiry of a period, so the English
 *               style nine-month time bar is unenforceable here.
 *
 * ── WHY LIABILITY FOR DELAY IS CAPPED AND NOT EXCLUDED ──────────────────────
 * A blanket "we are not liable for late delivery" is the weakest form of the
 * clause. Where the carriage is international carriage by air and we are held
 * to be the contracting carrier, Article 26 of the Montreal Convention, given
 * force in India by the Carriage by Air Act, makes null any provision that
 * relieves the carrier of liability or fixes a lower limit. A cap survives
 * where a total exclusion does not, so delay sits under the same freight
 * charges cap as everything else.
 *
 * ── WHERE THE SURCHARGE CLAUSES CAME FROM ───────────────────────────────────
 * The surcharge, documentation and back-billing clauses were written against a
 * consolidator tariff circulated in the trade (Orbit, dated 16.07.2026), which
 * carries its conditions as note rows under each carrier tab rather than as a
 * terms page. Everything taken from it is stated as a general position. No
 * figure from that document is reproduced here, deliberately: their thresholds
 * and their amounts are theirs, ours come from our own carrier contracts, and a
 * number in this file would be wrong the moment either contract moved. State
 * that a charge exists and who bears it. Never what it costs. The one figure
 * allowed on the page is the volumetric divisor, because it is a formula the
 * reader has to be able to apply, and statutory years, because they are
 * citations rather than amounts.
 *
 * ── SECTIONS MARKED REVIEW ──────────────────────────────────────────────────
 * Commercial terms and Liability state positions rather than facts about the
 * data. They carry needsBusinessReview so the admin side can prompt for a
 * sign-off. Everything else on this page is a statement of fact about how the
 * rates were produced and is safe as written.
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
  /**
   * The registered name of the contracting company, where the invoice issuer
   * block has been configured.
   *
   * Optional because it comes from environment configuration that is a
   * placeholder in development, and a terms page naming "REPLACE ME PRIVATE
   * LIMITED" is worse than one naming nobody. When it is absent the identity
   * clause is simply not written. The GSTIN deliberately does not come through
   * here: it belongs on the cover, next to the address, not inside a clause.
   */
  issuerLegalName?: string;
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
      `Rates are quoted to the principal city of each destination country, against one representative postcode for that country. Where a destination has no postal system in the form the carriers require, the postcode used is a representative one, and the rate for a specific delivery address is confirmed on request.`,
      `Deliveries to remote, rural or offshore postcodes attract a remote-area surcharge that is not included here and is confirmed at the time of booking.`,
      `Prices shown are per shipment for the stated chargeable weight, in Indian Rupees (INR).`,
      `Rates were obtained from our carrier partners on ${context.capturedOn}. This quotation is open for acceptance until ${context.validUntil}.`,
      `Until that date we hold the freight component shown. Fuel, security and currency-linked components, and any surcharge a carrier introduces or revises in the meantime, are passed through at cost, so the amount finally payable can differ from the amount shown here. Every price is reconfirmed at the point of booking.`,
      `Carriers price by their own zone tables rather than by country. A carrier may move a country from one zone to another, which changes the rate for that country without anything in this document having changed.`,
      `Each service carries a minimum chargeable weight. A shipment lighter than that minimum is charged at the minimum for the service.`,
      `Rates are quoted for the service and mode named on each sheet. A document, a parcel and a commercial consignment of the same weight are priced differently, and a document above the carrier's document weight limit is charged as a parcel.`,
      `Rates are quoted on the information given to us about the goods, the lanes and the volumes. A materially different commodity, weight profile, lane or volume may be re-quoted.`,
      `Rates in this document are given errors and omissions excepted. An obvious clerical error is not binding on either of us and may be corrected or withdrawn before a booking is confirmed.`,
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
      `For the express services in this workbook, volumetric weight in kilograms = (Length × Width × Height in centimetres) ÷ ${INTERNATIONAL_VOLUMETRIC_DIVISOR}. Economy, consolidated and cargo services are converted at the divisor the carrier sets for that service, which we confirm for the service you are booking. The same carton can therefore carry a different volumetric weight on a different service.`,
      `A light but bulky parcel will be charged above its actual weight. Please check the volumetric weight of your packaging before accepting a rate from this document.`,
      `Chargeable weight is rounded up to the next slab shown in this rate card. Where a shipment has several pieces, each piece is rounded up on its own to the carrier's increment before the shipment total is arrived at.`,
      `Carriers also measure girth, calculated as the length plus twice the width plus twice the height. A piece above the carrier's girth threshold is charged at a fixed minimum chargeable weight for that piece, however light it actually is.`,
      `Carriers reweigh and remeasure every shipment at their hub, and the carrier's record is the final weight. Where their measurement exceeds the weight booked, the difference is rebilled at the applicable slab rate together with any carrier reweigh administration fee. This applies after a shipment has been delivered, and because the figure reaches us only when the carrier invoices, a reweigh difference can be raised on you weeks later.`,
      `Weights and dimensions declared at booking are the shipper's responsibility. Arena does not verify them before handover.`,
    ],
  };
}

/** What the price covers, stated positively, so the exclusions are unambiguous. */
export function inclusionsSection(): TermsSection {
  return {
    heading: "What is included in the price",
    clauses: [
      `Freight from our ${SWEEP_ORIGIN.city} hub to the destination address, on the service named on the sheet the price is taken from.`,
      `Carrier fuel surcharge and security surcharge at the rate prevailing on the date of issue shown on the cover.`,
      `Goods and Services Tax (GST) on the freight component at the rate in force on the date of issue. A change in that rate, in the classification of the service or in the place of supply, and any tax, levy or cess introduced after that date, are to your account.`,
      `Preparation and filing by Arena of one shipping bill or courier declaration per shipment, from the documents and particulars you supply. Amendments, re-filing and additional invoice lines beyond the carrier's standard allowance are charged separately.`,
      `Tracking through to delivery, to the extent the carrier makes tracking available for the service booked.`,
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
      `Advance manifest, import security and electronic filing charges levied for destinations that require them.`,
      `Dangerous goods, lithium battery and restricted commodity handling. These require a separate quotation and prior acceptance in writing.`,
      `Customs examination, inspection, X-ray, screening, fumigation and any charge raised by an authority at either end, including fines and penalties.`,
      `Terminal handling, delivery order, import facilitation and any similar charge raised by a terminal, airline or handling agent.`,
      `Storage, demurrage and detention arising from a delay in customs clearance or in the consignee accepting delivery.`,
      `Transit insurance, which the shipper arranges with its own insurer.`,
      `Charges arising from an incorrect, incomplete or undeliverable address, including address correction and re-attempted delivery, and return to origin where a shipment cannot be delivered or is refused. Return freight is charged at the carrier's prevailing tariff, together with any clearance charge at either end.`,
      `Cash on delivery collection, where the service offers it. Where the consignee declines to pay, the amount and the collection charge are billed to the shipper.`,
      `Pickup from the shipper's premises, unless the selected service is marked as including pickup. Pickup from any address other than the one held on the account is quoted separately.`,
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
      `Fuel surcharge. Included in the prices shown, at the rate prevailing on the date of issue on the cover and at no other. Each carrier sets its own and revises it as often as weekly, so a booking placed later is priced at the fuel rate in force on that day.`,
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

/**
 * Uplift. What can hold a shipment up, and who carries the cost when it does.
 *
 * This section deliberately states NO transit time. The workbook quotes prices
 * only; timing is discussed on a call against the specific lane and booking
 * date. What remains is the liability position: a delay does not change what is
 * payable, and what we do owe for one is capped under "Liability, claims and
 * insurance" rather than excluded outright. See the header for why the cap is
 * the stronger form.
 */
export function upliftSection(): TermsSection {
  return {
    heading: "Uplift and delivery",
    clauses: [
      `This quotation states prices only. No transit or delivery time is quoted in it, and any indication of timing given separately is an estimate based on the carrier's own published schedule, is not part of this quotation, and is not guaranteed.`,
      `Timing is in every case subject to export clearance in India and import clearance at the destination, which is outside any carrier's control.`,
      `Uplift is subject to space being available on the carrier's flights. A flight cancellation, a delay, an embargo or a load restriction imposed by an airline is outside our control and does not alter the freight payable.`,
      `Economy and consolidated services depart once a minimum load has been built for the destination, so a light shipment on such a service can wait for the next consolidation.`,
      `Same-day pickup is arranged where the request reaches us before the cut-off for that day. A request after the cut-off is collected on the next working day.`,
      `Arena does not offer money-back service guarantees. What Arena owes for a delay, if anything, is limited as set out under "Liability, claims and insurance" below.`,
    ],
  };
}

/** Documents. Preventing the shipment that gets stuck before it moves. */
export function documentationSection(): TermsSection {
  return {
    heading: "Documentation and compliance",
    clauses: [
      `All shipments require a commercial invoice or a CSB-IV declaration as applicable, with a truthful description of goods, HS code, quantity and value.`,
      `The shipper must hold a valid Importer Exporter Code and must have registered its authorised dealer code at the port of export. A shipping bill cannot be filed without them.`,
      `KYC documentation of the shipper is mandatory under Indian customs regulation and must be complete before handover. Bookings are accepted only against a completed account, and identification of the actual shipper is required with every shipment, including shipments tendered to us on behalf of another party.`,
      `Booking a shipment authorises Arena and its customs brokers to act as the shipper's agent for the purpose of arranging customs clearance, and to prepare, sign and file the shipping bill, the air waybill, the e-way bill and any other statutory form required to move, clear or deliver the shipment. The declarations so filed are made on the shipper's instructions and remain the shipper's responsibility.`,
      `Arena files under the scheme and the particulars the shipper instructs. Arena does not advise on, and does not guarantee, eligibility for duty drawback, RoDTEP or any other export incentive, and is not responsible for a benefit lost or reduced because of particulars the shipper supplied.`,
      `Export in courier mode is subject to the per-consignment value limit prescribed by Customs. A shipment above that limit must move as air cargo, which is a different service and is quoted separately.`,
      `Where a leg of the shipment moves by road within India above the value prescribed for it, an e-way bill is required and must be furnished by the shipper.`,
      `Exports against payment require the shipper to comply with FEMA and RBI regulations, including realisation of export proceeds. Arena provides transport services only and does not advise on these obligations.`,
      `Goods prohibited or restricted for export from India, or for import into the destination country, will not be carried. The shipper is responsible for confirming the admissibility of their goods at the destination.`,
      `The shipper warrants that no shipment contains a hazardous commodity under the current edition of the IATA Dangerous Goods Regulations, or any commodity restricted for carriage under Indian customs rules, unless it has been declared and accepted in advance in writing.`,
      `No rate in this document covers currency, bullion, precious metals or stones, jewellery, antiques, works of art, negotiable instruments, live animals, human remains, firearms or their parts, narcotics, or perishable goods. Where goods of these kinds are tendered without our acceptance in writing, they travel entirely at the owner's risk and Arena accepts no liability in respect of them.`,
      `The shipper warrants that neither the goods nor any party to the shipment is subject to sanctions or export controls applicable in India, at the destination, or under a regime a carrier is bound by. Arena may hold, refuse, return or report a shipment where a screening check requires it, and any cost of doing so is to the shipper's account.`,
      `Every shipment is subject to security screening and physical inspection at acceptance, and to inspection by the authorities at either end. Carriers and authorities may open a shipment without reference to us.`,
      `Undeclared or misdeclared contents may be seized by an authority at either end. Any resulting penalty, storage or return cost is to the shipper's account.`,
      `Where a banned or illegal item is found in a shipment, responsibility for it rests with the shipper, who agrees to cooperate with any resulting investigation and to bear its consequences.`,
      `Shipment details, including the name, address and contact details of the shipper and the consignee, are shared with carriers, their agents and the customs authorities in India and at the destination. That sharing is necessary to move and clear the shipment.`,
    ],
  };
}

/**
 * REVIEW. Payment, cancellation, security for our money.
 *
 * Payment in advance unless credit is agreed in writing is Arena's stated
 * position. The lien is written expressly because a forwarder is not one of the
 * trades given a general lien by Section 171 of the Contract Act, and a right
 * to hold goods without a right to sell them is a right to store them forever.
 */
export function commercialSection(): TermsSection {
  return {
    heading: "Commercial terms",
    needsBusinessReview: true,
    clauses: [
      `This document is a quotation and an invitation to book. It is not a contract of carriage, and it is not an offer that can be turned into a contract by acceptance alone. A contract arises only when a shipment is booked and that booking is accepted by Arena.`,
      `Rates are offered for the period shown on the cover and are subject to change or withdrawal before a booking is confirmed.`,
      `Charges are payable in advance of handover. Where credit terms have been agreed with Arena in writing, the terms recorded on the account apply instead.`,
      `Invoices are payable in full, without deduction, withholding or set-off. Interest is charged on an overdue amount at the rate shown on the invoice.`,
      `Reweigh differences, destination charges recharged to the shipper, and return freight are invoiced separately after the shipment and are payable on presentation.`,
      `Carriers audit shipments and raise charges on us for some months after a shipment has moved. Any such charge is invoiced to you when it reaches us, and the fact that a shipment was invoiced once already does not close it.`,
      `Proof of delivery is provided on request and can be verified online. The absence of a proof of delivery is not a ground for withholding payment of an invoice.`,
      `The shipper and the consignee are jointly and severally liable for every charge arising from a shipment.`,
      `Arena has a general and particular lien over all goods and documents in its possession, and over the proceeds of them, for every sum due from the customer on any account. Where a sum remains unpaid after written notice, Arena may sell or otherwise dispose of the goods and apply the proceeds towards what is owed, the customer remaining liable for any shortfall.`,
      `Where an account is overdue, or a charge on an earlier shipment remains unpaid, Arena may decline to accept further shipments.`,
      `A booking may be cancelled without charge before a pickup has been dispatched or a declaration has been filed, whichever happens first. After that point the costs already incurred are payable, and once a shipment has been handed to the carrier the freight is payable in full and cancellation is subject to the carrier's own terms.`,
      `The customer indemnifies Arena against every duty, tax, fine, penalty, claim, loss and cost arising out of a shipment, including one arising from an incorrect or incomplete declaration, from a breach of a warranty given in this document, or from a claim brought by the consignee or by an authority at either end.`,
      `This document is issued to the party named on the cover and is confidential to them. The rates in it are not to be disclosed to a third party.`,
    ],
  };
}

/**
 * REVIEW. What Arena owes when something goes wrong.
 *
 * The cap is written to bite however Arena is characterised, because the agent
 * framing alone is not safe: we quote one inclusive price and never disclose
 * the carrier's cost, which is principal behaviour, and a court looks at what
 * was done rather than at what the document called it. The mandatory-law carve
 * out is there because a cap that tries to go below the Carriage by Air Act is
 * void in the part that tries, and a clause that overreaches invites a court to
 * read the whole of it down.
 *
 * The claim window is a condition of a claim being considered. It is
 * deliberately NOT drafted as a bar on bringing proceedings: Section 28 of the
 * Contract Act voids an agreement that extinguishes a right on the expiry of a
 * period, so that drafting would simply fall away and take the notice
 * requirement with it.
 */
export function liabilitySection(): TermsSection {
  return {
    heading: "Liability, claims and insurance",
    needsBusinessReview: true,
    clauses: [
      `Arena arranges carriage with its carrier partners. Carriage is performed under the carrier's own terms and conditions, including their limits of liability. Arena may select the carrier, the route and the means of transport, and may consolidate a shipment with others.`,
      `Where a service named on a sheet in this workbook becomes unavailable, Arena will offer an alternative and re-quote it. A different service is not substituted without telling you.`,
      `Arena's liability for loss, damage, misdelivery or delay, however it arises and however Arena's role in the transaction is characterised, does not exceed the freight charges paid to Arena for the shipment concerned.`,
      `Nothing in this document limits liability that cannot be limited under Indian law, or reduces a limit fixed by the Carriage by Air Act, 1972 and the convention it gives effect to, where that applies to the carriage.`,
      `Arena is not liable for indirect or consequential loss, including loss of profit, loss of market and contractual penalties suffered by the shipper or the consignee.`,
      `Every limit, exclusion and defence in this document applies equally to Arena's employees, agents and subcontractors, each of whom may rely on it as if it were stated in their own favour.`,
      `Insurance is the shipper's own responsibility and is not arranged by Arena. A shipment moving without cover moves at the owner's risk. Goods that are fragile, brittle or electronic, and goods packed by the shipper, travel at the shipper's risk in any event.`,
      `The shipper warrants that goods are packed to withstand the ordinary handling of air carriage, including handling by carriers, ground handlers and customs authorities.`,
      `A claim for loss, damage or shortage must be notified to Arena in writing within fourteen days of delivery. A claim for non-delivery must be notified in writing within thirty days of the date the shipment was accepted for carriage. Notice within these periods is a condition of a claim being considered, and any shorter notice period in the carrier's own conditions applies in addition.`,
      `A claim is considered only where the goods, their packing and any damaged contents have been kept available for inspection, and where the account is clear of overdue amounts.`,
      `Arena is not liable for a failure or delay caused by an event outside its reasonable control, including an act of an authority, a strike or lockout, an airport or airline closure, an embargo, war, civil unrest, an epidemic, extreme weather, the failure of a public network or a cyber incident. Costs incurred as a result of such an event are to the customer's account.`,
    ],
  };
}

/** The short clauses that hold the rest together. */
export function generalSection(context: TermsContext): TermsSection {
  const clauses: string[] = [];

  if (context.issuerLegalName) {
    clauses.push(
      `The contracting party is ${context.issuerLegalName}, trading as Arena Cargo Logistics, at the registered address shown on the cover of this workbook.`,
    );
  }

  clauses.push(
    `These terms, together with the booking Arena confirms, are the whole of what is agreed for a shipment booked from this document. Terms printed on a customer's purchase order, or set out in other correspondence, do not apply unless Arena has accepted them in writing.`,
    `Arena may subcontract any part of the service, on any terms.`,
    `A notice under these terms is given in writing, to the postal address or the email address shown on this document.`,
    `Where a clause is held to be unenforceable, the rest of these terms stands, and that clause is read down only so far as is needed to make it enforceable.`,
    `These terms, and every contract arising from this document, are governed by the law of India. The courts at ${SWEEP_ORIGIN.city} have exclusive jurisdiction.`,
  );

  return { heading: "General", clauses };
}

/** The full set, in reading order. */
export function allTermsSections(context: TermsContext): TermsSection[] {
  return [
    basisOfRatesSection(context),
    chargeableWeightSection(),
    inclusionsSection(),
    exclusionsSection(),
    surchargesSection(),
    upliftSection(),
    documentationSection(),
    commercialSection(),
    liabilitySection(),
    generalSection(context),
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
  `Chargeable weight = greater of actual and volumetric weight (L×W×H cm ÷ ${INTERNATIONAL_VOLUMETRIC_DIVISOR} on express services). Carriers reweigh and rebill any difference.`,
  `Destination duties, taxes and customs charges are NOT included unless the service is marked Duty Paid. They are payable by the consignee before delivery.`,
  `Carrier surcharges are not included: fuel, demand and currency, remote area, residential, elevated-risk destinations, additional handling for oversize, irregular or non-stackable pieces, and address correction. Most are raised on us after a shipment has moved.`,
  `No transit or delivery time is quoted in this document. Uplift is subject to space on the carrier's flights, and clearance at both ends is outside any carrier's control.`,
  `Insurance is not included and is not arranged by Arena. Our liability is capped at the freight charges paid for the shipment.`,
  `Indicative rates, subject to reconfirmation at booking. Full terms are on the "Terms & Conditions" sheet of this workbook.`,
];

/** Stamped across an internal file so a printed page cannot be mistaken. */
export const INTERNAL_STAMP =
  "INTERNAL ONLY — RAW CARRIER COST, NO ARENA MARGIN APPLIED. DO NOT SEND TO A CUSTOMER.";
