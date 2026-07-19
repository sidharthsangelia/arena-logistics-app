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

/** Map a form key → its Prisma docType. */
export const KYC_KEY_TO_DOC_TYPE = Object.fromEntries(
  KYC_DOC_CONFIGS.map((c) => [c.key, c.docType]),
) as Record<KycDocKey, KycDocType>;

/** Map a Prisma docType → its form key (for reading rows back). */
export const KYC_DOC_TYPE_TO_KEY = Object.fromEntries(
  KYC_DOC_CONFIGS.map((c) => [c.docType, c.key]),
) as Record<string, KycDocKey>;

/** The form keys required for a given shipment type. */
export function requiredKycKeys(type: ShipmentTypeValue): KycDocKey[] {
  return KYC_DOC_CONFIGS.filter((c) => c.requiredFor.includes(type)).map((c) => c.key);
}

/** The Prisma docTypes required for a given shipment type (server-side check). */
export function requiredKycDocTypes(type: ShipmentTypeValue): KycDocType[] {
  return KYC_DOC_CONFIGS.filter((c) => c.requiredFor.includes(type)).map((c) => c.docType);
}
