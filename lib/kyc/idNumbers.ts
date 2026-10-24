/**
 * KYC ID NUMBERS
 * -----------------------------------------------------------------------------
 * The typed-in number that goes with an identity document: PAN, Aadhaar, GSTIN.
 *
 * Carriers want these as strings in the booking payload (Aramex refuses an
 * Indian export without the shipper's tax ID, ERR48), and a PDF cannot be put
 * in a payload. So every upload of one of these documents also asks for its
 * number, and the number is saved as a structured column on the party (Org or
 * Client) alongside the file.
 *
 * Pure and dependency-free so the upload forms can validate as the user types
 * and the server re-validates with the exact same rules.
 *
 * ── AADHAAR IS NEVER STORED IN THE CLEAR ────────────────────────────────────
 * UIDAI's rules require a stored Aadhaar number to be encrypted. This module
 * produces the masked form ("XXXX XXXX 1234"), the only one ever displayed.
 * The full number, which Aramex requires as an individual shipper's tax ID, is
 * stored only as ciphertext, by lib/kyc/aadhaarVault.ts (server-only).
 */

import { parseGstin } from "@/lib/invoices/tax/gst";

export type KycNumberKind = "pan" | "aadhaar" | "gst";

export interface KycNumberSpec {
  kind: KycNumberKind;
  label: string;
  placeholder: string;
  maxLength: number;
  /** What the user typed, cleaned up: uppercase, no spaces. */
  normalise: (value: string) => string;
  /** Null when valid, else the message to show under the field. */
  validate: (normalised: string) => string | null;
  /** The value that is persisted. Only differs from `normalise` for Aadhaar. */
  toStored: (normalised: string) => string;
}

// ---------------------------------------------------------------------------
// PAN
// ---------------------------------------------------------------------------

/** Five letters, four digits, one letter. The 4th letter is the holder type. */
const PAN_PATTERN = /^[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z]$/;

export function normalisePan(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "");
}

export function isValidPan(value: string | null | undefined): boolean {
  return !!value && PAN_PATTERN.test(normalisePan(value));
}

// ---------------------------------------------------------------------------
// Aadhaar
// ---------------------------------------------------------------------------

// Verhoeff tables. UIDAI issues every Aadhaar with a Verhoeff check digit, so
// a single mistyped or transposed digit is caught here rather than accepted.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function verhoeffValid(digits: string): boolean {
  let c = 0;
  const reversed = digits.split("").reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(reversed[i])]];
  }
  return c === 0;
}

export function normaliseAadhaar(value: string): string {
  return value.replace(/[\s-]+/g, "");
}

/** 12 digits, never starting 0 or 1, with a valid Verhoeff check digit. */
export function isValidAadhaar(value: string | null | undefined): boolean {
  if (!value) return false;
  const digits = normaliseAadhaar(value);
  return /^[2-9][0-9]{11}$/.test(digits) && verhoeffValid(digits);
}

/** "XXXX XXXX 1234". The only form of an Aadhaar number we ever persist. */
export function maskAadhaar(value: string): string {
  return `XXXX XXXX ${normaliseAadhaar(value).slice(-4)}`;
}

// ---------------------------------------------------------------------------
// The specs the upload forms and the save actions share
// ---------------------------------------------------------------------------

export const KYC_NUMBER_SPECS: Record<KycNumberKind, KycNumberSpec> = {
  pan: {
    kind: "pan",
    label: "PAN number",
    placeholder: "ABCDE1234F",
    maxLength: 10,
    normalise: normalisePan,
    validate: (v) =>
      !v ? "Enter the PAN number." : isValidPan(v) ? null : "That does not look like a valid PAN.",
    toStored: (v) => v,
  },
  aadhaar: {
    kind: "aadhaar",
    label: "Aadhaar number",
    placeholder: "1234 5678 9012",
    maxLength: 14,
    normalise: normaliseAadhaar,
    validate: (v) =>
      !v
        ? "Enter the Aadhaar number."
        : isValidAadhaar(v)
          ? null
          : "That does not look like a valid Aadhaar number.",
    toStored: maskAadhaar,
  },
  gst: {
    kind: "gst",
    label: "GSTIN",
    placeholder: "07ABCDE1234F1Z5",
    maxLength: 15,
    normalise: (v) => v.toUpperCase().replace(/\s+/g, ""),
    validate: (v) =>
      !v ? "Enter the GSTIN." : parseGstin(v) ? null : "That does not look like a valid GSTIN.",
    toStored: (v) => v,
  },
};

/**
 * Which document types carry a number, keyed by the Prisma KycDocType name.
 * Company PAN is a PAN like any other, so it is asked for too; it is kept on
 * the document row only, since the party's `panNumber` is the individual's.
 */
const NUMBER_KIND_BY_DOC_TYPE: Record<string, KycNumberKind> = {
  PAN_CARD: "pan",
  COMPANY_PAN: "pan",
  ADHAR_CARD: "aadhaar",
  GST_CERTIFICATE: "gst",
};

export function kycNumberSpecForDocType(
  docType: string | null | undefined,
): KycNumberSpec | null {
  const kind = docType ? NUMBER_KIND_BY_DOC_TYPE[docType] : undefined;
  return kind ? KYC_NUMBER_SPECS[kind] : null;
}

export type ResolvedKycNumber =
  | { ok: true; spec: KycNumberSpec; stored: string; normalised: string }
  | { ok: true; spec: null }
  | { ok: false; message: string };

/**
 * Server-side: validate the number sent with an upload of `docType`.
 * Documents that carry no number resolve to `{ ok: true, spec: null }`.
 */
export function resolveKycNumber(
  docType: string,
  raw: string | null | undefined,
): ResolvedKycNumber {
  const spec = kycNumberSpecForDocType(docType);
  if (!spec) return { ok: true, spec: null };

  const normalised = spec.normalise(raw ?? "");
  const error = spec.validate(normalised);
  if (error) return { ok: false, message: error };

  return { ok: true, spec, normalised, stored: spec.toStored(normalised) };
}

/**
 * The columns an upload writes on the party. The document row gets `stored`
 * as its docNumber separately.
 */
export function partyColumnsForKycNumber(
  docType: string,
  stored: string,
): { panNumber?: string; aadhaarMasked?: string; gstin?: string } {
  switch (docType) {
    case "PAN_CARD":
      return { panNumber: stored };
    case "ADHAR_CARD":
      return { aadhaarMasked: stored };
    case "GST_CERTIFICATE":
      return { gstin: stored };
    default:
      return {};
  }
}

/**
 * Whether `value` is a legal STORED number for `docType`: a valid PAN or GSTIN,
 * or an already-masked Aadhaar. For saves that receive the value after the
 * upload middleware has resolved it, and must not trust it blindly.
 */
export function isStoredKycNumber(docType: string, value: string): boolean {
  const spec = kycNumberSpecForDocType(docType);
  if (!spec) return false;
  if (spec.kind === "aadhaar") return /^XXXX XXXX [0-9]{4}$/.test(value);
  return spec.validate(value) === null;
}
