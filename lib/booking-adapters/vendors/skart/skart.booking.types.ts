/**
 * SKART BOOKING TYPES
 * -----------------------------------------------------------------------------
 * Exact shapes of sKart's /booking-api request and response. Scoped entirely to
 * this folder — nothing outside imports them.
 *
 * A NOTE ON THE MAGIC NUMBERS
 * sKart encodes most of its enumerations as bare integers or numeric strings
 * with no accompanying lookup endpoint. Every one of them is named in
 * skart.booking.strategies.ts rather than being inlined at a call site, so a
 * reader never has to work out what `export_type: "3"` means from context. The
 * values themselves come from the worked examples in vendor-api-docs/skart.json.
 */

// --- REQUEST -----------------------------------------------------------------

/** One line of a DHL dimension's `commodity` array. DHL channels only. */
export interface SkartCommodityLine {
  description: string;
  invoice_value: number;
  hsn_code: string;
  quantity: number;
  /** Kilograms. */
  weight: number;
}

/** One box line. sKart itemises dimensions and contents in the same array. */
export interface SkartShipmentDimension {
  item_description: string;
  /** Declared value of this line, as a string. */
  value: string;
  quantity: string;
  /** Kilograms, as a string. `unit.weight_unit` says so. */
  weight: string;
  length: string;
  /** sKart's name for width. */
  breadth: string;
  height: string;
  hsn_code: string;
  /** Required by DHL vendors, absent everywhere else. */
  commodity?: SkartCommodityLine[];
}

/** A commercial-invoice line, required by the FedEx and UPS channels. */
export interface SkartShipperInvoiceLine {
  box_no: string;
  description: string;
  hsn: string;
  quantity: number;
  /** Unit price. sKart calls it a rate. */
  rate: number;
  /** Unit of measure. Their examples send "dom". */
  uom: string;
}

export interface SkartInvoiceData {
  shipperInvoice: SkartShipperInvoiceLine[];
  /** GST slab id, from GET /gst-slabs. */
  gstDataId: string;
  gstType: string;
}

export interface SkartBookingRequest {
  user_name: string;
  password: string;

  origin_pincode: string;
  destination_pincode: string;
  /** Destination city. A top-level field, unlike every other consignee detail. */
  city: string;
  /** 1 = export. Arena does not do imports. */
  booking_type: number;
  /** sKart's own numeric country id, from GET /country. Not an ISO code. */
  destination_country_id: number;
  /** 1 = CSB4/non-commercial, 4 = commercial. See SKART_SHIPMENT_TYPE. */
  shipment_type: number;

  unit: {
    weight_unit: "kgs";
    length_unit: "cms";
    /** Numeric currency id, from GET /currency. "24" is INR. */
    currency: string;
  };

  shipment_dimensions: SkartShipmentDimension[];

  /** THE field this whole layer exists to get right: the exact service sold. */
  courier_id: number;

  // ── consigner (the exporter) ──
  consigner_first_name: string;
  consigner_company_name: string;
  consigner_mobile_number: string;
  consigner_email_id: string;
  consigner_address_1: string;
  consigner_address_2: string;
  consigner_city: string;
  consigner_pincode: string;
  consigner_state: string;
  /** KYC document type id. See SKART_DOC_TYPE. */
  consigner_doc_type: string;
  consigner_gst_number: string;
  consigner_gst_applicable: string;
  consigner_tax_payment: string;

  // ── consignee (the overseas receiver) ──
  consignee_first_name: string;
  consignee_company_name: string;
  consignee_mobile_number: string;
  consignee_email_id: string;
  consignee_address_1: string;
  consignee_address_2: string;
  /** Required by the Skynet channel only. */
  consignee_state_code?: string;
  consignee_reference_no: string;
  consignee_gst_number: string;

  booking_invoice_number: string;
  booking_invoice_date: string; // yyyy-mm-dd

  // ── pickup ──
  // Always 2 ("No") for Arena: we deliver to sKart rather than asking them to
  // collect. The allowed values are 1 and 2 — a 0 here is outside the set and
  // gets the whole request refused, which is what it used to do.
  //
  // Every pickup_* detail below is required only when pickup_location is 2
  // ("Different"), so with no pickup requested they are simply not sent.
  pickup_required: number;
  pickup_location?: number;
  pickup_name?: string;
  pickup_address_1?: string;
  pickup_address_2?: string;
  pickup_pincode?: string;
  pickup_city?: string;
  pickup_state?: string;
  pickup_ready_start_time?: string;
  pickup_ready_end_time?: string;

  /** 1 = IGST paid, 2 = not. See SKART_TAX_PAID. */
  tax_paid: number;
  tax_amount: string;
  /** 1 = under LUT, 2 = under bond, 3 = not applicable. See SKART_EXPORT_TYPE. */
  export_type: string;

  // ── commercial consignments (shipment_type 4) only ──
  // All three are required together whenever the shipment is commercial, and
  // sKart's own commercial examples send them as strings.
  cargo_type?: string;
  clearence_type?: string;
  inco_term?: string;

  // ── per-courier extras ──
  /** FedEx and UPS channels only. */
  invoiceData?: SkartInvoiceData;
  /** Skynet and DHL, with different vocabularies. See SkartChannel. */
  shipment_purpose?: number;
  /** DHL channels only; sent empty unless sKart starts demanding one. */
  otp?: string;
  shipper_type?: string;
}

// --- RESPONSE ----------------------------------------------------------------

/**
 * Confirmed against a live sandbox booking. sKart wraps a SINGLE booking in an
 * array, which is the shape most likely to be got wrong by a reader skimming
 * the vendor docs — those document the 200 as "Booking placed successfully" and
 * nothing more.
 *
 *   { "message": "...", "statusCode": 200,
 *     "data": [ { "airwaybilno": "1ZH40B480431476662",
 *                 "dispatch_url": "https://.../1ZH40B480431476662.pdf",
 *                 "proforma_url": "...", "invoice_url": "...",
 *                 "merge_url": "...", "pickup_id": "414876" } ] }
 */
export interface SkartBookingResult {
  /** The waybill. Their spelling, not a typo on our side. */
  airwaybilno?: string;
  /** The shipping label PDF. The only document the customer is shown. */
  dispatch_url?: string;
  /** Shipper's proforma invoice. Ops only. */
  proforma_url?: string;
  /** Commercial invoice. Ops only — customers get Arena's own invoice. */
  invoice_url?: string;
  /** Label and paperwork in one PDF. Ops only. */
  merge_url?: string;
  /** sKart's collection handle, returned even when no pickup was requested. */
  pickup_id?: string;
}

export interface SkartBookingResponse {
  message?: string;
  statusCode?: number;
  data?: SkartBookingResult[] | SkartBookingResult;
}

// --- COURIER CATALOGUE -------------------------------------------------------

/**
 * GET /courier — one entry per product sKart sells.
 *
 * Field names confirmed against the live endpoint. The id is `product_id`, NOT
 * `id` or `courier_id`, and reading the wrong one is why the catalogue lookup
 * silently answered nothing and every sKart booking fell through to a curated
 * table that did not have the product in it. The legacy aliases are kept as
 * optional so a response in the older shape still resolves.
 */
export interface SkartCourierEntry {
  /** The `courier_id` the booking API takes. */
  product_id?: number | string;
  product_name?: string;
  /** The carrier family, e.g. "DHL EXPRESS", "FEDEX", "SKYNET EXPRESS". */
  parent_vendor?: string;
  /** The `shipment_type` values this product is valid for, as strings. */
  service_type?: (number | string)[];
  is_active?: number | boolean;
  is_international?: number | boolean;
  is_import?: number | boolean;

  // Legacy aliases, tolerated but never emitted by the live API.
  id?: number | string;
  courier_id?: number | string;
  name?: string;
  courier_name?: string;
  shipment_type?: number | string;
}

/**
 * GET /country — one entry per destination.
 *
 * Also confirmed against the live endpoint, and also previously read under the
 * wrong names (`id`/`name`/`iso2`), which made every destination look unserved
 * and refused every sKart export at preflight.
 */
export interface SkartCountryEntry {
  country_id?: number | string;
  country_code?: string;
  country_name?: string;
  /** "Europe", "Middle East", … Drives several per-region payload rules. */
  region?: string;
  is_active?: number | boolean;

  // Legacy aliases.
  id?: number | string;
  name?: string;
  iso2?: string;
  code?: string;
}
