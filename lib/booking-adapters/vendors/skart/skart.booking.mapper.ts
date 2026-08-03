/**
 * SKART BOOKING MAPPER
 * -----------------------------------------------------------------------------
 * Canonical international booking request → sKart's /booking-api payload. Pure
 * functions, no fetch, no `server-only`, so what we declare to a carrier is unit
 * testable (utils/intlBooking.test.ts) rather than discovered from a rejected
 * consignment.
 *
 * The conversions that carry the risk:
 *
 *   • Weight stays in KILOGRAMS. `unit.weight_unit: "kgs"` says so, unlike
 *     Shipmozo which wants grams. The two mappers sit one folder apart and
 *     disagree on this deliberately; each states its own unit.
 *   • Dimensions stay in CENTIMETRES, per box, in `shipment_dimensions`. sKart
 *     takes a real per-box array, so unlike Shipmozo NOTHING is collapsed here.
 *     A multi-piece consignment is declared as the boxes it actually is.
 *   • sKart calls width `breadth`.
 *   • Money passes through untouched, in the currency `unit.currency` names.
 *
 * PICKUP IS NEVER REQUESTED. Arena delivers to sKart rather than asking them to
 * collect: the parcel reaches the hub either by the customer's own arrangement
 * or by Arena's first-mile courier, and only then is it handed over. The flag
 * for that is `pickup_required: 2` ("No") — NOT 0, which is outside the allowed
 * set and used to get the entire request refused before sKart looked at anything
 * else. With no pickup requested, none of the pickup_* details apply: the PDF
 * requires each of them only when `pickup_location: 2`, so they are omitted
 * rather than sent blank.
 *
 * ── FIELDS SKART CALLS MANDATORY AND WE MAY NOT HAVE ────────────────────────
 * A dozen fields are documented "mandatory and must not be empty" that Arena's
 * data model allows to be absent: a consignee's company, a second address line,
 * an email. Sending "" for those is the same as omitting them as far as their
 * validator is concerned. Each therefore falls back to something true rather
 * than something blank — the contact's own name for a missing company, the city
 * for a missing second line. Nothing is invented that a customs officer would
 * read as a fact.
 */

import type { CanonicalIntlBookingRequest } from "../../core/intl.types";
import type {
  SkartBookingRequest,
  SkartCommodityLine,
  SkartShipmentDimension,
  SkartShipperInvoiceLine,
} from "./skart.booking.types";
import {
  SKART_BOOKING_TYPE,
  SKART_CARGO_TYPE,
  SKART_CLEARANCE_TYPE,
  SKART_CURRENCY_INR,
  SKART_EXPORT_TYPE,
  SKART_INCO_TERM,
  SKART_PICKUP_REQUIRED,
  SKART_SHIPMENT_TYPE,
  SKART_TAX_PAID,
  type SkartChannel,
} from "./skart.booking.strategies";

/** Arena's customs category → sKart's `shipment_type`. */
export function toSkartShipmentType(
  shipmentType: CanonicalIntlBookingRequest["customs"]["shipmentType"],
): number {
  return shipmentType === "COMMERCIAL"
    ? SKART_SHIPMENT_TYPE.COMMERCIAL
    : SKART_SHIPMENT_TYPE.CSB4;
}

/**
 * Arena's export declaration → sKart's `export_type`.
 *
 * Previously hardcoded to "under LUT" on every consignment, which declares a
 * scheme most exporters have not registered for. It now follows what the
 * shipment actually says, and NA is the honest default.
 */
export function toSkartExportType(
  exportType: CanonicalIntlBookingRequest["customs"]["exportType"],
): string {
  switch (exportType) {
    case "UT":
      return SKART_EXPORT_TYPE.UNDER_LUT;
    case "BOND":
      return SKART_EXPORT_TYPE.UNDER_BOND;
    default:
      return SKART_EXPORT_TYPE.NOT_APPLICABLE;
  }
}

/**
 * Arena's incoterms → sKart's `inco_term`, for commercial consignments.
 *
 * sKart's list is finer than ours: they separate DAP with and without
 * destination clearance, which we do not model. DDU maps to DAP WITH clearance,
 * the reading that matches what DDU means commercially — the receiver pays the
 * duty, but the consignment is still cleared into the country.
 */
export function toSkartIncoTerm(
  incoterms: CanonicalIntlBookingRequest["customs"]["incoterms"],
): number {
  return incoterms === "DDP"
    ? SKART_INCO_TERM.DDP
    : SKART_INCO_TERM.DAP_WITH_CLEARANCE;
}

export function buildSkartBookingPayload(
  request: CanonicalIntlBookingRequest,
  context: {
    credentials: { user_name: string; password: string };
    courierId: number;
    destinationCountryId: number;
    channel: SkartChannel;
    /** GST slab id from sKart's /gst-slabs, for the channels that need one. */
    gstDataId: string;
    gstType: string;
  },
): SkartBookingRequest {
  const { pickup, delivery, customs, exporter } = request;
  const shipmentType = toSkartShipmentType(customs.shipmentType);
  const { channel } = context;

  const payload: SkartBookingRequest = {
    ...context.credentials,

    // The consignor's own pincode, matching what the customer was quoted on.
    // Arena's hub is where the parcel is HANDED OVER, not where the priced
    // journey begins, and quoting from one origin while booking from another is
    // how a booking silently costs more than the customer was shown.
    origin_pincode: pickup.postalCode.trim(),
    destination_pincode: delivery.postalCode.trim(),
    // "must contain only letters", so anything else is stripped rather than
    // passed through to be refused.
    city: lettersOnly(delivery.city) || lettersOnly(delivery.countryName),

    booking_type: SKART_BOOKING_TYPE.EXPORT,
    destination_country_id: context.destinationCountryId,
    shipment_type: shipmentType,

    unit: {
      weight_unit: "kgs",
      length_unit: "cms",
      currency: SKART_CURRENCY_INR,
    },

    shipment_dimensions: buildShipmentDimensions(request, channel),

    courier_id: context.courierId,

    consigner_first_name: pickup.contactName.trim() || "Consignor",
    consigner_company_name:
      pickup.companyName?.trim() || pickup.contactName.trim() || "Consignor",
    consigner_mobile_number: pickup.phone.trim(),
    consigner_email_id: pickup.email?.trim() || "",
    consigner_address_1: pickup.line1.trim(),
    consigner_address_2: pickup.line2?.trim() || pickup.city.trim(),
    consigner_city: pickup.city.trim(),
    consigner_pincode: pickup.postalCode.trim(),
    consigner_state: pickup.state.trim(),
    consigner_doc_type: channel.consignerDocType,
    consigner_gst_number: exporter.gstin ?? "",
    // Both are constants in every worked example sKart publishes, with no
    // lookup endpoint to derive them from. 2 = GST not applicable to the
    // consigner, 3 = tax payment not applicable.
    consigner_gst_applicable: "2",
    consigner_tax_payment: "3",

    consignee_first_name: delivery.contactName.trim() || "Consignee",
    consignee_company_name:
      delivery.companyName?.trim() || delivery.contactName.trim() || "Consignee",
    consignee_mobile_number: delivery.phone.trim(),
    consignee_email_id: delivery.email?.trim() || "",
    consignee_address_1: delivery.line1.trim(),
    consignee_address_2: delivery.line2?.trim() || delivery.city.trim(),
    consignee_reference_no: request.displayReference,
    consignee_gst_number: "",

    booking_invoice_number: customs.invoiceNumber,
    booking_invoice_date: customs.invoiceDate,

    // See the file header. Arena hands over; sKart never collects. The
    // pickup_* details are omitted entirely, being required only when a
    // different pickup location is requested.
    pickup_required: SKART_PICKUP_REQUIRED.NO,

    // No IGST is declared on the goods: Arena bills freight, the exporter's own
    // tax position is theirs, and every quote in this system is FOB. So the
    // amount is zero and tax_paid says so. Their worked examples send `1` with
    // an amount of 123, which is the same statement for a consignment that did
    // pay tax; saying "paid" alongside an amount of zero would be two
    // contradictory claims on one shipping bill.
    tax_paid: SKART_TAX_PAID.NO,
    tax_amount: "0",
    export_type: toSkartExportType(customs.exportType),
  };

  // ── commercial consignments ──
  //
  // All three are required together whenever shipment_type is 4, and sKart's own
  // commercial examples send them as strings. CSB5 with integrator clearance is
  // what a commercial export booked through a consolidator like sKart is: they
  // file it, not the exporter and not Arena.
  if (shipmentType === SKART_SHIPMENT_TYPE.COMMERCIAL) {
    payload.cargo_type = String(SKART_CARGO_TYPE.CSB5);
    payload.clearence_type = String(SKART_CLEARANCE_TYPE.INTEGRATOR);
    payload.inco_term = String(toSkartIncoTerm(customs.incoterms));
  }

  // ── per-carrier extras, from the channel table ──

  if (channel.requiresConsigneeStateCode) {
    // Skynet wants the destination's state code and falls back to the country
    // code, which is what their own worked example sends ("AE" for Dubai).
    // Letters only, per the PDF.
    payload.consignee_state_code =
      lettersOnly(delivery.stateCode ?? "") ||
      delivery.countryCode.trim().toUpperCase();
  }

  if (channel.shipmentPurpose != null) {
    payload.shipment_purpose = channel.shipmentPurpose;
  }

  if (channel.sendsOtpField) {
    // Empty in every documented example. Sent because the DHL schema declares
    // it and sKart reads declared fields without checking they exist.
    // shipper_type 1 is "individual", which is what an OTP flow implies.
    payload.otp = "";
    payload.shipper_type = "1";
  }

  if (channel.requiresInvoiceData) {
    payload.invoiceData = {
      shipperInvoice: buildShipperInvoice(request),
      gstDataId: context.gstDataId,
      gstType: context.gstType,
    };
  }

  return payload;
}

/**
 * One entry per box line, dimensions and contents together.
 *
 * The description and HSN come from the first content line of the box, because
 * that is the level sKart itemises at. Where a box has several distinct
 * contents, the commercial invoice (`invoiceData.shipperInvoice`) carries them
 * all — this array is the customs summary, not the full manifest — except on
 * DHL, which reads a `commodity` array inside each line and therefore gets the
 * full contents of the box.
 */
function buildShipmentDimensions(
  request: CanonicalIntlBookingRequest,
  channel: SkartChannel,
): SkartShipmentDimension[] {
  const dimensions = request.parcels.map((parcel, index) => {
    const boxNumber = index + 1;
    const contents = request.items.filter(
      (line) => (line.boxNumber ?? 1) === boxNumber,
    );
    const first = contents[0];

    const line: SkartShipmentDimension = {
      item_description:
        parcel.description?.trim() || first?.name.trim() || "General Cargo",
      value: String(round2(Math.max(0, parcel.declaredValue))),
      quantity: String(Math.max(1, Math.trunc(parcel.quantity) || 1)),
      weight: String(positive(parcel.weightKg)),
      length: String(ceilPositive(parcel.lengthCm)),
      breadth: String(ceilPositive(parcel.widthCm)),
      height: String(ceilPositive(parcel.heightCm)),
      hsn_code: first?.hsCode?.trim() || "",
    };

    if (channel.requiresCommodityLines) {
      line.commodity = buildCommodityLines(contents, parcel);
    }

    return line;
  });

  if (dimensions.length > 0) return dimensions;

  // A booking with no boxes should never reach here — preflight refuses it —
  // but a payload that silently declares nothing would be worse than one box
  // declared honestly at the shipment's own weight.
  const fallback: SkartShipmentDimension = {
    item_description: "General Cargo",
    value: String(round2(Math.max(0, request.customs.declaredValue))),
    quantity: "1",
    weight: String(positive(request.totalActualWeightKg)),
    length: "1",
    breadth: "1",
    height: "1",
    hsn_code: "",
  };

  if (channel.requiresCommodityLines) {
    fallback.commodity = [
      {
        description: "General Cargo",
        invoice_value: round2(Math.max(0, request.customs.declaredValue)),
        hsn_code: "",
        quantity: 1,
        weight: positive(request.totalActualWeightKg),
      },
    ];
  }

  return [fallback];
}

/**
 * What is inside one box, as DHL itemises it.
 *
 * The box's weight is split evenly across its lines rather than guessed per
 * item: we do not hold a per-item weight, and a set of lines whose weights sum
 * to something other than the box is a discrepancy the carrier will query.
 */
function buildCommodityLines(
  contents: CanonicalIntlBookingRequest["items"],
  parcel: CanonicalIntlBookingRequest["parcels"][number],
): SkartCommodityLine[] {
  const named = contents.filter((item) => item.name.trim().length > 0);

  if (named.length === 0) {
    return [
      {
        description: parcel.description?.trim() || "General Cargo",
        invoice_value: round2(Math.max(0, parcel.declaredValue)),
        hsn_code: "",
        quantity: 1,
        weight: positive(parcel.weightKg),
      },
    ];
  }

  const share = positive(parcel.weightKg / named.length);

  return named.map((item) => ({
    description: item.name.trim(),
    invoice_value: round2(
      Math.max(0, item.unitValue) * Math.max(1, Math.trunc(item.quantity) || 1),
    ),
    hsn_code: item.hsCode?.trim() || "",
    quantity: Math.max(1, Math.trunc(item.quantity) || 1),
    weight: share,
  }));
}

/**
 * The commercial invoice, for the FedEx and UPS channels that demand one.
 *
 * Every content line, attributed to its box. sKart rejects the booking outright
 * when this is absent on those channels, so an empty manifest becomes one
 * honest generic line rather than an omitted key.
 */
function buildShipperInvoice(
  request: CanonicalIntlBookingRequest,
): SkartShipperInvoiceLine[] {
  const lines = request.items
    .filter((item) => item.name.trim().length > 0)
    .map((item) => ({
      box_no: String(item.boxNumber ?? 1),
      description: item.name.trim(),
      hsn: item.hsCode?.trim() || "",
      quantity: Math.max(1, Math.trunc(item.quantity) || 1),
      rate: round2(Math.max(0, item.unitValue)),
      uom: "dom",
    }));

  if (lines.length > 0) return lines;

  return [
    {
      box_no: "1",
      description: "General Cargo",
      hsn: "",
      quantity: 1,
      rate: round2(Math.max(0, request.customs.declaredValue)),
      uom: "dom",
    },
  ];
}

// ---------------------------------------------------------------------------

/** Letters and single spaces only, for the fields sKart validates that way. */
function lettersOnly(value: string): string {
  return value
    .replace(/[^a-zA-Z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function positive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0.5;
  return round2(value);
}

function ceilPositive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.ceil(value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
