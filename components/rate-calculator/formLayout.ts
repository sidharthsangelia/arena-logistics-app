/**
 * components/rate-calculator/formLayout.ts
 *
 * Layout classes and fixed copy shared by RateCalculatorForm and its route
 * loading state (RateCalculatorLoading). The loading state is a static replica
 * of the form, so both read the grid, sizes and labels from here: change the
 * form's layout in this file and the skeleton moves with it, with no layout
 * shift when the real form mounts.
 *
 * Plain module on purpose. A "use client" file cannot export values to a server
 * component, and the loading state is one.
 */

import type { RateScope } from "@/lib/types";

/** Narrow route card beside the wide boxes card. */
export const FORM_TOP_GRID = "grid grid-cols-1 items-start gap-5 lg:grid-cols-[24rem_1fr]";

/** Pincode beside city, inside the route card. */
export const ROUTE_FIELD_GRID = "grid grid-cols-[0.5fr_1fr] gap-3";

/** One row per box size: qty, weight, L, B, H, remove. */
export const BOX_GRID =
  "grid grid-cols-3 gap-2 sm:grid-cols-[3rem_5.5rem_1fr_1fr_1fr_1.75rem] sm:items-center";

/** Box row inputs. Taller than the default input so the numbers read easily. */
export const BOX_INPUT_HEIGHT = "h-9";

export const SECTION_LABEL_TEXT =
  "text-xs font-semibold uppercase tracking-widest text-muted-foreground";

export const BOX_COLUMN_HEADER =
  "hidden px-1 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid";

export const BOX_COLUMNS = [
  { label: "Qty", tip: "How many identical boxes of this size and weight." },
  { label: "Weight", tip: "Weight of one box, in kilograms." },
  { label: "L", tip: "Length of one box." },
  { label: "B", tip: "Breadth (width) of one box." },
  { label: "H", tip: "Height of one box." },
] as const;

export const BOXES_TIP =
  "Group identical boxes on one row. Add a row for each different size or weight.";

export const INVOICE_VALUE_TIP =
  "The value on the invoice for the goods inside, not the shipping. Carriers price their risk cover on it, and some will not carry high-value consignments at all, so it changes both the price and which couriers you are offered.";

export const CARRIERS_TIP =
  "We ask each selected carrier for a live rate. Leave all on to compare the most options.";

export const CHARGED_WEIGHT_TIP =
  "Carriers bill the higher of a box's real weight or its size based (volumetric) weight. We work this out for each box, then add them up.";

export const CHARGED_WEIGHT_EMPTY = "Add box weight and size to see this.";

export function originTip(scope: RateScope): string {
  return scope === "domestic"
    ? "Domestic shipments are picked up within India."
    : "This tool quotes shipments leaving India.";
}

export const DOMESTIC_DESTINATION_TIP = "Domestic shipments are delivered within India.";

export function destinationPincodeLabel(scope: RateScope): string {
  return scope === "domestic" ? "Pincode" : "Postal code";
}

/** Carrier picker trigger text when every carrier is selected (the default). */
export function allCarriersLabel(total: number): string {
  return `All carriers (${total})`;
}
