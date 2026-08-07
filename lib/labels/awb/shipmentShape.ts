/**
 * lib/labels/awb/shipmentShape.ts
 *
 * The decisions that turn a shipment's cargo into the three lines a label has
 * room for: what the service is called, how big the consignment is, and what is
 * broadly in it.
 *
 * Pure, and free of any `server-only` import, so the rules can be tested
 * directly. `fromShipment.ts` does the loading and the org scoping and calls
 * these; the judgement lives here where it can be pinned down.
 *
 * The item mapping is the one worth reading twice. Categories only, never
 * product names, and the reasoning is in fromShipment.ts where the database
 * select enforces it.
 */

import type { AwbLabelItem } from "./types";

/** The subset of a package row these rules read. */
export interface LabelPackage {
  /** BOX-LEVEL summary, e.g. "Apparel carton". Never the contents. */
  description: string;
  quantity: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/**
 * The item table has a fixed slot on a 4x6 label. More rows than this and the
 * layout pushes onto a second page nobody prints.
 */
export const MAX_ITEM_ROWS = 4;

/**
 * Split a service name into the carrier and its weight slab.
 *
 * Domestic product names arrive as "XpressBees 2KG" or "Delhivery Surface 10 Kg".
 * The slab is a trailing weight, when there is one; everything before it is the
 * carrier.
 *
 * A name with no trailing weight is returned whole, which is what makes
 * "Shadowfax", "Gati Freight" and "Delhivery 6CFT Freight" come out right. That
 * last one matters: "6CFT" is a cubic-feet slab, not a weight, and a looser
 * rule would amputate it and print two different products under one name.
 */
export function splitServiceName(productName: string | null | undefined): {
  courierName: string;
  courierWeightTier?: string;
} {
  const name = (productName ?? "").trim();
  if (!name) return { courierName: "Courier" };

  const match = name.match(/^(.*?)\s*(\d+(?:\.\d+)?\s*(?:KGS?|GMS?|G))$/i);

  // No slab, or nothing left once the slab is removed. Either way the whole
  // string is the carrier: a label must never name a blank courier.
  if (!match || !match[1].trim()) return { courierName: name };

  return {
    courierName: match[1].trim(),
    // Normalised to "2KG", so the label reads the same whatever the vendor sent.
    courierWeightTier: match[2].replace(/\s+/g, "").toUpperCase(),
  };
}

/**
 * The dimensions line.
 *
 * A single box prints its real measurements. Several print the box count
 * instead, because showing only the first box's size understates the
 * consignment to whoever loads it, and there is no room to list them all.
 */
export function describeDimensions(packages: LabelPackage[]): string {
  const boxCount = packages.reduce(
    (sum, pkg) => sum + Math.max(1, pkg.quantity),
    0,
  );

  if (packages.length === 1 && boxCount === 1) {
    const [pkg] = packages;
    const dims = [pkg.lengthCm, pkg.widthCm, pkg.heightCm]
      .map((d) => Math.round(Number(d) || 0))
      .join(" x ");
    return `${dims} cm`;
  }

  return `${boxCount} boxes`;
}

/**
 * Category lines for the item table.
 *
 * Identical categories merge, so a five-box apparel shipment reads as one row
 * of five rather than five rows of one. Past the cap the remainder collapses
 * into a single honest line rather than being dropped, so the quantities on the
 * label still add up to the parcel that was handed over.
 */
export function describeItems(packages: LabelPackage[]): AwbLabelItem[] {
  const byCategory = new Map<string, number>();

  for (const pkg of packages) {
    const category = pkg.description?.trim() || "Item";
    byCategory.set(category, (byCategory.get(category) ?? 0) + Math.max(1, pkg.quantity));
  }

  const rows = Array.from(byCategory, ([description, qty]) => ({ description, qty }));

  // An empty consignment still needs a row: a blank table reads as a printing
  // fault, where "Item x1" reads as a parcel.
  if (rows.length === 0) return [{ description: "Item", qty: 1 }];

  if (rows.length <= MAX_ITEM_ROWS) return rows;

  const kept = rows.slice(0, MAX_ITEM_ROWS - 1);
  const restQty = rows.slice(MAX_ITEM_ROWS - 1).reduce((sum, row) => sum + row.qty, 0);
  return [...kept, { description: "Other items", qty: restQty }];
}
