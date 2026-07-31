/**
 * lib/invoices/tax/build.ts
 *
 * Turns a booked shipment into the frozen content of its tax invoice.
 *
 * This is the seam between the application's data and the invoice's own world.
 * Everything downstream (the row, the PDF, the download) reads only what this
 * file produced, so the document can never drift as the underlying records
 * change. See ./types.ts for why that matters.
 *
 * Deliberately NOT responsible for: allocating a number (./numbering.ts),
 * rendering (./pdf/), or deciding when any of it happens (the Inngest function).
 * It reads a shipment and returns data.
 */

import "server-only";

import { Prisma, ShipmentMode, TaxDocType } from "@/generated/prisma";

import { makeChargeDescriber } from "./chargeNames";
import { getInvoiceIssuer, taxTreatmentFor } from "./config";
import { formatInvoiceDate, resolvePlaceOfSupply } from "./gst";
import {
  buildInvoiceMoney,
  verifyInvoiceMoney,
  type RawCharge,
} from "./money";
import {
  INVOICE_SNAPSHOT_VERSION,
  type BuyerSnapshot,
  type InvoiceDocumentData,
  type PartySnapshot,
  type SellerSnapshot,
  type ShipmentSnapshot,
} from "./types";

// ---------------------------------------------------------------------------
// What the builder needs loaded
// ---------------------------------------------------------------------------
//
// An explicit select rather than a fat include. chargesSnapshot and
// serviceabilitySnapshot are large JSON blobs and only the first is wanted, so
// naming the columns keeps this off the "accidentally loads a megabyte per
// booking" path that lib/quotes/tenantQueries.ts already warns about.

export const INVOICE_SHIPMENT_SELECT = {
  id: true,
  shipmentNumber: true,
  orgId: true,
  mode: true,
  status: true,
  bookedAt: true,
  createdAt: true,
  currency: true,
  quotedTotal: true,
  firstMileCharge: true,
  firstMileHubLabel: true,
  pickupIncluded: true,
  chargesSnapshot: true,
  selectedProductName: true,
  totalActualWeightKg: true,
  totalChargeableWeightKg: true,
  paymentDeferred: true,
  codAmount: true,
  clientId: true,
  senderName: true,
  org: {
    select: {
      id: true,
      name: true,
      companyName: true,
      contactName: true,
      email: true,
      phone: true,
      addressLine1: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
      gstin: true,
      gstStateCode: true,
      isBusinessAssociate: true,
    },
  },
  client: {
    select: {
      companyName: true,
      contactName: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
    },
  },
  pickupAddress: {
    select: {
      contactName: true,
      companyName: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
    },
  },
  deliveryAddress: {
    select: {
      contactName: true,
      companyName: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
    },
  },
  packages: { select: { quantity: true } },
} satisfies Prisma.ShipmentSelect;

export type InvoiceShipment = Prisma.ShipmentGetPayload<{
  select: typeof INVOICE_SHIPMENT_SELECT;
}>;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface BuiltInvoice {
  /** Columns for the ShipmentInvoice row, minus the number and the file. */
  row: {
    orgId: string;
    shipmentId: string;
    docType: TaxDocType;
    issueDate: Date;
    taxableValue: Prisma.Decimal;
    cgstAmount: Prisma.Decimal;
    sgstAmount: Prisma.Decimal;
    igstAmount: Prisma.Decimal;
    totalTax: Prisma.Decimal;
    total: Prisma.Decimal;
    taxRatePercent: Prisma.Decimal;
    currency: string;
    taxNote: string | null;
    placeOfSupplyCode: string;
    placeOfSupplyName: string;
    sellerSnapshot: Prisma.InputJsonValue;
    buyerSnapshot: Prisma.InputJsonValue;
    shipmentSnapshot: Prisma.InputJsonValue;
    lineItems: Prisma.InputJsonValue;
    status: "PAID" | "UNPAID";
  };
  /** The same content, shaped for the renderer. Number filled in later. */
  document: Omit<InvoiceDocumentData, "invoiceNumber" | "financialYear">;
}

export class InvoiceBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceBuildError";
  }
}

// ---------------------------------------------------------------------------

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

function partySnapshot(
  address: {
    contactName: string | null;
    companyName: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postalCode: string | null;
  } | null,
): PartySnapshot {
  return {
    name: address?.contactName ?? null,
    companyName: address?.companyName ?? null,
    city: address?.city ?? null,
    state: address?.state ?? null,
    country: address?.country ?? null,
    postalCode: address?.postalCode ?? null,
  };
}

/**
 * Charge lines out of the stored snapshot.
 *
 * The snapshot is `{ ...selectedService, price }`, so the lines live under
 * `.charges`. It is JSON written by a past version of the code, so it is
 * treated as untrusted: a shape that does not match yields no lines, and the
 * money engine falls back to a single service line covering the full total.
 * An invoice with a coarse breakdown is recoverable; a crashed job is not.
 */
function readCharges(snapshot: Prisma.JsonValue | null): RawCharge[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return [];
  }

  const charges = (snapshot as Record<string, unknown>).charges;
  if (!Array.isArray(charges)) return [];

  return charges.flatMap((entry): RawCharge[] => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const amount = Number(record.amount);
    if (!Number.isFinite(amount)) return [];

    return [
      {
        name: typeof record.name === "string" ? record.name : "",
        amount,
        currency: typeof record.currency === "string" ? record.currency : undefined,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

/**
 * Build the invoice content for a shipment.
 *
 * @throws {InvoiceBuildError} when the shipment cannot produce a defensible
 *   invoice. Throwing is correct here: it is caught by the job, reported, and
 *   leaves the row PENDING for an admin to look at. Issuing a numbered document
 *   built on data we know is wrong would be worse than issuing nothing.
 */
export function buildInvoiceForShipment(
  shipment: InvoiceShipment,
): BuiltInvoice {
  const issuer = getInvoiceIssuer();
  const org = shipment.org;

  // ── The authoritative total ─────────────────────────────────────────────
  // Exactly what left the wallet: createShipment.action.ts debits
  // servicePrice + firstMileCharge. Reproduced here rather than read from a
  // single stored column because no single column holds it.
  const servicePrice = toNumber(shipment.quotedTotal);
  const firstMileCharge = shipment.pickupIncluded
    ? toNumber(shipment.firstMileCharge)
    : 0;
  const totalCharged = servicePrice + firstMileCharge;

  if (!(totalCharged > 0)) {
    throw new InvoiceBuildError(
      `Shipment ${shipment.shipmentNumber} has no chargeable total ` +
        `(quotedTotal ${servicePrice}, firstMile ${firstMileCharge}). ` +
        "An invoice for zero is not a document worth issuing.",
    );
  }

  // ── Place of supply ─────────────────────────────────────────────────────
  const placeOfSupply = resolvePlaceOfSupply({
    gstin: org.gstin,
    stateCode: org.gstStateCode,
    stateName: org.state,
    sellerStateCode: issuer.stateCode,
  });

  // ── Money ───────────────────────────────────────────────────────────────
  const describe = makeChargeDescriber({
    mode: shipment.mode,
    originCity: shipment.pickupAddress?.city ?? null,
    destinationCity: shipment.deliveryAddress?.city ?? null,
  });

  const money = buildInvoiceMoney(
    {
      totalCharged,
      charges: readCharges(shipment.chargesSnapshot),
      firstMileCharge,
      firstMileLabel: shipment.firstMileHubLabel,
      mode: shipment.mode,
      sellerStateCode: issuer.stateCode,
      placeOfSupplyCode: placeOfSupply.code,
    },
    describe,
  );

  // The engine's own invariants, re-checked before anything is persisted. This
  // is cheap and it is the last point at which a bad invoice costs nothing.
  const verified = verifyInvoiceMoney(money, totalCharged);
  if (!verified.ok) {
    throw new InvoiceBuildError(
      `Invoice arithmetic failed for ${shipment.shipmentNumber}: ${verified.problem}`,
    );
  }

  // ── Snapshots ───────────────────────────────────────────────────────────

  const seller: SellerSnapshot = { ...issuer, version: INVOICE_SNAPSHOT_VERSION };

  const buyer: BuyerSnapshot = {
    version: INVOICE_SNAPSHOT_VERSION,
    // companyName is the trading name they entered; Org.name is the workspace
    // label. Prefer the former, fall back so the bill-to block is never blank.
    legalName: org.companyName?.trim() || org.name,
    contactName: org.contactName,
    addressLines: [org.addressLine1].filter(
      (line): line is string => !!line?.trim(),
    ),
    city: org.city,
    stateName: placeOfSupply.name,
    stateCode: placeOfSupply.code,
    postalCode: org.postalCode,
    country: org.country ?? "India",
    gstin: org.gstin?.trim() || null,
    email: org.email,
    phone: org.phone,
  };

  // A BA books for its own client. The invoice is still billed to the BA, who
  // paid it from their wallet at their own rate, so the client appears only
  // here in the shipment block as the real sender.
  const bookedOnBehalfOfClient = !!shipment.clientId && org.isBusinessAssociate;

  const consignor: PartySnapshot | null = bookedOnBehalfOfClient
    ? {
        name: shipment.client?.contactName ?? shipment.senderName ?? null,
        companyName: shipment.client?.companyName ?? null,
        city: shipment.client?.city ?? null,
        state: shipment.client?.state ?? null,
        country: shipment.client?.country ?? null,
        postalCode: shipment.client?.postalCode ?? null,
      }
    : null;

  const packageCount = shipment.packages.reduce(
    (sum, p) => sum + (p.quantity ?? 1),
    0,
  );

  const issueDate = shipment.bookedAt ?? shipment.createdAt;

  const shipmentSnapshot: ShipmentSnapshot = {
    version: INVOICE_SNAPSHOT_VERSION,
    shipmentNumber: shipment.shipmentNumber,
    mode: shipment.mode,
    bookedAt: shipment.bookedAt ? shipment.bookedAt.toISOString() : null,
    origin: partySnapshot(shipment.pickupAddress),
    destination: partySnapshot(shipment.deliveryAddress),
    packageCount,
    actualWeightKg: shipment.totalActualWeightKg
      ? toNumber(shipment.totalActualWeightKg)
      : null,
    chargeableWeightKg: shipment.totalChargeableWeightKg
      ? toNumber(shipment.totalChargeableWeightKg)
      : null,
    // Already white-labelled when it was stored at booking time.
    serviceName: shipment.selectedProductName,
    consignor,
    bookedOnBehalfOfClient,
    codAmount: shipment.codAmount ? toNumber(shipment.codAmount) : null,
  };

  // ── Payment ─────────────────────────────────────────────────────────────
  // paymentDeferred means an Org.skipPayment booking: the parcel moves now and
  // ops collect at the hub. The invoice is still raised at booking (the tax
  // point is the supply, not the receipt), just marked unpaid.
  const status = shipment.paymentDeferred ? "UNPAID" : "PAID";
  const paymentNote = shipment.paymentDeferred
    ? "Payable on collection. This amount has not been settled."
    : `Paid from wallet on ${formatInvoiceDate(issueDate)}.`;

  const treatment = taxTreatmentFor(shipment.mode);

  return {
    row: {
      orgId: shipment.orgId,
      shipmentId: shipment.id,
      docType: TaxDocType.TAX_INVOICE,
      issueDate,
      taxableValue: new Prisma.Decimal(money.taxableValue.toFixed(2)),
      cgstAmount: new Prisma.Decimal(money.cgstAmount.toFixed(2)),
      sgstAmount: new Prisma.Decimal(money.sgstAmount.toFixed(2)),
      igstAmount: new Prisma.Decimal(money.igstAmount.toFixed(2)),
      totalTax: new Prisma.Decimal(money.totalTax.toFixed(2)),
      total: new Prisma.Decimal(money.total.toFixed(2)),
      taxRatePercent: new Prisma.Decimal(money.taxRatePercent.toFixed(2)),
      // GST invoices are raised in rupees. Shipment.currency is INR for every
      // booking today; if a non-INR booking ever exists this is where it has
      // to be dealt with rather than silently mislabelled.
      currency: "INR",
      taxNote: money.taxNote ?? null,
      placeOfSupplyCode: placeOfSupply.code,
      placeOfSupplyName: placeOfSupply.name,
      sellerSnapshot: seller as unknown as Prisma.InputJsonValue,
      buyerSnapshot: buyer as unknown as Prisma.InputJsonValue,
      shipmentSnapshot: shipmentSnapshot as unknown as Prisma.InputJsonValue,
      lineItems: money.lineItems as unknown as Prisma.InputJsonValue,
      status,
    },
    document: {
      docType: "TAX_INVOICE",
      issueDate: issueDate.toISOString(),
      status,
      seller,
      buyer,
      shipment: shipmentSnapshot,
      lineItems: money.lineItems,
      taxableValue: money.taxableValue,
      cgstAmount: money.cgstAmount,
      sgstAmount: money.sgstAmount,
      igstAmount: money.igstAmount,
      totalTax: money.totalTax,
      total: money.total,
      taxRatePercent: money.taxRatePercent,
      currency: "INR",
      isIntraState: money.isIntraState,
      taxNote: money.taxNote ?? treatment.note ?? null,
      placeOfSupplyCode: placeOfSupply.code,
      placeOfSupplyName: placeOfSupply.name,
      paymentNote,
    },
  };
}

/** Convenience for the renderer: rebuild document data from a stored row. */
export function documentFromRow(row: {
  invoiceNumber: string | null;
  docType: TaxDocType;
  issueDate: Date;
  financialYear: string | null;
  status: string;
  sellerSnapshot: Prisma.JsonValue;
  buyerSnapshot: Prisma.JsonValue;
  shipmentSnapshot: Prisma.JsonValue;
  lineItems: Prisma.JsonValue;
  taxableValue: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  totalTax: Prisma.Decimal;
  total: Prisma.Decimal;
  taxRatePercent: Prisma.Decimal;
  currency: string;
  taxNote: string | null;
  placeOfSupplyCode: string;
  placeOfSupplyName: string;
  paymentNote?: string;
}): InvoiceDocumentData {
  return {
    invoiceNumber: row.invoiceNumber ?? "",
    docType: row.docType === TaxDocType.CREDIT_NOTE ? "CREDIT_NOTE" : "TAX_INVOICE",
    issueDate: row.issueDate.toISOString(),
    financialYear: row.financialYear ?? "",
    status: row.status as InvoiceDocumentData["status"],
    seller: row.sellerSnapshot as unknown as SellerSnapshot,
    buyer: row.buyerSnapshot as unknown as BuyerSnapshot,
    shipment: row.shipmentSnapshot as unknown as ShipmentSnapshot,
    lineItems: row.lineItems as unknown as InvoiceDocumentData["lineItems"],
    taxableValue: toNumber(row.taxableValue),
    cgstAmount: toNumber(row.cgstAmount),
    sgstAmount: toNumber(row.sgstAmount),
    igstAmount: toNumber(row.igstAmount),
    totalTax: toNumber(row.totalTax),
    total: toNumber(row.total),
    taxRatePercent: toNumber(row.taxRatePercent),
    currency: row.currency,
    // Which heads carry the tax is the fact that was stored; the flag is just
    // a reading of it. Zero tax means neither applies and the renderer shows
    // no split either way.
    isIntraState:
      toNumber(row.cgstAmount) > 0 || toNumber(row.sgstAmount) > 0,
    taxNote: row.taxNote,
    placeOfSupplyCode: row.placeOfSupplyCode,
    placeOfSupplyName: row.placeOfSupplyName,
    paymentNote:
      row.paymentNote ??
      (row.status === "UNPAID"
        ? "Payable on collection. This amount has not been settled."
        : `Paid from wallet on ${formatInvoiceDate(row.issueDate)}.`),
  };
}

/** Shipment modes that get an invoice. Both, today. Kept explicit. */
export const INVOICEABLE_MODES: readonly ShipmentMode[] = [
  ShipmentMode.DOMESTIC,
  ShipmentMode.INTERNATIONAL,
];
