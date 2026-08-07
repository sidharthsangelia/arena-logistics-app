/**
 * lib/labels/awb/types.ts
 * -----------------------------------------------------------------------------
 * What a shipping label needs to know.
 *
 * This is a SNAPSHOT type, like InvoiceDocumentData: the document renders from
 * it and never from a live record. A label is printed once and stuck to a box,
 * so what it says has to be what was true when it was printed, whatever the
 * shipment row does afterwards.
 *
 * ── THE ITEM TABLE IS DELIBERATELY VAGUE ────────────────────────────────────
 * `items[].description` is a CATEGORY, never a product name. This is a real
 * industry convention, not squeamishness: the outside of a carton is readable
 * by every person who handles it, and "Apple iPhone 15 Pro" printed there is an
 * invitation. Every major Indian courier prints a category or nothing at all.
 *
 * The type cannot enforce that on its own, so the enforcement lives in the
 * mapper (see fromShipment.ts), which reads the box-level summary and is
 * structurally incapable of reaching the per-item contents. Anyone constructing
 * this type by hand has to honour the rule themselves.
 */

/** Prepaid, or cash collected at the door. Drives the payment stamp. */
export type LabelPaymentType = "PREPAID" | "COD";

/** One line of the item table. */
export interface AwbLabelItem {
  /**
   * A generic category: "Apparel", "Electronics accessory", "Documents".
   * NEVER the specific product. See the note at the top of this file.
   */
  description: string;
  qty: number;
}

export interface AwbLabelData {
  // ── Ship to ──
  receiverName: string;
  receiverAddress: string;
  receiverCity: string;
  receiverState: string;
  receiverPinCode: string;
  receiverMobile: string;

  // ── Carrier and waybill ──
  /** The carrier actually moving it, e.g. "XpressBees". */
  courierName: string;
  /** The slab the service was sold on, e.g. "2KG". Optional: not every service has one. */
  courierWeightTier?: string;
  /**
   * The CARRIER's waybill number, not one of ours.
   *
   * This is what the courier's own sortation scanners expect to read. An Arena
   * reference here would produce a label that looks right and cannot be routed.
   */
  awbNumber: string;
  /** Free text as printed, e.g. "30 x 20 x 10 cm". */
  dimensions: string;
  /** Free text as printed, e.g. "2.50 kg". */
  weight: string;

  // ── Return to ──
  senderCompanyName: string;
  senderContactName: string;
  senderAddress: string;
  senderMobile: string;

  // ── Order ──
  orderId: string;
  /** Internal reference, printed small. Ours to reconcile against, not the carrier's. */
  refId: string;
  paymentType: LabelPaymentType;
  /** Rupees to collect at the door. Required when paymentType is "COD". */
  codAmount?: number;

  items: AwbLabelItem[];
}

/**
 * Paper the label is printed on.
 *
 *   thermal — a 4x6in direct-thermal label, one label per page. The default and
 *             the real target.
 *   a4      — the identical 4x6 artwork placed at the top-left of an A4 sheet,
 *             for offices with only a laser printer. Same geometry, so a
 *             barcode printed either way is the same barcode.
 */
export type LabelPaperSize = "thermal" | "a4";

export class AwbLabelDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwbLabelDataError";
  }
}

/**
 * Refuse label data that would print something misleading.
 *
 * A label is not correctable after the fact. These are the fields whose absence
 * produces a parcel that cannot be delivered or money collected wrongly, so
 * they fail loudly here rather than printing as a blank space on a box.
 */
export function assertLabelData(data: AwbLabelData): void {
  const missing: string[] = [];

  if (!data.awbNumber?.trim()) missing.push("awbNumber");
  if (!data.receiverName?.trim()) missing.push("receiverName");
  if (!data.receiverAddress?.trim()) missing.push("receiverAddress");
  if (!data.receiverPinCode?.trim()) missing.push("receiverPinCode");
  if (!data.receiverMobile?.trim()) missing.push("receiverMobile");
  if (!data.orderId?.trim()) missing.push("orderId");

  if (missing.length > 0) {
    throw new AwbLabelDataError(
      `Cannot print a label without: ${missing.join(", ")}.`,
    );
  }

  // A COD label whose amount is missing tells the delivery agent to collect an
  // unknown sum. A zero is equally wrong: it reads as "collect nothing", which
  // is what PREPAID is for.
  if (data.paymentType === "COD" && !(Number(data.codAmount) > 0)) {
    throw new AwbLabelDataError(
      "A COD label needs a codAmount greater than zero; use PREPAID if nothing is collected.",
    );
  }
}
