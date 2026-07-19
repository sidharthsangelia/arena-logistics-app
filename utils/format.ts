// Reusable formatters. Kept dependency-free and framework-agnostic so they
// can be reused across pages/components (tables, PDFs, emails, etc).

type Numberish = number | string | null | undefined | { toNumber(): number };

/** Handles plain numbers, numeric strings, and Prisma.Decimal alike. */
function toNumber(value: Numberish): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value === "object" && "toNumber" in value) {
    const n = value.toNumber();
    return Number.isNaN(n) ? null : n;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export interface FormatDateOptions extends Intl.DateTimeFormatOptions {
  locale?: string;
  fallback?: string;
}

export function formatDate(
  date: Date | string | null | undefined,
  { locale = "en-IN", fallback = "—", ...options }: FormatDateOptions = {}
) {
  if (!date) return fallback;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    // Pinned so SSR (UTC) and browser (IST) render the same day; overridable.
    timeZone: "Asia/Kolkata",
    ...options,
  });
}

export function formatTime(
  date: Date | string | null | undefined,
  { locale = "en-IN", fallback = "—", ...options }: FormatDateOptions = {}
) {
  if (!date) return fallback;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    // Pinned so SSR (UTC) and browser (IST) render the same time; overridable.
    timeZone: "Asia/Kolkata",
    ...options,
  });
}

/** `formatDate` + `formatTime` combined, e.g. for a single-line timestamp. */
export function formatDateTime(
  date: Date | string | null | undefined,
  options: FormatDateOptions = {}
) {
  if (!date) return options.fallback ?? "—";
  return `${formatDate(date, options)}, ${formatTime(date, options)}`;
}

export interface FormatMoneyOptions {
  locale?: string;
  fallback?: string;
  maximumFractionDigits?: number;
}

export function formatMoney(
  amount: Numberish,
  currency = "INR",
  { locale = "en-IN", fallback = "—", maximumFractionDigits = 0 }: FormatMoneyOptions = {}
) {
  const n = toNumber(amount);
  if (n === null) return fallback;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits,
  }).format(n);
}

export interface FormatWeightOptions {
  unit?: string;
  fractionDigits?: number;
  fallback?: string;
}

export function formatWeight(
  kg: Numberish,
  { unit = "kg", fractionDigits = 2, fallback = "—" }: FormatWeightOptions = {}
) {
  const n = toNumber(kg);
  if (n === null) return fallback;
  return `${n.toFixed(fractionDigits)} ${unit}`;
}