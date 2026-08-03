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

import type { ShipmentMode, ShipmentType } from "@/generated/prisma";
import type { InvoiceIssuer } from "./config";
import type { InvoiceLineItem } from "./money";

/**
 * 1 → 2 added the cargo (boxes and their contents), the customs category, the
 * waybill and the door-pickup flags to ShipmentSnapshot. Every one of those is
 * optional on the type for exactly that reason: invoices issued at version 1
 * are still in the table, still downloadable, and must render without them
 * rather than crashing or printing "undefined". Nothing is backfilled; a v1
 * invoice is a true record of what was issued.
 */
export const INVOICE_SNAPSHOT_VERSION = 2;

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
 * One line packed inside a box: what it is, its HSN, how many, what it is worth.
 *
 * Declared values are the SHIPPER's statement of what the goods are worth, for
 * customs and for carriage liability. They are not money Arena charged, which is
 * why they never touch the charges table or the total. The document says so in
 * as many words, because a value column on an invoice that is not part of the
 * invoice total is precisely the thing an accountant will otherwise query.
 */
export interface PackageContentSnapshot {
  description: string;
  /** HSN of this item. Domestic bookings often carry none. */
  hsCode: string | null;
  quantity: number;
  /** Value of ONE unit, in `currency`. */
  unitValue: number;
  currency: string;
}

/**
 * One physical box. `quantity` is how many identical boxes: same dimensions,
 * same weight, same contents. Weight, dimensions and declared value are all
 * PER BOX, so a two-box row weighs twice `weightKg` in total. The document does
 * that multiplication where it shows a total and says "each" where it does not.
 */
export interface PackageSnapshot {
  description: string;
  quantity: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  /** Value of one box's contents. Null when the shipper declared none. */
  declaredValue: number | null;
  declaredCurrency: string | null;
  contents: PackageContentSnapshot[];
}

/**
 * What was actually shipped. Enough for the customer to match this invoice to
 * a booking without opening the app, and enough for their accountant to see
 * what the freight was charged on.
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

  /**
   * The boxes, in the order they were entered, with their contents. Absent on
   * snapshots taken before version 2; the cargo section is simply not printed
   * in that case, which is honest about what the invoice knew.
   */
  packages?: PackageSnapshot[];

  /** Customs category. CSB4 / CSB5 / COMMERCIAL on an export, null domestic. */
  shipmentType?: ShipmentType | null;

  /** Shipper's word for the cargo, when the booking recorded one. */
  declaredCargoType?: string | null;

  /**
   * The waybill the customer tracks by, once the carrier has issued one. Often
   * absent: the invoice is raised the moment the booking commits, and the AWB
   * arrives from the vendor seconds to minutes later.
   */
  awbNumber?: string | null;

  /** Door pickup was bought, and the hub the parcel was routed to. */
  pickupIncluded?: boolean;
  firstMileHubLabel?: string | null;

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
