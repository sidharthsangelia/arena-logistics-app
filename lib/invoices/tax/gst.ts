/**
 * lib/invoices/gst.ts
 *
 * The GST facts a tax invoice cannot be built without: state codes, GSTIN
 * parsing, and the place-of-supply decision that picks IGST over a CGST/SGST
 * split.
 *
 * PURE MODULE. No "server-only", no prisma, no env. The settings form validates
 * a GSTIN in the browser with the same function the invoice generator trusts on
 * the server, so a number that saves is a number that prints.
 *
 * Scope note: this file knows the mechanics of GST identity, not tax policy.
 * What rate applies to a given shipment lives in ./config.ts, where it can be
 * changed without touching anything here.
 */

// ---------------------------------------------------------------------------
// State codes
// ---------------------------------------------------------------------------
//
// The first two digits of every GSTIN. They decide place of supply, and place
// of supply decides whether an invoice carries IGST or CGST + SGST, so getting
// one wrong is not cosmetic: it produces a tax invoice the customer's accountant
// cannot use.
//
// `active: false` marks codes that still appear on historical registrations but
// are no longer issued (Daman and Diu merged into 26; 28 was Andhra Pradesh
// before the Telangana bifurcation). They stay here so parsing an old GSTIN
// resolves rather than failing, but they are kept out of the settings dropdown.

export interface GstState {
  code: string;
  name: string;
  active: boolean;
}

export const GST_STATES: readonly GstState[] = [
  { code: "01", name: "Jammu and Kashmir", active: true },
  { code: "02", name: "Himachal Pradesh", active: true },
  { code: "03", name: "Punjab", active: true },
  { code: "04", name: "Chandigarh", active: true },
  { code: "05", name: "Uttarakhand", active: true },
  { code: "06", name: "Haryana", active: true },
  { code: "07", name: "Delhi", active: true },
  { code: "08", name: "Rajasthan", active: true },
  { code: "09", name: "Uttar Pradesh", active: true },
  { code: "10", name: "Bihar", active: true },
  { code: "11", name: "Sikkim", active: true },
  { code: "12", name: "Arunachal Pradesh", active: true },
  { code: "13", name: "Nagaland", active: true },
  { code: "14", name: "Manipur", active: true },
  { code: "15", name: "Mizoram", active: true },
  { code: "16", name: "Tripura", active: true },
  { code: "17", name: "Meghalaya", active: true },
  { code: "18", name: "Assam", active: true },
  { code: "19", name: "West Bengal", active: true },
  { code: "20", name: "Jharkhand", active: true },
  { code: "21", name: "Odisha", active: true },
  { code: "22", name: "Chhattisgarh", active: true },
  { code: "23", name: "Madhya Pradesh", active: true },
  { code: "24", name: "Gujarat", active: true },
  { code: "25", name: "Daman and Diu", active: false },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu", active: true },
  { code: "27", name: "Maharashtra", active: true },
  { code: "28", name: "Andhra Pradesh (before bifurcation)", active: false },
  { code: "29", name: "Karnataka", active: true },
  { code: "30", name: "Goa", active: true },
  { code: "31", name: "Lakshadweep", active: true },
  { code: "32", name: "Kerala", active: true },
  { code: "33", name: "Tamil Nadu", active: true },
  { code: "34", name: "Puducherry", active: true },
  { code: "35", name: "Andaman and Nicobar Islands", active: true },
  { code: "36", name: "Telangana", active: true },
  { code: "37", name: "Andhra Pradesh", active: true },
  { code: "38", name: "Ladakh", active: true },
  { code: "97", name: "Other Territory", active: true },
];

/** The subset a human should be able to pick in a form. */
export const SELECTABLE_GST_STATES: readonly GstState[] = GST_STATES.filter(
  (s) => s.active,
);

const STATE_BY_CODE = new Map(GST_STATES.map((s) => [s.code, s]));

export function gstStateName(code: string | null | undefined): string | null {
  if (!code) return null;
  return STATE_BY_CODE.get(code)?.name ?? null;
}

export function isGstStateCode(code: string | null | undefined): boolean {
  return !!code && STATE_BY_CODE.has(code);
}

// ---------------------------------------------------------------------------
// Matching a free-text state name to a code
// ---------------------------------------------------------------------------
//
// Org.state has always been free text, so the values already in the database are
// whatever people typed: "delhi", "NEW DELHI", "Tamilnadu", "Orissa". This makes
// a best effort at resolving those, and returns null rather than guessing when
// it cannot. A null here means the invoice falls back to the seller's own state
// (an intra-state supply), which is the conservative reading: it never invents a
// state the customer is not in.

const STATE_ALIASES: Record<string, string> = {
  // Common spellings, old names, and the city people type instead of the state.
  "new delhi": "07",
  ncr: "07",
  "delhi ncr": "07",
  pondicherry: "34",
  puducherry: "34",
  orissa: "21",
  odisha: "21",
  tamilnadu: "33",
  "tamil nadu": "33",
  uttaranchal: "05",
  bangalore: "29",
  bengaluru: "29",
  mumbai: "27",
  bombay: "27",
  chennai: "33",
  madras: "33",
  kolkata: "19",
  calcutta: "19",
  hyderabad: "36",
  pune: "27",
  ahmedabad: "24",
  noida: "09",
  gurgaon: "06",
  gurugram: "06",
  "j&k": "01",
  "jammu & kashmir": "01",
  "dadra and nagar haveli": "26",
  "daman and diu": "26",
  "andaman and nicobar": "35",
  "andaman & nicobar islands": "35",
};

function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Resolve a free-text state (or city) to a GST state code. Returns null when
 * there is no confident match, which callers must treat as "unknown", never as
 * a default.
 */
export function resolveStateCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = normalise(value);
  if (!key) return null;

  // Someone may have typed the code itself.
  if (STATE_BY_CODE.has(key)) return key;

  const alias = STATE_ALIASES[key];
  if (alias) return alias;

  const exact = GST_STATES.find((s) => normalise(s.name) === key);
  if (exact) return exact.code;

  // Last resort: a state name contained in a longer string, e.g. "Karnataka,
  // India". Only accepted when exactly one state matches, so "Andhra Pradesh"
  // never quietly resolves against the deprecated pre-bifurcation entry.
  const partial = GST_STATES.filter(
    (s) => s.active && key.includes(normalise(s.name)),
  );
  return partial.length === 1 ? partial[0].code : null;
}

// ---------------------------------------------------------------------------
// GSTIN
// ---------------------------------------------------------------------------
//
// 15 characters: SS PPPPPPPPPP E Z C
//   SS  state code
//   P   the holder's PAN
//   E   entity number for that PAN within the state
//   Z   literally the letter Z
//   C   checksum
//
// The checksum is validated, not just the shape. A transposed digit passes a
// regex and fails an audit, and this is a field somebody types by hand once and
// then never looks at again.

export const GSTIN_LENGTH = 15;

const GSTIN_PATTERN =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const CHECKSUM_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The GSTIN check-digit algorithm: weight each of the first 14 characters
 * alternately by 1 and 2, and for each product add its quotient and remainder
 * over 36. The check character completes the sum to a multiple of 36.
 */
function gstinChecksumChar(first14: string): string | null {
  let sum = 0;

  for (let i = 0; i < first14.length; i++) {
    const value = CHECKSUM_ALPHABET.indexOf(first14[i]);
    if (value < 0) return null;

    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }

  return CHECKSUM_ALPHABET[(36 - (sum % 36)) % 36];
}

export interface ParsedGstin {
  gstin: string;
  stateCode: string;
  stateName: string;
  pan: string;
}

/**
 * Validate and parse a GSTIN. Returns null for anything that is not a real,
 * checksum-valid number in a state we recognise.
 *
 * Accepts lowercase and surrounding whitespace, because that is how it arrives
 * from a form; the parsed value is always upper-cased and trimmed.
 */
export function parseGstin(value: string | null | undefined): ParsedGstin | null {
  if (!value) return null;

  const gstin = value.trim().toUpperCase().replace(/\s+/g, "");
  if (gstin.length !== GSTIN_LENGTH) return null;
  if (!GSTIN_PATTERN.test(gstin)) return null;

  const stateCode = gstin.slice(0, 2);
  const state = STATE_BY_CODE.get(stateCode);
  if (!state) return null;

  if (gstinChecksumChar(gstin.slice(0, 14)) !== gstin[14]) return null;

  return {
    gstin,
    stateCode,
    stateName: state.name,
    pan: gstin.slice(2, 12),
  };
}

export function isValidGstin(value: string | null | undefined): boolean {
  return parseGstin(value) !== null;
}

/** "07AABCA1234A1Z5" reads much better on a document as "07 AABCA1234A 1Z5". */
export function formatGstin(value: string | null | undefined): string | null {
  const parsed = parseGstin(value);
  if (!parsed) return value ? value.trim().toUpperCase() : null;

  const g = parsed.gstin;
  return `${g.slice(0, 2)} ${g.slice(2, 12)} ${g.slice(12)}`;
}

// ---------------------------------------------------------------------------
// Place of supply
// ---------------------------------------------------------------------------

export interface PlaceOfSupply {
  code: string;
  name: string;
  /** How it was decided, kept for the invoice's own audit trail. */
  source: "gstin" | "stateCode" | "stateName" | "sellerFallback";
}

/**
 * Decide the place of supply for a buyer, in descending order of trust:
 *
 *   1. their GSTIN, which carries the registered state and cannot be a typo
 *      that survives the checksum
 *   2. an explicitly stored state code
 *   3. their free-text state, resolved if it can be
 *   4. the seller's own state
 *
 * Step 4 exists because the invoice must name a place of supply and cannot be
 * blocked on a customer never having filled in an address. Falling back to the
 * seller's state makes the supply intra-state, which splits the same tax into
 * CGST and SGST rather than charging IGST. The total the customer pays is
 * identical either way, so an unknown address can never change what is owed,
 * only which heads it sits under.
 */
export function resolvePlaceOfSupply(input: {
  gstin?: string | null;
  stateCode?: string | null;
  stateName?: string | null;
  sellerStateCode: string;
}): PlaceOfSupply {
  const parsed = parseGstin(input.gstin);
  if (parsed) {
    return { code: parsed.stateCode, name: parsed.stateName, source: "gstin" };
  }

  if (isGstStateCode(input.stateCode)) {
    const code = input.stateCode as string;
    return { code, name: gstStateName(code) as string, source: "stateCode" };
  }

  const resolved = resolveStateCode(input.stateName);
  if (resolved) {
    return {
      code: resolved,
      name: gstStateName(resolved) as string,
      source: "stateName",
    };
  }

  return {
    code: input.sellerStateCode,
    name: gstStateName(input.sellerStateCode) ?? "Unknown",
    source: "sellerFallback",
  };
}

/** Same state as the seller means CGST + SGST; anywhere else means IGST. */
export function isIntraState(
  sellerStateCode: string,
  placeOfSupplyCode: string,
): boolean {
  return sellerStateCode === placeOfSupplyCode;
}

// ---------------------------------------------------------------------------
// Financial year
// ---------------------------------------------------------------------------

/**
 * India Standard Time, as a fixed offset. IST has no daylight saving and has
 * not changed since 1947, so a constant is honest here and avoids depending on
 * the server's timezone database.
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/**
 * The calendar parts of an instant AS SEEN IN INDIA, regardless of what
 * timezone the server happens to run in.
 *
 * This matters more than it looks. Production runs in UTC, so a booking placed
 * at 01:00 IST on 1 April 2026 is stored as 19:30 UTC on 31 March. Reading the
 * year off that in server-local time files the invoice into the PREVIOUS
 * financial year, and because invoice serials are gapless within a year, that
 * is not a mistake anyone can quietly correct later.
 */
export function istParts(date: Date): {
  year: number;
  month: number; // 1-12
  day: number;
} {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * The Indian financial year a date falls in, formatted "26-27" for
 * 1 April 2026 to 31 March 2027. Invoice serials are unique within one of
 * these, and reset when it rolls over. Always evaluated in IST.
 */
export function financialYearOf(date: Date): string {
  const { year, month } = istParts(date);
  const startYear = month >= 4 ? year : year - 1;
  const short = (y: number) => String(y % 100).padStart(2, "0");
  return `${short(startYear)}-${short(startYear + 1)}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "31 July 2026", in IST. Written by hand rather than through Intl because the
 * PDF renderer runs wherever the job runs, and a document's date must not
 * depend on the locale of the machine that happened to render it.
 */
export function formatInvoiceDate(date: Date): string {
  const { year, month, day } = istParts(date);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}
