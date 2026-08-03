/**
 * INTERNATIONAL BOOKING ADAPTERS: CANONICAL TYPES
 * -----------------------------------------------------------------------------
 * The shapes every international vendor is translated into and out of. Sibling
 * of ./types.ts, which does the same job for domestic door → door couriers.
 *
 * WHY A SECOND SET OF TYPES RATHER THAN FIELDS ADDED TO THE DOMESTIC ONES
 * An export carries things a domestic parcel simply does not have: a destination
 * country, a customs category, an exporter's IEC and AD code, incoterms, a
 * commercial invoice number. Bolting all of that onto CanonicalBookingRequest as
 * optionals would mean every domestic mapper reads a type where two thirds of
 * the fields can never apply to it, and the compiler would stop being able to
 * tell anyone which of them a given vendor actually needs.
 *
 * Units follow the same rule as the domestic file, and for the same reason:
 * canonical is ALWAYS kilograms, centimetres and major currency units. Vendors
 * wanting grams (Shipmozo) convert inside their own mapper. A unit that changes
 * meaning halfway down a call stack is how parcels get declared a thousand times
 * too light.
 */

/** One end of the move. Unlike the domestic party, this one has a country. */
export interface IntlBookingParty {
  contactName: string;
  companyName?: string | null;
  phone: string;
  email?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  /** Vendor-specific state/province code, when the destination needs one. */
  stateCode?: string | null;
  postalCode: string;
  /** ISO 3166-1 alpha-2, e.g. "IN", "AU", "US". */
  countryCode: string;
  /** Full name, upper-cased, for vendors that match on it. e.g. "AUSTRALIA". */
  countryName: string;
}

/** A physical box. `quantity` is how many identical boxes, matching PackageItem. */
export interface IntlBookingParcel {
  quantity: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Declared value of ONE box, in the shipment's currency. */
  declaredValue: number;
  description?: string | null;
}

/** A line inside the boxes. Drives the commercial invoice and the manifest. */
export interface IntlBookingLineItem {
  name: string;
  quantity: number;
  unitValue: number;
  hsCode?: string | null;
  /** Which box this line sits in, 1-based. Some vendors itemise per box. */
  boxNumber?: number | null;
  category?: string | null;
}

/**
 * Who is legally exporting, and under what papers.
 *
 * Resolved by lib/booking/exportProfile.ts from the client, the org, or a
 * per-shipment override. Every field is optional HERE and required by SOME
 * vendors: which ones is a vendor's own business, declared in its preflight, so
 * the customer is told exactly what is missing rather than "booking failed".
 */
export interface IntlExporterProfile {
  /** Importer Exporter Code. Mandatory for any commercial export from India. */
  iecNumber?: string | null;
  /** Authorised Dealer code, tying the shipment to the exporter's bank. */
  adCode?: string | null;
  gstin?: string | null;
  /** Letter of Undertaking — exporting zero-rated without paying IGST. */
  lutNumber?: string | null;
  /** yyyy-mm-dd. */
  lutIssueDate?: string | null;
  /** yyyy-mm-dd. */
  lutTillDate?: string | null;
  /** IOSS registration, for consignments into the EU below the VAT threshold. */
  iossNumber?: string | null;
}

/**
 * The customs shape of the consignment.
 *
 * `invoiceNumber` and `invoiceDate` are the CUSTOMER's commercial invoice, not
 * Arena's tax invoice. Passed in rather than derived so a retry declares the
 * same document number as the first attempt — a second attempt that invents a
 * new invoice number is a customs discrepancy waiting to be found at the border.
 */
export interface IntlBookingCustoms {
  /** CSB4 / CSB5 / COMMERCIAL, from the shipment. */
  shipmentType: "CSB4" | "CSB5" | "COMMERCIAL";
  /** Who pays the duty. DDP = we do, DDU/DAP = the receiver does. */
  incoterms: "DDP" | "DDU";
  /** Whether the export moves under a Bond or an LUT. NA when neither applies. */
  exportType: "BOND" | "UT" | "NA";
  /** FOB or CIF, i.e. whether freight and insurance sit inside the invoice value. */
  termsOfInvoice: "FOB" | "CIF";
  invoiceNumber: string;
  /** yyyy-mm-dd. */
  invoiceDate: string;
  /** ISO 4217 of the declared values, e.g. "INR", "USD". */
  currency: string;
  /** Sum of the line items, in `currency`. */
  declaredValue: number;
  /** Freight declared to customs, when it is stated separately from the goods. */
  freightAmount?: number | null;
  insuranceAmount?: number | null;
  /** True when the goods are being sold through a marketplace or webstore. */
  ecommerce: boolean;
}

export interface CanonicalIntlBookingRequest {
  /**
   * Our own handle for this booking (the Shipment id). Sent to the vendor as
   * their order reference so their tracking webhooks come back carrying
   * something we can match without a lookup table.
   */
  reference: string;
  /** The customer-facing number, e.g. "ARN260130748291". For labels and manifests. */
  displayReference: string;
  /** yyyy-mm-dd. Passed in rather than derived so a retry sends the same date. */
  orderDate: string;

  /** Where the goods are collected from. The consignor's door, as quoted. */
  pickup: IntlBookingParty;
  /** The overseas receiver. */
  delivery: IntlBookingParty;

  parcels: IntlBookingParcel[];
  /** Sum of the parcels' actual weight. Carried explicitly because it is what
   *  the customer was quoted on, and re-deriving it invites drift. */
  totalActualWeightKg: number;
  items: IntlBookingLineItem[];

  customs: IntlBookingCustoms;
  exporter: IntlExporterProfile;

  /** What the customer paid Arena for freight, for the vendor's own records. */
  freightCharge?: number | null;

  /**
   * The exact service the customer chose and paid for. `serviceId` is the
   * vendor's own id for it, snapshotted at selection. When it is absent the
   * adapter must resolve it or refuse — a different carrier at the same price
   * is still not what was bought.
   */
  service: {
    vendorId: string;
    serviceId?: string | null;
    productName?: string | null;
  };

  /**
   * Whether Arena's own first-mile courier is bringing this parcel to the hub.
   *
   * Recorded so a mapper can say so to the vendor, NOT so a vendor pickup gets
   * requested. Arena always delivers to the vendor: every mapper sends the
   * vendor's "do you need to collect this?" flag as false. See the note in
   * lib/inngest/functions/bookInternationalCarrier.ts.
   */
  arenaHandlesFirstMile: boolean;
}

// --- RESULTS -----------------------------------------------------------------

/**
 * What a vendor returns from `createBooking`.
 *
 * `awbNumber` present means the vendor books in ONE call (sKart) and there is
 * nothing left to assign. Absent means it books in two (Shipmozo: push the
 * order, then assign a courier to it). The orchestrator reads this field to
 * decide whether the assign step runs at all, which is what lets one durable
 * function drive two genuinely different vendor shapes without branching on a
 * vendor name.
 */
export interface CreatedIntlBooking {
  vendorOrderId: string;
  awbNumber?: string | null;
  /** The carrier that will actually fly it, e.g. "DHL Express". */
  carrierName?: string | null;
  trackingUrl?: string | null;
  /** The vendor's own pickup/collection handle, when it returns one. */
  vendorPickupId?: string | null;
  /**
   * Documents the vendor handed back with the booking. Single-call vendors
   * return their label and paperwork here; two-call vendors leave it empty and
   * the orchestrator fetches them separately.
   */
  documents?: IntlVendorDocumentRef[];
}

/** A document the vendor has, addressed by URL. Fetched in `fetchDocuments`. */
export interface IntlVendorDocumentRef {
  kind: IntlVendorDocumentKind;
  url: string;
}

/**
 * What a document IS, which is what decides who may see it.
 *
 * Only LABEL is ever shown to the customer. The commercial invoice, the
 * proforma and the merged pack are vendor-branded and stay internal: the
 * invoice the customer sees is Arena's own, generated by
 * lib/inngest/functions/generateShipmentInvoice.ts. See carrierBranding.md.
 */
export type IntlVendorDocumentKind =
  | "LABEL"
  | "COMMERCIAL_INVOICE"
  | "PROFORMA"
  | "MERGED";

/** A document as bytes. Vendors that answer with a URL fetch it themselves. */
export interface IntlVendorDocument {
  kind: IntlVendorDocumentKind;
  bytes: Uint8Array;
  mimeType: string;
  /** Suggested file name, without a path. */
  fileName: string;
}

export interface AssignedIntlCarrier {
  awbNumber: string;
  carrierName: string | null;
  trackingUrl?: string | null;
}

/**
 * What an adapter can tell us about a booking it may or may not already hold.
 * Used to recover from the one failure a plain retry makes worse: a create call
 * that succeeded at the vendor and whose response we never saw.
 */
export interface ExistingIntlBooking {
  vendorOrderId: string;
  awbNumber?: string | null;
  carrierName?: string | null;
}
