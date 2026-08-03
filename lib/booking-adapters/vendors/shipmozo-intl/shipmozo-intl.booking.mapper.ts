/**
 * SHIPMOZO INTERNATIONAL BOOKING MAPPER
 * -----------------------------------------------------------------------------
 * Canonical international booking request → Shipmozo payloads. Pure functions,
 * no fetch, no `server-only`: everything that decides what we declare to customs
 * lives here, where it can be unit tested (utils/intlBooking.test.ts) rather
 * than discovered from a consignment held at the border.
 *
 * The conversions that carry the risk, stated once:
 *
 *   • Weight goes to Shipmozo in GRAMS. Canonical is kilograms. Rounded UP,
 *     never down: under-declaring is what gets a shipment held and surcharged.
 *   • international-push-order takes ONE length/width/height for the whole
 *     order even when `type_of_package` is MPS, so we send the largest of each
 *     dimension. It over-declares a mixed-size consignment on purpose.
 *   • Money passes through untouched. `currency` says what it is denominated
 *     in, and every value in the payload is in that same currency.
 *   • Dates are yyyy-mm-dd strings on both sides.
 *
 * EVERY DOCUMENTED KEY IS SENT, including the ones we have no value for, which
 * go as empty strings. This mirrors lib/shipmozo/pushOrderDefaults.ts and exists
 * for the same reason: Shipmozo reads fields without checking they exist, so an
 * omitted optional is not "no value", it is a refused order.
 */

import type {
  ShipmozoCreateShipperPayload,
  ShipmozoIntlPushOrderPayload,
  ShipmozoIntlRateRequest,
  ShipmozoIntlRowContent,
} from "@/lib/shipmozo/types";
import type { CanonicalIntlBookingRequest } from "../../core/intl.types";

/**
 * The exporter of record.
 *
 * Built from the PICKUP party rather than a separate exporter address, because
 * that is who the goods leave from and whose details are on the paperwork.
 * Shipmozo derives city and state from the pincode, so neither is sent.
 *
 * ── ON `status` ─────────────────────────────────────────────────────────────
 * Undocumented and mandatory. Shipmozo's published schema for /create-shipper
 * lists six fields and marks none required; the live endpoint answers a call
 * without this one with "The status field is required."
 *
 * The value is not a guess. Their address records carry status "ACTIVE", read
 * from GET /get-warehouses against this same account, so that is the vocabulary
 * their API uses for exactly this kind of record. Hardcoded rather than made
 * configurable because there is only one sensible value: a shipper being
 * registered so a consignment can be booked against it now is active by
 * definition, and an inactive one would be registered only to be unusable.
 */
export function buildShipperPayload(
  request: CanonicalIntlBookingRequest,
): ShipmozoCreateShipperPayload {
  const { pickup } = request;

  return {
    name: pickup.contactName.trim() || pickup.companyName?.trim() || "Consignor",
    phone: pickup.phone.trim(),
    email: pickup.email?.trim() || undefined,
    address_line_one: pickup.line1.trim(),
    address_line_two: pickup.line2?.trim() || undefined,
    pin_code: pickup.postalCode.trim(),
    status: "ACTIVE",
  };
}

/** The pickup point. Same shape and same rules as the domestic warehouse. */
export function buildIntlWarehousePayload(request: CanonicalIntlBookingRequest) {
  const { pickup } = request;

  return {
    address_title: `Pickup ${request.displayReference}`,
    name: pickup.contactName.trim() || pickup.companyName?.trim() || "Consignor",
    phone: pickup.phone.trim(),
    email: pickup.email?.trim() || undefined,
    address_line_one: pickup.line1.trim(),
    address_line_two: pickup.line2?.trim() || undefined,
    pin_code: pickup.postalCode.trim(),
  };
}

export function buildIntlPushOrderPayload(
  request: CanonicalIntlBookingRequest,
  context: {
    warehouseId: string;
    shipperId: string | null;
    /** Shipmozo's numeric id for the destination, resolved from GET /countries. */
    countryId: string;
  },
): ShipmozoIntlPushOrderPayload {
  const { delivery, customs, exporter } = request;
  const dims = largestDimensions(request);
  const totalBoxes = request.parcels.reduce(
    (sum, parcel) => sum + Math.max(1, Math.trunc(parcel.quantity) || 1),
    0,
  );

  return {
    // Our own id, echoed back as `refrence_id` on every tracking webhook, which
    // is what lets a webhook be matched to a shipment without a lookup table.
    order_id: request.reference,
    order_date: request.orderDate,

    consignee_name: delivery.contactName.trim() || "Consignee",
    consignee_company_name: delivery.companyName?.trim() || "",
    consignee_phone: delivery.phone.trim(),
    consignee_alternate_phone: "",
    consignee_email: delivery.email?.trim() || "",
    consignee_address_line_one: delivery.line1.trim(),
    consignee_address_line_two: delivery.line2?.trim() || "",
    consignee_country_id: context.countryId,
    consignee_pin_code: delivery.postalCode.trim(),
    consignee_city: delivery.city.trim(),
    // REQUIRED, despite being unmarked in their spec. The live endpoint answers
    // a blank one with "The consignee state field is required." — measured, not
    // inferred — and plenty of real destinations have no state: Dubai,
    // Singapore, Hong Kong, most of the Gulf. Falling back to the city is what
    // an address label would say anyway, and the country is the last resort. An
    // export to Dubai must not be refused for a field Dubai does not have.
    consignee_state:
      delivery.state.trim() ||
      delivery.city.trim() ||
      delivery.countryName.trim(),
    consignee_gst_number: "",

    row_content: buildRowContent(request),

    // SPS is a single parcel; anything more is MPS. Derived from the box count
    // rather than passed in, so it can never disagree with the boxes we declare.
    type_of_package: totalBoxes > 1 ? "MPS" : "SPS",
    shipment_purpose: toShipmentPurpose(customs.shipmentType),

    shipping_charges:
      request.freightCharge != null && request.freightCharge > 0
        ? String(round2(request.freightCharge))
        : "",

    weight: String(toGrams(request.totalActualWeightKg)),
    length: String(dims.length),
    width: String(dims.width),
    height: String(dims.height),

    warehouse_id: context.warehouseId,
    shipper_id: context.shipperId ?? "",

    gst_ewaybill_number: "",
    gstin_number: exporter.gstin ?? "",
    currency: customs.currency,

    iec_number: exporter.iecNumber ?? "",
    terms_of_invoice: customs.termsOfInvoice,
    ecomm: customs.ecommerce ? "YES" : "NO",
    ad_code: exporter.adCode ?? "",
    invoice_number: customs.invoiceNumber,
    invoice_date: customs.invoiceDate,
    // Merchandise Exports from India Scheme. Arena does not claim under it, and
    // saying YES to an incentive nobody has filed for is a customs discrepancy.
    meis: "NO",
    export_type: customs.exportType,
    ioss_number: exporter.iossNumber ?? "",
    lut_number: exporter.lutNumber ?? "",
    lut_issue_date: exporter.lutIssueDate ?? "",
    lut_till_date: exporter.lutTillDate ?? "",
    freight_amount:
      customs.freightAmount != null && customs.freightAmount > 0
        ? String(round2(customs.freightAmount))
        : "",
    incoterms: customs.incoterms,
    insurance_amount:
      customs.insuranceAmount != null && customs.insuranceAmount > 0
        ? String(round2(customs.insuranceAmount))
        : "",
  };
}

/**
 * The same consignment, as their rate calculator wants to hear it.
 *
 * ── WHY THE BOOKING PATH RE-QUOTES AT ALL ───────────────────────────────────
 * Shipmozo's documented international flow puts the rate calculator BETWEEN the
 * push and the assign, and this is the payload for that step. It is not used to
 * price anything — the customer's price was fixed at selection and must not
 * move — but to answer one question before the assign is attempted: is the
 * courier they bought still offered for the consignment as it was actually
 * pushed?
 *
 * Every field here is derived exactly as the push payload derives it, from the
 * same request, so the two describe one consignment and cannot drift. A quote
 * built from different numbers than the order would answer a question nobody
 * asked.
 */
export function buildIntlRatePayload(
  request: CanonicalIntlBookingRequest,
  context: { countryId: string },
): ShipmozoIntlRateRequest {
  const totalBoxes = request.parcels.reduce(
    (sum, parcel) => sum + Math.max(1, Math.trunc(parcel.quantity) || 1),
    0,
  );

  return {
    pickup_pincode: request.pickup.postalCode.trim(),
    delivery_pincode: request.delivery.postalCode.trim(),
    delivery_country_id: context.countryId,
    order_amount: String(round2(Math.max(0, request.customs.declaredValue))),
    type_of_package: totalBoxes > 1 ? "MPS" : "SPS",
    shipment_purpose: toShipmentPurpose(request.customs.shipmentType),
    weight: String(toGrams(request.totalActualWeightKg)),
    dimensions: request.parcels.map((parcel) => ({
      no_of_box: Math.max(1, Math.trunc(parcel.quantity) || 1),
      length: ceilPositive(parcel.lengthCm),
      width: ceilPositive(parcel.widthCm),
      height: ceilPositive(parcel.heightCm),
    })),
  };
}

/**
 * Every line the boxes contain, as the commercial invoice sees them.
 *
 * Shipmozo rejects an order with no products, and a booking whose contents were
 * left blank is still a booking the customer has paid for, so an empty list
 * becomes one generic line rather than an error. That generic line is honest
 * about being generic — "General Cargo" at the declared value — rather than
 * inventing a description.
 */
function buildRowContent(
  request: CanonicalIntlBookingRequest,
): ShipmozoIntlRowContent[] {
  const rows = request.items
    .filter((item) => item.name.trim().length > 0)
    .map((item) => ({
      name: item.name.trim(),
      quantity: Math.max(1, Math.trunc(item.quantity) || 1),
      unit_price: round2(Math.max(0, item.unitValue)),
      sku_number: "",
      discount: "",
      hsn: item.hsCode?.trim() || "",
      tax: 0,
      product_category: item.category?.trim() || "Other",
    }));

  if (rows.length > 0) return rows;

  return [
    {
      name: "General Cargo",
      quantity: 1,
      unit_price: round2(Math.max(0, request.customs.declaredValue)),
      sku_number: "",
      discount: "",
      hsn: "",
      tax: 0,
      product_category: "Other",
    },
  ];
}

/**
 * Arena's customs category → Shipmozo's `shipment_purpose`.
 *
 * CSB4 is the courier-shipping-bill route for low-value exports; Shipmozo
 * distinguishes a Documents CSB4 (DCSB4) from a Shipment one (SCSB4), and cargo
 * is always the latter. COMMERCIAL maps to CSB5, the full shipping bill, which
 * is what a commercial consignment with duty drawback claims goes out under.
 */
function toShipmentPurpose(
  shipmentType: CanonicalIntlBookingRequest["customs"]["shipmentType"],
): "DCSB4" | "SCSB4" | "CSB5" {
  switch (shipmentType) {
    case "CSB5":
    case "COMMERCIAL":
      return "CSB5";
    case "CSB4":
    default:
      return "SCSB4";
  }
}

function largestDimensions(request: CanonicalIntlBookingRequest): {
  length: number;
  width: number;
  height: number;
} {
  return request.parcels.reduce(
    (acc, parcel) => ({
      length: Math.max(acc.length, ceilPositive(parcel.lengthCm)),
      width: Math.max(acc.width, ceilPositive(parcel.widthCm)),
      height: Math.max(acc.height, ceilPositive(parcel.heightCm)),
    }),
    { length: 1, width: 1, height: 1 },
  );
}

/** Kilograms → grams, rounded up, never zero. */
export function toGrams(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 1;
  return Math.max(1, Math.ceil(weightKg * 1000));
}

function ceilPositive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.ceil(value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
