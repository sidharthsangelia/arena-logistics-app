/**
 * lib/invoices/tax/types.ts
 *
 * The shapes stored in ShipmentInvoice's JSON columns and rendered by the PDF.
 *
 * PURE MODULE. Imported by the generator, the renderer and the UI.
 *
 * ── THESE ARE SNAPSHOTS, NOT VIEWS ──────────────────────────────────────────
 * Every field here is copied at issue time and never refreshed. That is the
 * whole point. A tax invoice is a statement about a moment: if the customer
 * renames their company, corrects their GSTIN or moves office next month, the
 * PDF they already hold must not disagree with what we can regenerate today.
 *
 * So the renderer reads ONLY these structures, never a live join. If a field is
 * not here, it does not appear on the document.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Versioned so a future template change can render an older invoice the way it
 * was actually issued rather than guessing.
 */

import type { ShipmentMode } from "@/generated/prisma";
import type { InvoiceIssuer } from "./config";
import type { InvoiceLineItem } from "./money";

export const INVOICE_SNAPSHOT_VERSION = 1;

/** Who the invoice is from. A frozen copy of the issuer config. */
export type SellerSnapshot = InvoiceIssuer & { version: number };

/** Who the invoice is billed to: always the org that paid, never their client. */
export interface BuyerSnapshot {
  version: number;
  /** Trading name if the org gave one, otherwise the workspace name. */
  legalName: string;
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
  email: string | null;
  phone: string | null;
}

/** A party as printed in the shipment block. */
export interface PartySnapshot {
  name: string | null;
  companyName: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
}

/**
 * What was actually shipped. Enough for the customer to match this invoice to
 * a booking without opening the app.
 */
export interface ShipmentSnapshot {
  version: number;
  shipmentNumber: string;
  mode: ShipmentMode;
  bookedAt: string | null;

  origin: PartySnapshot;
  destination: PartySnapshot;

  packageCount: number;
  actualWeightKg: number | null;
  chargeableWeightKg: number | null;

  /** Already white-labelled. The sourcing vendor is never named. */
  serviceName: string | null;

  /**
   * Present only when a business associate booked on behalf of their client.
   * The invoice is still billed to the BA, who paid; this names the real
   * sender in the shipment block so the BA can tell one booking from another.
   */
  consignor: PartySnapshot | null;

  /** True when a BA booked this. Drives a line of copy, nothing more. */
  bookedOnBehalfOfClient: boolean;

  /** Set only when the shipment carried a cash-on-delivery instruction. */
  codAmount: number | null;
}

/** Everything the PDF renderer needs, and nothing it does not. */
export interface InvoiceDocumentData {
  invoiceNumber: string;
  docType: "TAX_INVOICE" | "CREDIT_NOTE";
  issueDate: string;
  financialYear: string;
  status: "PAID" | "UNPAID" | "CANCELLED";

  seller: SellerSnapshot;
  buyer: BuyerSnapshot;
  shipment: ShipmentSnapshot;

  lineItems: InvoiceLineItem[];
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  total: number;
  taxRatePercent: number;
  currency: string;
  isIntraState: boolean;
  taxNote: string | null;

  placeOfSupplyCode: string;
  placeOfSupplyName: string;

  /** How the money was settled, printed under the total. */
  paymentNote: string;
}
