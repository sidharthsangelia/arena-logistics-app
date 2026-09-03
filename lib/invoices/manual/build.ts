/**
 * lib/invoices/manual/build.ts
 *
 * Turns a draft invoice and its rows into the frozen content a manual invoice
 * prints: the snapshots, the rolled-up line items, and the money.
 *
 * The ONE place a manual invoice's printable content is derived. Both the live
 * draft preview and the issue path call it with the same input, so what the
 * admin saw on screen is what the PDF says. Two derivations would eventually
 * disagree, and the disagreement would surface as a customer holding an invoice
 * whose total differs from the one in the list.
 */

import "server-only";

import {
  ManualInvoiceDocType,
  ShipmentMode,
  TaxMode,
  type Prisma,
} from "@/generated/prisma";

import {
  getInvoiceIssuer,
  invoiceTermsFor,
  taxTreatmentFor,
} from "../tax/config";
import { formatGstin, gstStateName, resolvePlaceOfSupply } from "../tax/gst";
import { csbLabel, paymentTermLabel } from "./config";
import {
  buildManualInvoiceMoney,
  verifyManualInvoiceMoney,
  type ManualChargeInput,
  type ManualInvoiceMoney,
  type ManualLineItem,
} from "./money";
import {
  MANUAL_SNAPSHOT_VERSION,
  type ManualBuyerSnapshot,
  type ManualConsignmentSnapshot,
  type ManualInvoiceDocumentData,
  type ManualSellerSnapshot,
} from "./types";

// ---------------------------------------------------------------------------
// The rows this module reads
// ---------------------------------------------------------------------------

/**
 * Exactly the include the issue path and the preview both use. Exported so a
 * caller cannot fetch a narrower shape and discover the omission at runtime.
 */
export const manualInvoiceInclude = {
  billingParty: true,
  relatedInvoice: { select: { invoiceNumber: true } },
  consignments: {
    orderBy: { sortOrder: "asc" },
    include: { charges: { orderBy: { sortOrder: "asc" } } },
  },
} satisfies Prisma.ManualInvoiceInclude;

export type ManualInvoiceWithRows = Prisma.ManualInvoiceGetPayload<{
  include: typeof manualInvoiceInclude;
}>;

// ---------------------------------------------------------------------------
// Decimal helpers
// ---------------------------------------------------------------------------
//
// Prisma returns Decimal, which is exact and which the money engine cannot use
// directly. Converting through Number is safe here and only here: every value
// is bounded by the column's own Decimal(14,2), far inside the range where a
// double represents two-decimal values exactly. The engine immediately converts
// to integer minor units and does all its arithmetic there.

function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

function numOrNull(
  value: Prisma.Decimal | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : value.toNumber();
}

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Recompute an invoice's money from its stored rows.
 *
 * Always recomputed, never read back from the invoice's own total columns. Those
 * columns are a cache for the list view; this is the answer. An issue path that
 * trusted the cache would print whatever a stale write had left behind.
 */
export function computeManualMoney(
  invoice: ManualInvoiceWithRows,
  sellerStateCode: string,
): { money: ManualInvoiceMoney; placeOfSupply: { code: string; name: string } } {
  const party = invoice.billingParty;

  // An explicit place of supply on the invoice wins: an admin who set it was
  // answering a question about this supply, which the party's registered
  // address cannot answer for a consignment handed over somewhere else.
  const place = invoice.placeOfSupplyCode
    ? {
        code: invoice.placeOfSupplyCode,
        name:
          invoice.placeOfSupplyName ??
          gstStateName(invoice.placeOfSupplyCode) ??
          "Unknown",
      }
    : (() => {
        const resolved = resolvePlaceOfSupply({
          gstin: party.gstin,
          stateCode: party.stateCode,
          stateName: party.state,
          sellerStateCode,
        });
        return { code: resolved.code, name: resolved.name };
      })();

  const lines: ManualChargeInput[] = [];
  invoice.consignments.forEach((consignment, index) => {
    for (const charge of consignment.charges) {
      lines.push({
        label: charge.label,
        sacCode: charge.sacCode,
        rate: num(charge.rate),
        quantity: num(charge.quantity),
        amount: num(charge.amount),
        discount: num(charge.discount),
        ratePercent: num(charge.ratePercent),
        reimbursement: charge.reimbursement,
        consignmentIndex: index,
      });
    }
  });

  const money = buildManualInvoiceMoney({
    lines,
    taxMode: invoice.taxMode,
    reverseCharge: invoice.reverseCharge,
    sellerStateCode,
    placeOfSupplyCode: place.code,
  });

  return { money, placeOfSupply: place };
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export function buildSellerSnapshot(): ManualSellerSnapshot {
  return { ...getInvoiceIssuer(), version: MANUAL_SNAPSHOT_VERSION };
}

export function buildBuyerSnapshot(
  party: ManualInvoiceWithRows["billingParty"],
  placeOfSupplyCode: string,
): ManualBuyerSnapshot {
  return {
    version: MANUAL_SNAPSHOT_VERSION,
    kind: party.kind,
    legalName: party.legalName,
    tradeName: party.tradeName,
    customerCode: party.customerCode,
    contactName: party.contactName,
    addressLines: [party.addressLine1, party.addressLine2].filter(
      (l): l is string => !!l && l.trim().length > 0,
    ),
    city: party.city,
    stateName: party.state ?? gstStateName(placeOfSupplyCode),
    stateCode: party.stateCode ?? placeOfSupplyCode,
    postalCode: party.postalCode,
    country: party.country,
    gstin: formatGstin(party.gstin),
    pan: party.pan,
    cin: party.cin,
    email: party.email,
    phone: party.phone,
  };
}

export function buildConsignmentSnapshots(
  invoice: ManualInvoiceWithRows,
): ManualConsignmentSnapshot[] {
  return invoice.consignments.map((consignment, index) => {
    const charges = consignment.charges.map((charge) => ({
      label: charge.label,
      sacCode: charge.sacCode,
      rate: num(charge.rate),
      quantity: num(charge.quantity),
      amount: num(charge.amount),
      discount: num(charge.discount),
      ratePercent: num(charge.ratePercent),
      reimbursement: charge.reimbursement,
      notes: charge.notes,
    }));

    // Net of what the customer is charged for this consignment, before tax.
    // Deliberately not "including its share of the tax": tax is stated once, on
    // the roll-up, and apportioning it back per consignment would print a
    // second set of figures that do not add to the total.
    const netAmount = charges.reduce(
      (sum, c) => sum + Math.max(0, c.amount - c.discount),
      0,
    );

    return {
      sortOrder: index,
      awbNumber: consignment.awbNumber,
      mawbNumber: consignment.mawbNumber,
      trackingNumber: consignment.trackingNumber,
      bookingDate: iso(consignment.bookingDate),
      pickupDate: iso(consignment.pickupDate),
      origin: consignment.origin,
      destination: consignment.destination,
      originPostalCode: consignment.originPostalCode,
      originCity: consignment.originCity,
      originState: consignment.originState,
      originCountry: consignment.originCountry,
      destinationPostalCode: consignment.destinationPostalCode,
      destinationCity: consignment.destinationCity,
      destinationState: consignment.destinationState,
      destinationCountry: consignment.destinationCountry,
      serviceType: consignment.serviceType,
      productType: consignment.productType,
      parcelType: consignment.parcelType,
      shipMode: consignment.shipMode,
      originPort: consignment.originPort,
      destinationPort: consignment.destinationPort,
      flightNumber: consignment.flightNumber,
      airlineName: consignment.airlineName,
      forwarderName: consignment.forwarderName,
      subAgent: consignment.subAgent,
      pieces: consignment.pieces,
      grossWeightKg: numOrNull(consignment.grossWeightKg),
      chargeableWeightKg: numOrNull(consignment.chargeableWeightKg),
      boxCount: consignment.boxCount,
      palletCount: consignment.palletCount,
      cartonCount: consignment.cartonCount,
      goodsDescription: consignment.goodsDescription,
      hsnCode: consignment.hsnCode,
      particulars: consignment.particulars,
      exportInvoiceNo: consignment.exportInvoiceNo,
      referenceNo: consignment.referenceNo,
      shipperName: consignment.shipperName,
      consigneeName: consignment.consigneeName,
      containerNumber: consignment.containerNumber,
      jobNumber: consignment.jobNumber,
      notes: consignment.notes,
      netAmount: Math.round(netAmount * 100) / 100,
      charges,
    };
  });
}

/**
 * The one SAC the whole invoice is billed under, or null when the lines differ.
 *
 * Reimbursement lines are ignored: a recovery carries no SAC of Arena's, and
 * counting the placeholder on it would make every invoice with a recovery look
 * like a mixed-SAC invoice.
 */
function sharedSacCode(lineItems: ManualLineItem[]): string | null {
  const codes = new Set(
    lineItems
      .filter((l) => !l.reimbursement)
      .map((l) => l.sacCode?.trim())
      .filter(Boolean),
  );
  return codes.size === 1 ? [...codes][0]! : null;
}

/**
 * The one shipper invoice number the whole document is against, or null.
 *
 * The header block is for facts that describe the INVOICE. A shipper invoice
 * number only describes the invoice when every consignment on it carries the
 * same one, which is the single-shipment case. When they differ, printing the
 * first of them at the top would be read as covering all of them, so the header
 * stays empty and the numbers print against their own consignments instead.
 */
function sharedShipperInvoiceNo(
  consignments: ManualConsignmentSnapshot[],
): string | null {
  const values = new Set(
    consignments.map((c) => c.exportInvoiceNo?.trim()).filter(Boolean),
  );
  return values.size === 1 ? [...values][0]! : null;
}

// ---------------------------------------------------------------------------
// The whole document
// ---------------------------------------------------------------------------

export class ManualInvoiceBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualInvoiceBuildError";
  }
}

/**
 * Build everything a manual invoice prints.
 *
 * `invoiceNumber` is passed in rather than read off the row because the issue
 * path allocates it in the same transaction and has not written it yet, and
 * because a draft preview has no number at all and passes a placeholder.
 *
 * Throws if the money does not satisfy its invariants. That is the right
 * behaviour on the issue path: better a failed button press than a numbered
 * document whose column does not add up.
 */
export function buildManualInvoiceDocument(
  invoice: ManualInvoiceWithRows,
  opts: { invoiceNumber: string; cancelled?: boolean; draft?: boolean },
): { data: ManualInvoiceDocumentData; money: ManualInvoiceMoney } {
  const seller = buildSellerSnapshot();
  const { money, placeOfSupply } = computeManualMoney(invoice, seller.stateCode);

  const problems = verifyManualInvoiceMoney(money);
  if (problems.length > 0) {
    throw new ManualInvoiceBuildError(
      `Invoice does not add up: ${problems.join("; ")}`,
    );
  }

  const buyer = buildBuyerSnapshot(invoice.billingParty, placeOfSupply.code);

  const consignments = buildConsignmentSnapshots(invoice);

  const terms = invoice.termsOverride
    ? invoice.termsOverride
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean)
    // From the seller SNAPSHOT, not the live issuer config: clause 1 names the
    // payee, and this text is frozen onto the invoice at issue.
    : invoiceTermsFor(invoice.mode, seller);

  return {
    money,
    data: {
      version: MANUAL_SNAPSHOT_VERSION,

      invoiceNumber: opts.invoiceNumber,
      docType: invoice.docType,
      relatedInvoiceNumber: invoice.relatedInvoice?.invoiceNumber ?? null,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: iso(invoice.dueDate),
      paymentTermsLabel: paymentTermLabel(invoice.paymentTerms),
      reference: invoice.reference,
      shipperInvoiceNo: sharedShipperInvoiceNo(consignments),
      mode: invoice.mode,
      csbLabel: csbLabel(invoice.csbCategory),

      seller,
      buyer,

      placeOfSupplyCode: placeOfSupply.code,
      placeOfSupplyName: placeOfSupply.name,

      sacCode: sharedSacCode(money.lineItems),
      serviceDescription: taxTreatmentFor(invoice.mode).sacDescription,
      showSacCode: invoice.showSacCode,

      currency: invoice.currency,
      taxMode: invoice.taxMode,
      reverseCharge: invoice.reverseCharge,
      isIntraState: money.isIntraState,

      consignments,
      lineItems: money.lineItems,

      taxableValue: money.taxableValue,
      cgstAmount: money.cgstAmount,
      sgstAmount: money.sgstAmount,
      igstAmount: money.igstAmount,
      totalTax: money.totalTax,
      reimbursements: money.reimbursements,
      total: money.total,
      taxNote: resolveTaxNote(invoice, money),

      irn: invoice.irn,
      irnAckNo: invoice.irnAckNo,
      irnAckDate: iso(invoice.irnAckDate),
      irnQrData: invoice.irnQrData,

      notes: invoice.notes,
      terms,

      cancelled: opts.cancelled === true,
      draft: opts.draft === true,
    },
  };
}

/**
 * The line printed under the totals when no tax was charged.
 *
 * A zero-tax invoice with no explanation is the kind of thing that gets
 * questioned, and the reason differs: reverse charge is the recipient's
 * liability, an export is zero-rated, and a bill of pure recoveries is neither.
 * Stating which one it is on the document saves the question.
 */
function resolveTaxNote(
  invoice: ManualInvoiceWithRows,
  money: ManualInvoiceMoney,
): string | null {
  if (invoice.taxNote) return invoice.taxNote;
  if (money.totalTax > 0) return null;

  if (invoice.reverseCharge) {
    return "Tax payable by the recipient under reverse charge.";
  }
  if (money.taxableValue === 0 && money.reimbursements > 0) {
    return "This document recovers amounts paid on your behalf. No supply is charged.";
  }
  if (invoice.mode === ShipmentMode.INTERNATIONAL) {
    return "Zero-rated supply. Confirm the applicable export treatment before filing.";
  }
  return null;
}

/** True when the doc type is a credit note, which reverses another invoice. */
export function isCreditNote(docType: ManualInvoiceDocType): boolean {
  return docType === ManualInvoiceDocType.CREDIT_NOTE;
}

/** Exported for the tax-mode label on the preview. */
export const TAX_MODE_DEFAULT = TaxMode.EXCLUSIVE;
