/**
 * lib/invoices/manual/types.ts
 *
 * The shapes stored in ManualInvoice's JSON columns and rendered by the PDF.
 *
 * PURE MODULE. Imported by the issue path, the renderer and the UI.
 *
 * ── THESE ARE SNAPSHOTS, NOT VIEWS ──────────────────────────────────────────
 * Every field here is copied at issue time and never refreshed. That is the
 * whole point. A tax invoice is a statement about a moment: if the customer
 * corrects their GSTIN or moves office next month, the PDF they already hold
 * must not disagree with what we can regenerate today.
 *
 * So the renderer reads ONLY these structures, never a live join. If a field is
 * not here, it does not appear on the document.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Versioned so a future template change can render an older invoice the way it
 * was actually issued rather than guessing. Treat every field added after
 * version 1 as optional and guard it in the template: invoices issued at an
 * earlier version are still in the table and still downloadable, and they must
 * render without the sections they never knew about rather than printing
 * "undefined". Nothing is ever backfilled.
 */

import type { ManualInvoiceDocType, ShipmentMode, TaxMode } from "@/generated/prisma";
import type { InvoiceIssuer } from "../tax/config";
import type { ManualLineItem } from "./money";

export const MANUAL_SNAPSHOT_VERSION = 1;

/** Who the invoice is from. A frozen copy of the shared issuer config. */
export type ManualSellerSnapshot = InvoiceIssuer & { version: number };

/** Who the invoice is billed to, as the party stood at issue. */
export interface ManualBuyerSnapshot {
  version: number;
  /**
   * Added after version 1, so optional and guarded in the template: an invoice
   * issued before this existed has no value here and must still render.
   * Undefined reads as a business, which every party predating the column is.
   */
  kind?: "BUSINESS" | "INDIVIDUAL";
  legalName: string;
  tradeName: string | null;
  customerCode: string | null;
  contactName: string | null;
  addressLines: string[];
  city: string | null;
  stateName: string | null;
  /** Two-digit GST state code, resolved at issue time. */
  stateCode: string | null;
  postalCode: string | null;
  country: string | null;
  /** Null prints as "Unregistered", which is valid and honest. */
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * One charge as it sat under one consignment, before the roll-up. Kept in the
 * snapshot even though the printed table is the roll-up, because "what did that
 * one AWB cost" is most of why anyone opens an old invoice, and answering it
 * from a live join would be answering it with today's data.
 */
export interface ManualChargeSnapshot {
  label: string;
  sacCode: string;
  rate: number;
  quantity: number;
  amount: number;
  discount: number;
  ratePercent: number;
  reimbursement: boolean;
  notes: string | null;
}

/** One consignment as printed. Every field optional: see the model's comment. */
export interface ManualConsignmentSnapshot {
  sortOrder: number;
  awbNumber: string | null;
  mawbNumber: string | null;
  trackingNumber: string | null;
  bookingDate: string | null;
  pickupDate: string | null;
  origin: string | null;
  destination: string | null;
  originPostalCode: string | null;
  originCity: string | null;
  originState: string | null;
  originCountry: string | null;
  destinationPostalCode: string | null;
  destinationCity: string | null;
  destinationState: string | null;
  destinationCountry: string | null;
  serviceType: string | null;
  productType: string | null;
  parcelType: string | null;
  shipMode: string | null;
  originPort: string | null;
  destinationPort: string | null;
  flightNumber: string | null;
  airlineName: string | null;
  forwarderName: string | null;
  subAgent: string | null;
  pieces: number | null;
  grossWeightKg: number | null;
  chargeableWeightKg: number | null;
  boxCount: number | null;
  palletCount: number | null;
  cartonCount: number | null;
  goodsDescription: string | null;
  particulars: string | null;
  exportInvoiceNo: string | null;
  referenceNo: string | null;
  shipperName: string | null;
  consigneeName: string | null;
  containerNumber: string | null;
  jobNumber: string | null;
  notes: string | null;
  /** Net of this consignment's own charges, so the block can show a subtotal. */
  netAmount: number;
  charges: ManualChargeSnapshot[];
}

/** Everything the template needs, and nothing it does not. */
export interface ManualInvoiceDocumentData {
  version: number;

  invoiceNumber: string;
  docType: ManualInvoiceDocType;
  /** Set on a credit note: the number of the invoice it reverses. */
  relatedInvoiceNumber: string | null;
  issueDate: string;
  dueDate: string | null;
  paymentTermsLabel: string | null;
  reference: string | null;
  /**
   * The customer's own export invoice number, printed in the header block as
   * "Shipper invoice no.".
   *
   * Not a stored column. It is lifted from the consignments when they agree on
   * one value, which is the single-consignment case the header block is for. A
   * monthly bill spanning five different shipper invoices prints them against
   * their own consignments instead, because one of five in the header would be
   * read as covering all five.
   *
   * Added after version 1: optional, guarded in the template.
   */
  shipperInvoiceNo?: string | null;
  mode: ShipmentMode;
  csbLabel: string | null;

  seller: ManualSellerSnapshot;
  buyer: ManualBuyerSnapshot;

  placeOfSupplyCode: string | null;
  placeOfSupplyName: string | null;

  /**
   * The SAC the whole invoice is billed under, and what it means in words.
   *
   * Printed in the header block because that is where a reader looks for "what
   * was this bill for", and stated once there is worth more than the same code
   * repeated down a column. Null when the lines genuinely carry different SACs,
   * in which case the per-line column is the honest answer and the header stays
   * quiet rather than naming one of several.
   *
   * Added after version 1: optional, guarded in the template.
   */
  sacCode?: string | null;
  serviceDescription?: string | null;

  currency: string;
  taxMode: TaxMode;
  reverseCharge: boolean;
  isIntraState: boolean;

  consignments: ManualConsignmentSnapshot[];
  lineItems: ManualLineItem[];

  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  reimbursements: number;
  total: number;
  taxNote: string | null;

  irn: string | null;
  irnAckNo: string | null;
  irnAckDate: string | null;
  irnQrData: string | null;

  notes: string | null;
  terms: string[];

  /** Marked across the document when the invoice has been voided. */
  cancelled: boolean;

  /**
   * True only for the on-screen preview of an unissued draft.
   *
   * Added after version 1. A preview is a real render of the real template, by
   * design, which is exactly what makes it dangerous: without a mark on the
   * page, a file somebody saved out of the preview is indistinguishable from an
   * invoice that took a serial. The mark is what stops that being sent.
   */
  draft?: boolean;
}
