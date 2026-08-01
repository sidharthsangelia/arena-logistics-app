/**
 * INDIAN MOBILE NUMBERS
 * -----------------------------------------------------------------------------
 * Couriers want ten bare digits. People type "+91 98765 43210", "098765 43210",
 * "98765-43210", and occasionally nine digits because one got lost.
 *
 * This module exists because the last case reached a courier. A nine-digit
 * consignee number was accepted at booking, stored, sent to Shipmozo, and
 * refused there with the message "Error" — five times, one per retry, hours
 * after the customer had paid. Length alone is not a phone number.
 *
 * No `server-only`: the booking form validates with the same rule that the
 * booking job enforces, which is the point. One definition, both sides.
 */

/** Mobile prefixes in use in India. Landlines are not accepted: couriers SMS. */
const MOBILE_FIRST_DIGIT = /^[6-9]/;

/**
 * Ten bare digits, or null when this is not a usable Indian mobile.
 *
 * Accepts and strips the common decorations: +91, 91, a leading 0, spaces,
 * dashes, brackets, dots. Rejects anything that is not left with exactly ten
 * digits starting 6 to 9.
 */
export function normalizeIndianMobile(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;

  let digits = raw.replace(/\D+/g, "");

  // Leading zeros are always decoration: the STD zero, or the 00 of an IDD
  // prefix. An Indian mobile never starts with one, so stripping them all is
  // safe and covers "0", "00" and "0091" without counting digits.
  digits = digits.replace(/^0+/, "");

  // Country code, with or without the plus that got stripped above.
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);

  if (digits.length !== 10) return null;
  if (!MOBILE_FIRST_DIGIT.test(digits)) return null;

  return digits;
}

/** True when this reads as a usable Indian mobile. */
export function isIndianMobile(raw: string | null | undefined): boolean {
  return normalizeIndianMobile(raw) !== null;
}
