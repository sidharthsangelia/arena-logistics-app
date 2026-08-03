/**
 * SKART CHANNEL RULES
 * -----------------------------------------------------------------------------
 * sKart's /booking-api is one URL with several payload variants, and which
 * variant applies is decided by the CARRIER FAMILY, not by the product name:
 *
 *   FedEx, UPS   need an `invoiceData` block (commercial invoice lines, a GST
 *                slab id and a GST type). Without it the booking is refused.
 *   Skynet       needs `consignee_state_code` and its own `shipment_purpose`.
 *   DHL          carries `shipper_type` and `otp`, and itemises a `commodity`
 *                array inside each dimension line.
 *   Aramex       needs none of them (it reads consignee_gst_number when given).
 *
 * Nothing is sent that neither the PDF nor a worked example asks for. Where the
 * two disagree, the PDF wins, because it is the current document and the JSON
 * examples predate it — `commodity` on DHL is the one case that matters.
 *
 * ── WHY THIS IS KEYED ON THE FAMILY AND NOT ON THE PRODUCT ──────────────────
 * An earlier version was an allowlist of eight exact product names, and it was
 * the reason no sKart export could be booked. sKart sells ninety-odd products
 * and its rate calculator returns names like "DHL DEL DDU ( Gifts Only )" and
 * "AMX UPS DEL DDU ( Gifts Only )" — none of which were on the list, so every
 * quote the customer could actually buy was refused at preflight.
 *
 * The vendor already publishes the grouping we need: GET /courier returns a
 * `parent_vendor` on every product ("DHL EXPRESS", "FEDEX", "UPS EXPRESS",
 * "ARAMEX EXPRESS", "SKYNET EXPRESS", …). That is the authority. The name-based
 * guess below is only for the case where the catalogue could not be reached, and
 * it is deliberately conservative: an unrecognised family books as the plain
 * payload, which is what Aramex and sKart's own channels take.
 *
 * ── ON THE MAGIC NUMBERS ────────────────────────────────────────────────────
 * sKart encodes its enumerations as bare integers with no lookup endpoint. Every
 * one is named here rather than inlined at a call site, with the meaning taken
 * from vendor-api-docs/dev-sKart-booking-api-document.pdf. A reader should never
 * have to work out what `export_type: "3"` means from context.
 */

/** `shipment_type`. 1 is the non-doc/CSB4 route, 4 the commercial one. */
export const SKART_SHIPMENT_TYPE = {
  CSB4: 1,
  COMMERCIAL: 4,
} as const;

/** `booking_type`. Arena exports; imports are out of scope. */
export const SKART_BOOKING_TYPE = { EXPORT: 1 } as const;

/**
 * `consigner_doc_type` — which document identifies the exporter.
 *
 * The values are the PDF's. Every worked example sends "4" except Skynet, which
 * sends "2", and those are the two this codebase uses: a wire value proven to be
 * accepted beats a more sensible one that has never been tried.
 */
export const SKART_DOC_TYPE = {
  GSTIN: "1",
  PAN: "2",
  PASSPORT: "3",
  AADHAAR: "4",
} as const;

/**
 * `export_type`. Mapped from the shipment's own declaration rather than
 * hardcoded: an export filed under a scheme the exporter has not registered for
 * is a tax problem, and "everything is under LUT" was never true.
 */
export const SKART_EXPORT_TYPE = {
  UNDER_LUT: "1",
  UNDER_BOND: "2",
  NOT_APPLICABLE: "3",
} as const;

/** `tax_paid`. 1 = IGST was paid on the consignment, 2 = it was not. */
export const SKART_TAX_PAID = { YES: 1, NO: 2 } as const;

/**
 * `pickup_required`. Allowed values are 1 and 2 — NOT 0.
 *
 * This one cost every sKart booking: the payload sent `pickup_required: 0`,
 * which is outside the documented set, so the vendor refused the request before
 * looking at anything else.
 */
export const SKART_PICKUP_REQUIRED = { YES: 1, NO: 2 } as const;

/** `cargo_type`, required whenever shipment_type is 4 (commercial). */
export const SKART_CARGO_TYPE = { CSB5: 1, CARGO: 2 } as const;

/** `clearence_type` (their spelling), required whenever cargo_type is sent. */
export const SKART_CLEARANCE_TYPE = {
  SKART: 1,
  SELF: 2,
  INTEGRATOR: 3,
} as const;

/** `inco_term`, required whenever shipment_type is 4 (commercial). */
export const SKART_INCO_TERM = {
  DDP: 2,
  DAP_WITHOUT_CLEARANCE: 3,
  DAP_WITH_CLEARANCE: 4,
  FOB_BSO: 5,
  EX_WORKS: 6,
  FOB: 7,
  FCA: 8,
} as const;

/** `unit.currency` — 24 is INR, confirmed against GET /currency. */
export const SKART_CURRENCY_INR = "24";

/**
 * `shipment_purpose`, which means different things on different channels and is
 * therefore held per family rather than as one constant.
 *
 * Skynet's worked example sends 8. The PDF documents 1/2/3 for DHL DEL, and 2
 * (Personal, Not for Resale) is the honest reading of a CSB-IV consignment:
 * Arena books exports on behalf of senders, not resale stock.
 */
const SKYNET_SHIPMENT_PURPOSE = 8;
const DHL_SHIPMENT_PURPOSE = 2;

// ---------------------------------------------------------------------------

/** The carrier families sKart groups its products under. */
export type SkartCarrierFamily =
  | "DHL"
  | "FEDEX"
  | "UPS"
  | "ARAMEX"
  | "SKYNET"
  | "EMIRATES"
  | "SKART"
  | "OTHER";

/** What a family's payload needs beyond the common fields. */
export interface SkartChannel {
  family: SkartCarrierFamily;
  /** Display name for logs and ops messages. */
  label: string;
  /** FedEx and UPS refuse a booking without the commercial-invoice block. */
  requiresInvoiceData: boolean;
  /** DHL itemises a `commodity` array inside every dimension line. */
  requiresCommodityLines: boolean;
  /** DHL's schema carries shipper_type and an OTP field. */
  sendsOtpField: boolean;
  /** Skynet is the one family that reads consignee_state_code. */
  requiresConsigneeStateCode: boolean;
  /** Sent only by the families whose schema declares it. */
  shipmentPurpose?: number;
  /** Which document identifies the exporter on this channel. */
  consignerDocType: string;
}

/** Everything a family does NOT ask for. Rows below state only what differs. */
const PLAIN = {
  requiresInvoiceData: false,
  requiresCommodityLines: false,
  sendsOtpField: false,
  requiresConsigneeStateCode: false,
  consignerDocType: SKART_DOC_TYPE.AADHAAR,
} as const;

const CHANNELS: Record<SkartCarrierFamily, SkartChannel> = {
  DHL: {
    ...PLAIN,
    family: "DHL",
    label: "DHL",
    // The PDF marks `commodity` required for DHL vendors. Their JSON example
    // omits it, but that example predates the PDF, and an omitted required
    // field is a refused booking where an extra one is usually ignored.
    requiresCommodityLines: true,
    sendsOtpField: true,
    shipmentPurpose: DHL_SHIPMENT_PURPOSE,
  },
  FEDEX: { ...PLAIN, family: "FEDEX", label: "FedEx", requiresInvoiceData: true },
  UPS: { ...PLAIN, family: "UPS", label: "UPS", requiresInvoiceData: true },
  ARAMEX: { ...PLAIN, family: "ARAMEX", label: "Aramex" },
  SKYNET: {
    ...PLAIN,
    family: "SKYNET",
    label: "Skynet",
    requiresConsigneeStateCode: true,
    shipmentPurpose: SKYNET_SHIPMENT_PURPOSE,
    // The one channel whose example sends a different document type.
    consignerDocType: SKART_DOC_TYPE.PAN,
  },
  EMIRATES: { ...PLAIN, family: "EMIRATES", label: "Emirates" },
  SKART: { ...PLAIN, family: "SKART", label: "sKart" },
  OTHER: { ...PLAIN, family: "OTHER", label: "sKart Express" },
};

/**
 * The carrier family for a catalogue entry.
 *
 * `parentVendor` is what GET /courier reports and is the authority. The product
 * name is consulted only when the catalogue could not be read, and it is checked
 * in an order that matters: "AMX UPS DEL DDU" is a UPS product sold under
 * Aramex's parent, so UPS is tested before Aramex to keep the more specific
 * carrier from being masked by the reseller.
 */
export function resolveSkartFamily(input: {
  parentVendor?: string | null;
  productName?: string | null;
}): SkartCarrierFamily {
  const vendor = input.parentVendor?.trim().toUpperCase() ?? "";

  if (vendor) {
    if (vendor.includes("DHL")) return "DHL";
    if (vendor.includes("FEDEX") || vendor.includes("FED EX")) return "FEDEX";
    if (vendor.includes("UPS")) return "UPS";
    if (vendor.includes("ARAMEX")) return "ARAMEX";
    if (vendor.includes("SKYNET")) return "SKYNET";
    if (vendor.includes("EMIRATES")) return "EMIRATES";
    if (vendor.includes("SKART")) return "SKART";
    return "OTHER";
  }

  const name = input.productName?.trim().toUpperCase() ?? "";
  if (!name) return "OTHER";

  if (name.includes("DHL")) return "DHL";
  if (name.includes("FEDEX")) return "FEDEX";
  // Before Aramex on purpose: "AMX UPS …" is a UPS service.
  if (name.includes("UPS")) return "UPS";
  if (name.includes("ARAMEX") || name.startsWith("AMX")) return "ARAMEX";
  if (name.includes("SKYNET")) return "SKYNET";
  if (name.includes("EMIRATES")) return "EMIRATES";
  if (name.includes("SKART")) return "SKART";
  return "OTHER";
}

/** The payload rules for a family. Always answers; there is no refusal here. */
export function skartChannel(family: SkartCarrierFamily): SkartChannel {
  return CHANNELS[family];
}

/** Convenience: family and channel in one step, from whatever we know. */
export function resolveSkartChannel(input: {
  parentVendor?: string | null;
  productName?: string | null;
}): SkartChannel {
  return skartChannel(resolveSkartFamily(input));
}

// ---------------------------------------------------------------------------

/**
 * Courier ids from sKart's own worked examples, keyed on the (product,
 * shipment_type) PAIR.
 *
 * The FALLBACK ONLY. The live catalogue (GET /courier) is the primary source and
 * covers every product sKart sells; this table exists so a catalogue outage does
 * not block the handful of services with a documented id.
 *
 * The pair matters: FedEx DEL is 122 on a CSB4 export and 192 on a commercial
 * one. Anything keyed on the carrier name alone would book the wrong product.
 */
export const SKART_CURATED_COURIER_IDS: {
  productName: string;
  label: string;
  courierIds: Partial<Record<number, number>>;
}[] = [
  {
    productName: "dhl del",
    label: "DHL DEL",
    courierIds: { [SKART_SHIPMENT_TYPE.CSB4]: 121 },
  },
  {
    productName: "dhl express",
    label: "DHL Express",
    courierIds: { [SKART_SHIPMENT_TYPE.CSB4]: 157 },
  },
  {
    productName: "fedex del",
    label: "FEDEX DEL",
    courierIds: {
      [SKART_SHIPMENT_TYPE.CSB4]: 122,
      [SKART_SHIPMENT_TYPE.COMMERCIAL]: 192,
    },
  },
  {
    productName: "ups express del",
    label: "UPS Express DEL",
    courierIds: { [SKART_SHIPMENT_TYPE.CSB4]: 133 },
  },
  {
    productName: "aramex exp del",
    label: "Aramex Exp DEL",
    courierIds: {
      [SKART_SHIPMENT_TYPE.CSB4]: 124,
      [SKART_SHIPMENT_TYPE.COMMERCIAL]: 124,
    },
  },
  {
    productName: "skynet",
    label: "Skynet",
    courierIds: { [SKART_SHIPMENT_TYPE.CSB4]: 136 },
  },
  {
    productName: "skynet aus del",
    label: "Skynet AUS DEL",
    courierIds: { [SKART_SHIPMENT_TYPE.CSB4]: 158 },
  },
  {
    productName: "skart self international",
    label: "sKart SELF International",
    courierIds: { [SKART_SHIPMENT_TYPE.COMMERCIAL]: 138 },
  },
];

/** The curated id for a product on a shipment type, or null. */
export function curatedSkartCourierId(input: {
  productName: string | null | undefined;
  shipmentType: number;
}): number | null {
  const key = input.productName?.trim().toLowerCase();
  if (!key) return null;
  const row = SKART_CURATED_COURIER_IDS.find((r) => r.productName === key);
  return row?.courierIds[input.shipmentType] ?? null;
}

/** The products with a documented offline id, for diagnostics. */
export function listSkartCuratedProductNames(): string[] {
  return SKART_CURATED_COURIER_IDS.map((r) => r.label);
}
