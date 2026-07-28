
export function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export type EnumLabelVariant = "raw" | "lower" | "upper";

/** Turns a `SCREAMING_SNAKE_CASE` enum value into a display label, e.g. for
 * badges and table cells. `raw` keeps the source casing, just de-underscored. */
export function formatEnumLabel(
  value: string,
  variant: EnumLabelVariant = "raw"
): string {
  const spaced = value.replace(/_/g, " ");
  if (variant === "lower") return spaced.toLowerCase();
  if (variant === "upper") return spaced.toUpperCase();
  return spaced;
}