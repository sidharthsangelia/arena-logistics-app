/**
 * lib/booking/domesticDocs.ts
 *
 * Single source of truth for the GST paperwork a DOMESTIC shipment needs. The
 * items step, the zod schema, the review screen and the server-side check in
 * createShipmentAction all read from here, so the rules cannot drift apart —
 * same arrangement as lib/booking/kyc.ts does for the export KYC matrix.
 *
 * The rules, confirmed with the business:
 *
 *   Sender      Receiver    Tax invoice   Delivery challan   E-way bill
 *   Individual  Individual  —             optional           over ₹50,000
 *   Individual  Company     —             optional           over ₹50,000
 *   Company     Individual  required      optional           over ₹50,000
 *   Company     Company     required      optional           over ₹50,000
 *
 * WHY THERE IS NO "ARE YOU A COMPANY?" QUESTION
 * ---------------------------------------------
 * The wizard already asks for a company name on both the sender and the
 * receiver, and that answer is exactly the one this matrix keys off: a party
 * that filled a company name is trading as a company, and one that left it
 * blank is an individual. Asking the same thing twice in different words would
 * let the two answers disagree, and there would be no principled way to decide
 * which one wins. So the company name IS the answer.
 *
 * NOT ENFORCED BEYOND THE UPLOAD: nothing here validates the contents of a PDF.
 * The point is that the shipment travels with the paperwork the law expects,
 * and that ops can see at a glance which document is missing.
 */

import type { ShipmentDocType } from "@/generated/prisma";
import type { BookingFormData, DomesticDocs } from "@/types/booking.types";
import { totalDeclaredValue } from "@/lib/booking/cargo";

/**
 * The value above which an e-way bill is required under the GST rules. The
 * threshold is "exceeding ₹50,000", so a consignment of exactly ₹50,000 does
 * not need one.
 */
export const EWAY_BILL_THRESHOLD = 50_000;

export type DomesticDocKey = keyof DomesticDocs;

export interface DomesticDocConfig {
  key: DomesticDocKey;
  label: string;
  /** Where the file lands on the shipment once booked. */
  docType: ShipmentDocType;
  /** One line on what it is, shown under the label. */
  hint: string;
}

// Order here is the order shown in the documents block.
export const DOMESTIC_DOC_CONFIGS: DomesticDocConfig[] = [
  {
    key: "taxInvoice",
    label: "Tax invoice",
    docType: "INVOICE",
    hint: "Your GST invoice for these goods. Required when the sender is a company.",
  },
  {
    key: "eWayBill",
    label: "E-way bill",
    docType: "E_WAY_BILL",
    hint: `Generated on the GST portal. Required once the declared value is over ₹${EWAY_BILL_THRESHOLD.toLocaleString("en-IN")}.`,
  },
  {
    key: "deliveryChallan",
    label: "Delivery challan",
    docType: "DELIVERY_CHALLAN",
    hint: "For goods moving without a sale, such as a stock transfer, a branch movement, a return or an item going for repair.",
  },
];

export const DOMESTIC_DOC_KEYS = DOMESTIC_DOC_CONFIGS.map((c) => c.key);

/** Map a form key → the ShipmentDocument type it is stored as. */
export const DOMESTIC_DOC_TYPE_BY_KEY = Object.fromEntries(
  DOMESTIC_DOC_CONFIGS.map((c) => [c.key, c.docType]),
) as Record<DomesticDocKey, ShipmentDocType>;

export const DOMESTIC_DOC_LABEL_BY_KEY = Object.fromEntries(
  DOMESTIC_DOC_CONFIGS.map((c) => [c.key, c.label]),
) as Record<DomesticDocKey, string>;

// ---------------------------------------------------------------------------
// Party kind — derived from the company name, never asked separately
// ---------------------------------------------------------------------------

/**
 * Whether a party on the booking form is trading as a company. True when they
 * gave a company name, false when they left it blank.
 */
export function isCompanyParty(party: { companyName?: string | null }): boolean {
  return !!party.companyName?.trim();
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export interface DomesticDocRequirement {
  /** Which documents must be attached before this booking can be placed. */
  required: DomesticDocKey[];
  /** Every other document, offered but never blocking. */
  optional: DomesticDocKey[];
  senderIsCompany: boolean;
  receiverIsCompany: boolean;
  declaredValue: number;
  needsEwayBill: boolean;
}

/**
 * The document requirement for a domestic booking, derived entirely from data
 * the customer has already entered: the two company-name fields and the
 * declared value of the boxes.
 *
 * Note on Company → own branch: the GST rules make the tax invoice optional for
 * a pure stock movement between a company's own locations, and the delivery
 * challan the right document instead. We cannot tell that case apart from an
 * ordinary company sale from the address alone, so the tax invoice is asked for
 * on every company-sender booking and the challan sits alongside it as an
 * optional extra. Ops can reconcile the rare branch-transfer case by hand.
 */
export function domesticDocRequirement(
  data: Pick<BookingFormData, "consignor" | "consignee" | "boxes">,
): DomesticDocRequirement {
  const senderIsCompany = isCompanyParty(data.consignor);
  const receiverIsCompany = isCompanyParty(data.consignee);
  const declaredValue = totalDeclaredValue(data.boxes ?? []);
  const needsEwayBill = declaredValue > EWAY_BILL_THRESHOLD;

  const required: DomesticDocKey[] = [];
  if (senderIsCompany) required.push("taxInvoice");
  if (needsEwayBill) required.push("eWayBill");

  return {
    required,
    optional: DOMESTIC_DOC_KEYS.filter((k) => !required.includes(k)),
    senderIsCompany,
    receiverIsCompany,
    declaredValue,
    needsEwayBill,
  };
}

/** The required documents this booking has not attached yet. */
export function missingDomesticDocs(
  data: Pick<BookingFormData, "consignor" | "consignee" | "boxes" | "domesticDocs">,
): DomesticDocKey[] {
  const { required } = domesticDocRequirement(data);
  return required.filter((key) => !data.domesticDocs?.[key]);
}

/** Human list for an error message, e.g. "Tax invoice, E-way bill". */
export function domesticDocLabels(keys: DomesticDocKey[]): string {
  return keys.map((k) => DOMESTIC_DOC_LABEL_BY_KEY[k] ?? k).join(", ");
}

export const EMPTY_DOMESTIC_DOCS: DomesticDocs = {
  taxInvoice: null,
  deliveryChallan: null,
  eWayBill: null,
};
