/**
 * utils/shipmentNumber.encoding.ts
 *
 * Pure encoding/decoding for shipment numbers. No DB, no `server-only`, so it
 * can be unit-tested and reused from any runtime.
 *
 * Format:  {PREFIX}{YYMMDD}{SQIDS}
 * Example: ARN260130748291
 *
 * Why not the old SHP-2026-00042?
 *   That form printed the raw Postgres sequence value on every label and
 *   invoice, which leaks platform-wide volume across tenants ("they are only
 *   at 42 shipments") and makes neighbouring numbers guessable. The sequence
 *   still drives generation — we only changed how it is *encoded* for humans.
 *
 * Design constraints this format is built around:
 *   - No separators, all uppercase, so it survives being read aloud, typed
 *     into a WhatsApp chat, or dictated over a phone call.
 *   - Everything after the 3-letter prefix is a numeral. The Sqids alphabet is
 *     digits-only precisely so there is no "is that an O or a 0" ambiguity.
 *   - The date is plain YYMMDD, not encoded. It is deliberately readable:
 *     support can tell when a shipment was booked without a lookup, and it
 *     partitions the number space so the encoded tail stays short.
 *
 * What the encoding is and is NOT:
 *   Sqids is obfuscation, not encryption. It hides the sequence value from a
 *   casual reader and stops trivial enumeration; anyone with the alphabet can
 *   reverse it. Never treat a shipment number as a secret or an authorisation
 *   token — always scope lookups by tenant.
 */

import Sqids from "sqids";

// ---------------------------------------------------------------------------
// Constants — change here, not scattered across call sites
// ---------------------------------------------------------------------------

/** Brand prefix. Arena Cargo Logistics → "ARN". */
export const PREFIX = "ARN";

/** Length of the YYMMDD date segment. */
const DATE_LENGTH = 6;

/**
 * Minimum length of the Sqids segment. Small sequence values would otherwise
 * encode to 1-2 digits and give away how new the platform is; padding to 6
 * makes an early number indistinguishable from a late one.
 *
 * Raising this later is safe (old numbers still decode, they are just shorter);
 * lowering it is also safe. Changing the ALPHABET is not — see below.
 */
const MIN_ENCODED_LENGTH = 6;

/**
 * Digits-only Sqids alphabet. Any permutation of 0-9 works; this default is a
 * fixed shuffle so that behaviour is deterministic without any env config.
 *
 * WARNING: this value is effectively permanent once numbers are issued.
 * Changing it re-maps every sequence value, so `decodeShipmentNumber` will
 * return wrong (or null) results for numbers minted under the old alphabet.
 * Rotate only if you are prepared to stop decoding historical numbers.
 */
const DEFAULT_ALPHABET = "8394170625";

/**
 * Booking dates are stamped in IST, not the server's local zone. Arena books
 * out of India, so a 01:30 IST booking must read as that calendar day and not
 * slip to the previous one because the server happens to run in UTC.
 */
const BOOKING_TIME_ZONE = "Asia/Kolkata";

// ---------------------------------------------------------------------------
// Sqids instance
// ---------------------------------------------------------------------------

function resolveAlphabet(): string {
  const raw = process.env.SHIPMENT_ID_ALPHABET?.trim();
  if (!raw) return DEFAULT_ALPHABET;

  // A malformed alphabet would either throw deep inside Sqids at booking time
  // or, worse, silently produce numbers that cannot be decoded. Validate it
  // here and fall back loudly rather than break shipment creation.
  const isPermutationOfDigits =
    raw.length === 10 && /^\d+$/.test(raw) && new Set(raw).size === 10;

  if (!isPermutationOfDigits) {
    console.error(
      "[shipmentNumber] SHIPMENT_ID_ALPHABET must be a permutation of the ten " +
        `digits 0-9 (got ${JSON.stringify(raw)}). Falling back to the default ` +
        "alphabet. Fix the env var — numbers minted meanwhile will not decode " +
        "under the intended alphabet.",
    );
    return DEFAULT_ALPHABET;
  }

  return raw;
}

// Built once at module load. Env is fixed for a process lifetime, and Sqids
// does a non-trivial amount of setup per instance.
const sqids = new Sqids({
  alphabet: resolveAlphabet(),
  minLength: MIN_ENCODED_LENGTH,
});

// ---------------------------------------------------------------------------
// Date segment
// ---------------------------------------------------------------------------

/** Formats a date as the YYMMDD segment, in IST. */
export function formatDateSegment(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIME_ZONE,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: "year" | "month" | "day") =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}${get("month")}${get("day")}`;
}

// ---------------------------------------------------------------------------
// encode / decode
// ---------------------------------------------------------------------------

/**
 * Builds the customer-facing shipment number from a raw sequence value.
 *
 * @param seq  the value returned by nextval() — a positive integer
 * @param date booking timestamp; defaults to now
 */
export function encodeShipmentNumber(seq: number, date: Date = new Date()): string {
  if (!Number.isInteger(seq) || seq < 0) {
    throw new RangeError(
      `[encodeShipmentNumber] Expected a non-negative integer sequence value, got ${seq}.`,
    );
  }

  return `${PREFIX}${formatDateSegment(date)}${sqids.encode([seq])}`;
}

/**
 * Reverses `encodeShipmentNumber` back to the raw sequence integer.
 *
 * Returns null — never throws — for anything that does not parse cleanly, so
 * callers can feed it untrusted input (a search box, a webhook payload).
 * Legacy SHP-2026-00042 numbers return null here; use `parseShipmentNumber`
 * if you need to handle both formats.
 */
export function decodeShipmentNumber(value: string): number | null {
  const normalised = value.trim().toUpperCase();

  if (!normalised.startsWith(PREFIX)) return null;

  const body = normalised.slice(PREFIX.length);
  // Date segment plus at least the padded Sqids segment.
  if (body.length < DATE_LENGTH + MIN_ENCODED_LENGTH) return null;
  if (!/^\d+$/.test(body)) return null;

  const encoded = body.slice(DATE_LENGTH);
  const decoded = sqids.decode(encoded);
  if (decoded.length !== 1) return null;

  const seq = decoded[0];
  if (!Number.isInteger(seq) || seq < 0) return null;

  // Sqids decodes many strings that it would never itself produce. Re-encoding
  // is the only way to tell a real ID from a lookalike, so reject anything
  // non-canonical instead of returning a plausible-but-wrong sequence value.
  if (sqids.encode([seq]) !== encoded) return null;

  return seq;
}

// ---------------------------------------------------------------------------
// parseShipmentNumber
// ---------------------------------------------------------------------------

/**
 * Structured view of a shipment number, in either format.
 *
 * `format` tells the two apart:
 *   "current" → ARN260130748291, has a real booking date
 *   "legacy"  → SHP-2026-00042, date unknown (the year was cosmetic)
 */
export interface ParsedShipmentNumber {
  format: "current" | "legacy";
  prefix: string;
  /** Raw Postgres sequence value. */
  seq: number;
  /** Booking date as YYYY-MM-DD (IST). Null for legacy numbers. */
  bookedOn: string | null;
}

const LEGACY_PATTERN = /^([A-Z]+)-(\d{4})-(\d+)$/;

/**
 * Parses either format. Returns null if the value matches neither.
 *
 * Legacy support is intentional and permanent: shipments booked before the
 * format change keep their SHP-YYYY-NNNNN numbers forever — those rows are
 * never rewritten — so both shapes coexist in the database indefinitely.
 */
export function parseShipmentNumber(value: string): ParsedShipmentNumber | null {
  const normalised = value.trim().toUpperCase();

  const seq = decodeShipmentNumber(normalised);
  if (seq !== null) {
    const body = normalised.slice(PREFIX.length);
    const yy = body.slice(0, 2);
    const mm = body.slice(2, 4);
    const dd = body.slice(4, 6);

    return {
      format: "current",
      prefix: PREFIX,
      seq,
      bookedOn: `20${yy}-${mm}-${dd}`,
    };
  }

  const legacy = normalised.match(LEGACY_PATTERN);
  if (legacy) {
    return {
      format: "legacy",
      prefix: legacy[1],
      seq: parseInt(legacy[3], 10),
      bookedOn: null,
    };
  }

  return null;
}
