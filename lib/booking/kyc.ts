/**
 * lib/booking/kyc.ts
 *
 * Single source of truth for which KYC documents a shipment needs, keyed by
 * shipment type. The packages step, KYC step, kyc schema, the server-side
 * assertKycComplete check and the doc-vault fetch/save all read from here so
 * the requirement rules can never drift apart.
 *
 * Doc matrix (confirmed with the business):
 *   CSB4       → PAN (individual) + Aadhaar
 *   CSB5       → PAN + Aadhaar + GST + IEC
 *   COMMERCIAL → Company PAN + Founder PAN + Founder Aadhaar + GST + IEC + LUT
 *
 * Packing list is auto-generated from the box items and is NEVER a required
 * upload here (the customer may optionally attach their own at the invoice
 * step), so it isn't part of this KYC matrix.
 */

import { KycDocType } from "@/generated/prisma";
import type { ShipmentTypeValue } from "@/types/booking.types";

export type KycDocKey =
  | "companyPan"
  | "pan"
  | "aadhaar"
  | "gst"
  | "iec"
  | "lut";

export interface KycDocConfig {
  key: KycDocKey;
  label: string;
  docType: KycDocType;
  hint: string;
  /** Shipment types for which this document is mandatory. */
  requiredFor: ShipmentTypeValue[];
}

// Order here is the order shown in the KYC step.
export const KYC_DOC_CONFIGS: KycDocConfig[] = [
  {
    key: "companyPan",
    label: "Company PAN",
    docType: KycDocType.COMPANY_PAN,
    hint: "PAN card of the exporting company.",
    requiredFor: ["COMMERCIAL"],
  },
  {
    key: "pan",
    label: "PAN Card",
    docType: KycDocType.PAN_CARD,
    hint: "PAN of the individual / founder / proprietor.",
    requiredFor: ["CSB4", "CSB5", "COMMERCIAL"],
  },
  {
    key: "aadhaar",
    label: "Aadhaar Card",
    docType: KycDocType.ADHAR_CARD,
    hint: "Aadhaar of the individual / founder.",
    requiredFor: ["CSB4", "CSB5", "COMMERCIAL"],
  },
  {
    key: "gst",
    label: "GST Certificate",
    docType: KycDocType.GST_CERTIFICATE,
    hint: "GST registration certificate.",
    requiredFor: ["CSB5", "COMMERCIAL"],
  },
  {
    key: "iec",
    label: "IEC Certificate",
    docType: KycDocType.IEC_CODE,
    hint: "Import Export Code — required for CSB-V and commercial exports.",
    requiredFor: ["CSB5", "COMMERCIAL"],
  },
  {
    key: "lut",
    label: "LUT",
    docType: KycDocType.LUT,
    hint: "Letter of Undertaking — required for commercial exports.",
    requiredFor: ["COMMERCIAL"],
  },
];

export const KYC_DOC_KEYS = KYC_DOC_CONFIGS.map((c) => c.key);

// ── Document groupings for the profile / vault UI ──────────────────────────
// Baseline = the two everyone needs (CSB-4 and up); shown up-front, never
// scary. Export = the commercial / CSB-V extras, tucked into a collapsible
// section so a first-time individual shipper isn't confronted with GST/IEC/LUT.
export const BASELINE_KYC_KEYS = ["pan", "aadhaar"] as const;
export const EXPORT_KYC_KEYS = ["companyPan", "gst", "iec", "lut"] as const;

export const BASELINE_KYC_CONFIGS = KYC_DOC_CONFIGS.filter((c) =>
  (BASELINE_KYC_KEYS as readonly string[]).includes(c.key),
);
export const EXPORT_KYC_CONFIGS = KYC_DOC_CONFIGS.filter((c) =>
  (EXPORT_KYC_KEYS as readonly string[]).includes(c.key),
);

/** Human label for the shipment types a doc is required for, e.g. "CSB-V, Commercial". */
export function requiredForLabel(config: KycDocConfig): string {
  const NICE: Record<string, string> = {
    CSB4: "CSB-4",
    CSB5: "CSB-V",
    COMMERCIAL: "Commercial",
  };
  return config.requiredFor.map((t) => NICE[t] ?? t).join(", ");
}

/** Map a form key → its Prisma docType. */
export const KYC_KEY_TO_DOC_TYPE = Object.fromEntries(
  KYC_DOC_CONFIGS.map((c) => [c.key, c.docType]),
) as Record<KycDocKey, KycDocType>;

/** Map a Prisma docType → its form key (for reading rows back). */
export const KYC_DOC_TYPE_TO_KEY = Object.fromEntries(
  KYC_DOC_CONFIGS.map((c) => [c.docType, c.key]),
) as Record<string, KycDocKey>;

// ── KYC waivers ────────────────────────────────────────────────────────────
// An Arena admin can waive KYC for a party after an offline conversation (see
// the KycWaiver model). A waiver collapses the matrix to Aadhaar and nothing
// else, for every shipment type: PAN, Company PAN, GST, IEC and LUT all become
// optional. Aadhaar itself is never waivable — it is the one document that
// identifies who is actually shipping, so there is no version of this feature
// that lets a shipment move without it.
//
// Waived docs stay visible in the KYC step as optional uploads. Ops routinely
// collects them later, and hiding them would make that harder, not safer.
export const WAIVED_REQUIRED_KYC_KEYS: readonly KycDocKey[] = ["aadhaar"];

const WAIVED_REQUIRED_CONFIGS = KYC_DOC_CONFIGS.filter((c) =>
  WAIVED_REQUIRED_KYC_KEYS.includes(c.key),
);

/**
 * The form keys required for a given shipment type.
 *
 * `waived` must come from a server-side read of the party's live waiver. The
 * client passes it only to decide what the form asks for; the booking submit
 * re-reads the waiver from the database and never trusts this argument.
 */
export function requiredKycKeys(
  type: ShipmentTypeValue,
  waived = false,
): KycDocKey[] {
  if (waived) return WAIVED_REQUIRED_CONFIGS.map((c) => c.key);
  return KYC_DOC_CONFIGS.filter((c) => c.requiredFor.includes(type)).map((c) => c.key);
}

/** The Prisma docTypes required for a given shipment type (server-side check). */
export function requiredKycDocTypes(
  type: ShipmentTypeValue,
  waived = false,
): KycDocType[] {
  if (waived) return WAIVED_REQUIRED_CONFIGS.map((c) => c.docType);
  return KYC_DOC_CONFIGS.filter((c) => c.requiredFor.includes(type)).map((c) => c.docType);
}

// ── Domestic KYC ───────────────────────────────────────────────────────────
//
// A domestic shipment clears no customs, so the export matrix above does not
// apply to it at all: no PAN, no GST, no IEC, no LUT. What a domestic move
// needs is GST paperwork about the GOODS (see lib/booking/domesticDocs.ts),
// which is per-shipment, not per-party.
//
// The one party-level document kept is Aadhaar, and only when the sender is an
// individual. A company sender is already identified by the tax invoice it has
// to attach and by the GSTIN on it; an individual sender attaches nothing that
// names them, so without this there would be no record of who handed the parcel
// over. It is asked for once and reused from the vault forever after.
export const DOMESTIC_INDIVIDUAL_KYC_KEYS: readonly KycDocKey[] = ["aadhaar"];

/**
 * The form keys a domestic booking requires.
 *
 * `senderIsCompany` comes from whether the sender filled a company name — the
 * same signal domesticDocRequirement uses, so the two can never disagree about
 * who is a company. Returns an empty list for a company sender, which is what
 * makes the wizard drop the KYC step entirely for them.
 */
export function requiredDomesticKycKeys(senderIsCompany: boolean): KycDocKey[] {
  return senderIsCompany ? [] : [...DOMESTIC_INDIVIDUAL_KYC_KEYS];
}

/** The Prisma docTypes a domestic booking requires (server-side check). */
export function requiredDomesticKycDocTypes(
  senderIsCompany: boolean,
): KycDocType[] {
  return requiredDomesticKycKeys(senderIsCompany).map(
    (key) => KYC_KEY_TO_DOC_TYPE[key],
  );
}
