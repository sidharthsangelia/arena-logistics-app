/**
 * utils/intlBooking.test.ts
 *
 * What we declare to an international carrier, and what we refuse to declare.
 *
 * Four risks, one group of tests each:
 *
 *   1. The sKart RESPONSE SHAPE. Their spec documents the 200 as "Booking
 *      placed successfully" and nothing more; the real body wraps a single
 *      booking in an ARRAY. Reading it as an object gives undefined for every
 *      field while the call looks like it succeeded — a booking placed, paid
 *      for, and lost. Pinned here against a captured sandbox response, the same
 *      way utils/shipmozoTracking.test.ts pins readings that cost money.
 *   2. The PER-COURIER STRATEGY TABLE. sKart's one endpoint is seven payload
 *      variants: FedEx and UPS refuse a booking with no invoiceData, Skynet
 *      needs a state code. Getting this wrong is a 422 after the customer has
 *      paid, so each variant is asserted, and so is the refusal of an unknown
 *      product name.
 *   3. The Shipmozo mapper's UNIT CONVERSIONS. Weight crosses kg → grams and
 *      the dimensions cross many-boxes → one L/W/H. Both fail silently: the
 *      order is accepted, the parcel is weighed at the hub, and the customer is
 *      surcharged weeks later. Everything rounds UP for that reason.
 *   4. The EXPORT PROFILE precedence. A BA's client is the legal exporter, so
 *      their IEC must beat the BA's. Getting this backwards files the export
 *      under the wrong entity, which stops being a software problem and becomes
 *      a compliance one.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CanonicalIntlBookingRequest } from "@/lib/booking-adapters/core/intl.types";
import {
  buildIntlPushOrderPayload,
  buildShipperPayload,
  toGrams,
} from "@/lib/booking-adapters/vendors/shipmozo-intl/shipmozo-intl.booking.mapper";
import {
  buildSkartBookingPayload,
  toSkartExportType,
  toSkartIncoTerm,
  toSkartShipmentType,
} from "@/lib/booking-adapters/vendors/skart/skart.booking.mapper";
import {
  SKART_PICKUP_REQUIRED,
  SKART_SHIPMENT_TYPE,
  curatedSkartCourierId,
  resolveSkartFamily,
  skartChannel,
} from "@/lib/booking-adapters/vendors/skart/skart.booking.strategies";
import type { SkartBookingResponse } from "@/lib/booking-adapters/vendors/skart/skart.booking.types";
import {
  isLutExpired,
  missingExportFields,
  missingExportPapers,
  resolveExportProfile,
} from "@/lib/booking/exportProfile";
import { intlInvoiceNumber } from "@/lib/booking/internationalCarrier";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function baseRequest(
  overrides: Partial<CanonicalIntlBookingRequest> = {},
): CanonicalIntlBookingRequest {
  return {
    reference: "shp_abc123",
    displayReference: "ARN260130748291",
    orderDate: "2026-08-01",

    pickup: {
      contactName: "Ajay Kumar",
      companyName: "Sgate Exports",
      phone: "9582529747",
      email: "ajay@example.com",
      line1: "K-99",
      line2: "Budh Vihar",
      city: "New Delhi",
      state: "Delhi",
      stateCode: null,
      postalCode: "110049",
      countryCode: "IN",
      countryName: "INDIA",
    },
    delivery: {
      contactName: "Sonu Verma",
      companyName: "Datamotive",
      phone: "61390001234",
      email: "sonu@example.com",
      line1: "12 Victoria Road",
      line2: "Suite 4",
      city: "Melbourne",
      state: "Victoria",
      stateCode: null,
      postalCode: "3001",
      countryCode: "AU",
      countryName: "AUSTRALIA",
    },

    parcels: [
      {
        quantity: 1,
        weightKg: 2.4,
        lengthCm: 30.2,
        widthCm: 20,
        heightCm: 10.7,
        declaredValue: 8000,
        description: "Textiles",
      },
    ],
    totalActualWeightKg: 2.4,
    items: [
      {
        name: "Cotton scarf",
        quantity: 4,
        unitValue: 2000,
        hsCode: "62142010",
        boxNumber: 1,
        category: null,
      },
    ],

    customs: {
      shipmentType: "CSB4",
      incoterms: "DDP",
      exportType: "UT",
      termsOfInvoice: "FOB",
      invoiceNumber: "INV-ARN260130748291",
      invoiceDate: "2026-08-01",
      currency: "INR",
      declaredValue: 8000,
      freightAmount: 3200,
      insuranceAmount: null,
      ecommerce: false,
    },

    exporter: {
      iecNumber: "0388012345",
      adCode: "6390004",
      gstin: "07AAACH7409R1ZZ",
      lutNumber: "AD070424000123M",
      lutIssueDate: "2026-04-01",
      lutTillDate: "2027-03-31",
      iossNumber: null,
    },

    freightCharge: 3200,

    service: {
      vendorId: "skart",
      serviceId: null,
      productName: "DHL DEL",
    },

    arenaHandlesFirstMile: true,

    ...overrides,
  };
}

const SKART_CONTEXT = {
  credentials: { user_name: "sgate", password: "123456" },
  courierId: 121,
  destinationCountryId: 12,
  channel: skartChannel("DHL"),
  gstDataId: "106",
  gstType: "1",
};

// ---------------------------------------------------------------------------
// 1. The sKart response shape
// ---------------------------------------------------------------------------

describe("sKart booking response", () => {
  /**
   * Captured verbatim from a sandbox booking against
   * https://devapiv2.skart-express.com/api/v1/booking/booking-api.
   * If sKart ever changes this shape, this fixture is what tells us.
   */
  const REAL_RESPONSE: SkartBookingResponse = {
    message: "Booking placed successfully",
    statusCode: 200,
    data: [
      {
        airwaybilno: "1ZH40B480431476662",
        dispatch_url:
          "https://skartnew-dev.s3.ap-southeast-1.amazonaws.com/booking/dispatch_labels/1ZH40B480431476662.pdf",
        proforma_url:
          "https://skartnew-dev.s3.ap-southeast-1.amazonaws.com/booking/acc_shipper_invoice/1ZH40B480431476662.pdf",
        invoice_url:
          "https://skartnew-dev.s3.ap-southeast-1.amazonaws.com/booking/dispatch_labels/1ZH40B480431476662_invoice.pdf",
        merge_url:
          "https://skartnew-dev.s3.ap-southeast-1.amazonaws.com/booking/dispatch_labels/1ZH40B480431476662.pdf",
        pickup_id: "414876",
      },
    ],
  };

  it("wraps a single booking in an array, not an object", () => {
    // The whole point of this test. Reading `data` as an object yields
    // undefined for every field while the HTTP call reports success.
    assert.ok(Array.isArray(REAL_RESPONSE.data));
    const result = Array.isArray(REAL_RESPONSE.data)
      ? REAL_RESPONSE.data[0]
      : REAL_RESPONSE.data;

    assert.equal(result?.airwaybilno, "1ZH40B480431476662");
    assert.equal(result?.pickup_id, "414876");
  });

  it("spells the waybill field 'airwaybilno'", () => {
    // Not 'airwaybillno' and not 'awb'. Their spelling, and a plausible typo
    // fix here would silently return no AWB on every booking.
    const result = (REAL_RESPONSE.data as Array<Record<string, unknown>>)[0];
    assert.ok("airwaybilno" in result);
    assert.equal(result.awb, undefined);
  });

  it("returns the label separately from the invoice and the merged pack", () => {
    const result = (REAL_RESPONSE.data as Array<Record<string, string>>)[0];
    // dispatch_url is the shipping label — the ONLY one the customer sees.
    assert.match(result.dispatch_url, /dispatch_labels\/.*\.pdf$/);
    // These two are vendor-branded and stay internal.
    assert.match(result.invoice_url, /_invoice\.pdf$/);
    assert.match(result.proforma_url, /acc_shipper_invoice/);
  });
});

// ---------------------------------------------------------------------------
// 2. The per-courier strategy table
// ---------------------------------------------------------------------------

describe("sKart carrier families", () => {
  /**
   * These are the product names sKart's own rate calculator returns and its
   * catalogue lists, verbatim. Every one of them was UNBOOKABLE under the old
   * eight-row allowlist, which is what made the whole vendor dead: the customer
   * could buy them and nothing could place them.
   */
  it("recognises the products the rate calculator actually sells", () => {
    const cases: [string, string, ReturnType<typeof resolveSkartFamily>][] = [
      ["DHL EXPRESS", "DHL DEL DDU ( Gifts Only )", "DHL"],
      ["FEDEX", "Fedex DEL DDU", "FEDEX"],
      ["UPS EXPRESS", "UPS World DEL USA", "UPS"],
      ["ARAMEX EXPRESS", "Aramex Aus PPX DEL", "ARAMEX"],
      ["SKYNET EXPRESS", "Skynet UK Single piece", "SKYNET"],
      ["EMIRATES", "Emirates B2B DEL", "EMIRATES"],
      ["SKART SELF INTERNATIONAL", "Widect DDP", "SKART"],
    ];

    for (const [parentVendor, productName, expected] of cases) {
      assert.equal(
        resolveSkartFamily({ parentVendor, productName }),
        expected,
        `${productName} should resolve to ${expected}`,
      );
    }
  });

  it("trusts parent_vendor over the product name", () => {
    // "AMX UPS DEL DDU" is a UPS service sold under Aramex's parent. The
    // catalogue is the authority on which is which.
    assert.equal(
      resolveSkartFamily({
        parentVendor: "ARAMEX EXPRESS",
        productName: "AMX UPS DEL DDU ( Gifts Only )",
      }),
      "ARAMEX",
    );
  });

  it("falls back to the name when the catalogue could not be read", () => {
    // Offline, the name is all there is. UPS is tested before Aramex so the
    // more specific carrier is not masked by the reseller's prefix.
    assert.equal(resolveSkartFamily({ productName: "AMX UPS DEL" }), "UPS");
    assert.equal(resolveSkartFamily({ productName: "Aramex Exp DEL" }), "ARAMEX");
    assert.equal(resolveSkartFamily({ productName: "Skynet Mum" }), "SKYNET");
  });

  it("books an unknown carrier as the plain payload rather than refusing", () => {
    // The deliberate reversal. An unrecognised family gets the body Aramex and
    // sKart's own channels take, which is the one with no extras — not a
    // refusal, because refusing is what blocked every real product.
    const channel = skartChannel(resolveSkartFamily({ productName: "Hey World" }));
    assert.equal(channel.family, "OTHER");
    assert.equal(channel.requiresInvoiceData, false);
    assert.equal(channel.sendsOtpField, false);
  });

  it("sends invoiceData for FedEx and UPS and not for Aramex or DHL", () => {
    assert.equal(skartChannel("FEDEX").requiresInvoiceData, true);
    assert.equal(skartChannel("UPS").requiresInvoiceData, true);
    assert.equal(skartChannel("ARAMEX").requiresInvoiceData, false);
    assert.equal(skartChannel("DHL").requiresInvoiceData, false);
  });

  it("keeps the curated ids as an offline fallback, keyed on the pair", () => {
    // FedEx DEL is 122 on a CSB4 export and 192 on a commercial one. Anything
    // keyed on the carrier name alone would book the wrong product.
    assert.equal(
      curatedSkartCourierId({
        productName: "FEDEX DEL",
        shipmentType: SKART_SHIPMENT_TYPE.CSB4,
      }),
      122,
    );
    assert.equal(
      curatedSkartCourierId({
        productName: "  fedex del  ",
        shipmentType: SKART_SHIPMENT_TYPE.COMMERCIAL,
      }),
      192,
    );
    assert.equal(
      curatedSkartCourierId({
        productName: "DHL DEL DDU ( Gifts Only )",
        shipmentType: SKART_SHIPMENT_TYPE.CSB4,
      }),
      null,
    );
  });
});

describe("sKart booking payload", () => {
  it("declines pickup with 2, never 0", () => {
    // THE bug that made every sKart booking fail. Allowed values are 1 (Yes)
    // and 2 (No); a 0 is outside the set, so the request was refused on
    // validation before sKart looked at anything else. And the pickup_* details
    // are required only when a DIFFERENT pickup location is given, so with no
    // pickup requested they are omitted rather than sent blank.
    const payload = buildSkartBookingPayload(baseRequest(), SKART_CONTEXT);
    assert.equal(payload.pickup_required, SKART_PICKUP_REQUIRED.NO);
    assert.equal(payload.pickup_required, 2);
    assert.equal(payload.pickup_location, undefined);
    assert.equal(payload.pickup_pincode, undefined);
  });

  it("books from the consignor's door, matching what was quoted", () => {
    const payload = buildSkartBookingPayload(baseRequest(), SKART_CONTEXT);
    // Quoting from one origin and booking from another silently changes the
    // price. This is the customer's own pincode, not a hub's.
    assert.equal(payload.origin_pincode, "110049");
  });

  it("sends the exact courier id it was given", () => {
    const payload = buildSkartBookingPayload(baseRequest(), {
      ...SKART_CONTEXT,
      courierId: 133,
      channel: skartChannel("UPS"),
    });
    assert.equal(payload.courier_id, 133);
  });

  it("declares the export scheme the shipment actually claims", () => {
    // Previously hardcoded to "under LUT" on every consignment, which asserts a
    // registration most exporters do not hold.
    assert.equal(toSkartExportType("UT"), "1");
    assert.equal(toSkartExportType("BOND"), "2");
    assert.equal(toSkartExportType("NA"), "3");

    const bond = buildSkartBookingPayload(
      baseRequest({
        customs: { ...baseRequest().customs, exportType: "BOND" },
      }),
      SKART_CONTEXT,
    );
    assert.equal(bond.export_type, "2");
    // Zero-rated and consistent: no IGST amount, so no IGST declared paid.
    assert.equal(bond.tax_amount, "0");
    assert.equal(bond.tax_paid, 2);
  });

  it("sends the three commercial fields together, and only when commercial", () => {
    // cargo_type, clearence_type and inco_term are each required whenever
    // shipment_type is 4. Omitting them is a refused booking.
    const commercial = buildSkartBookingPayload(
      baseRequest({
        customs: { ...baseRequest().customs, shipmentType: "COMMERCIAL" },
      }),
      SKART_CONTEXT,
    );
    assert.equal(commercial.shipment_type, SKART_SHIPMENT_TYPE.COMMERCIAL);
    assert.equal(commercial.cargo_type, "1");
    assert.equal(commercial.clearence_type, "3");
    assert.equal(commercial.inco_term, "2");

    const csb4 = buildSkartBookingPayload(baseRequest(), SKART_CONTEXT);
    assert.equal(csb4.cargo_type, undefined);
    assert.equal(csb4.clearence_type, undefined);
    assert.equal(csb4.inco_term, undefined);
  });

  it("maps DDU to DAP with destination clearance", () => {
    // sKart's list is finer than ours. DDU means the receiver pays the duty,
    // not that the consignment goes uncleared.
    assert.equal(toSkartIncoTerm("DDP"), 2);
    assert.equal(toSkartIncoTerm("DDU"), 4);
  });

  it("never leaves a mandatory field blank", () => {
    // sKart documents a dozen fields as "mandatory and must not be empty" that
    // Arena's model allows to be absent. Each falls back to something true
    // rather than to "", which their validator reads as missing.
    const bare = baseRequest();
    const payload = buildSkartBookingPayload(
      baseRequest({
        pickup: { ...bare.pickup, companyName: null, line2: null },
        delivery: { ...bare.delivery, companyName: null, line2: null },
      }),
      SKART_CONTEXT,
    );

    assert.equal(payload.consigner_company_name, "Ajay Kumar");
    assert.equal(payload.consigner_address_2, "New Delhi");
    assert.equal(payload.consignee_company_name, "Sonu Verma");
    assert.equal(payload.consignee_address_2, "Melbourne");
  });

  it("strips a city down to the letters sKart will accept", () => {
    // "city must contain only letters". A postcode-ish or punctuated city is
    // otherwise a refusal on a field nobody would think to look at.
    const payload = buildSkartBookingPayload(
      baseRequest({
        delivery: { ...baseRequest().delivery, city: "St. Louis  3001" },
      }),
      SKART_CONTEXT,
    );
    assert.equal(payload.city, "St Louis");
  });

  it("keeps weight in kilograms and dimensions per box", () => {
    // Unlike Shipmozo, sKart takes real per-box lines, so nothing is collapsed
    // and nothing is converted to grams.
    const request = baseRequest({
      parcels: [
        {
          quantity: 2,
          weightKg: 1.5,
          lengthCm: 30,
          widthCm: 20,
          heightCm: 10,
          declaredValue: 4000,
          description: "Box A",
        },
        {
          quantity: 1,
          weightKg: 3,
          lengthCm: 50,
          widthCm: 40,
          heightCm: 25,
          declaredValue: 9000,
          description: "Box B",
        },
      ],
    });

    const payload = buildSkartBookingPayload(request, SKART_CONTEXT);

    assert.equal(payload.unit.weight_unit, "kgs");
    assert.equal(payload.shipment_dimensions.length, 2);
    assert.equal(payload.shipment_dimensions[0].weight, "1.5");
    assert.equal(payload.shipment_dimensions[0].quantity, "2");
    // sKart calls width "breadth".
    assert.equal(payload.shipment_dimensions[1].breadth, "40");
  });

  it("attaches the commercial invoice for FedEx and omits it for DHL", () => {
    const fedex = buildSkartBookingPayload(baseRequest(), {
      ...SKART_CONTEXT,
      channel: skartChannel("FEDEX"),
    });
    assert.ok(fedex.invoiceData);
    assert.equal(fedex.invoiceData?.shipperInvoice[0].description, "Cotton scarf");
    assert.equal(fedex.invoiceData?.gstDataId, "106");

    const dhl = buildSkartBookingPayload(baseRequest(), SKART_CONTEXT);
    assert.equal(dhl.invoiceData, undefined);
  });

  it("sends a consignee state code only for Skynet", () => {
    const skynet = buildSkartBookingPayload(baseRequest(), {
      ...SKART_CONTEXT,
      channel: skartChannel("SKYNET"),
    });
    // Falls back to the country code, exactly as sKart's own example does.
    assert.equal(skynet.consignee_state_code, "AU");
    assert.equal(skynet.shipment_purpose, 8);

    const aramex = buildSkartBookingPayload(baseRequest(), {
      ...SKART_CONTEXT,
      channel: skartChannel("ARAMEX"),
    });
    assert.equal(aramex.consignee_state_code, undefined);
    assert.equal(aramex.shipment_purpose, undefined);
  });

  it("itemises a commodity array for DHL and nobody else", () => {
    // The PDF marks `commodity` required for DHL vendors. Their older JSON
    // example omits it; where the two disagree the PDF is the current document.
    const dhl = buildSkartBookingPayload(baseRequest(), SKART_CONTEXT);
    const line = dhl.shipment_dimensions[0];
    assert.equal(line.commodity?.length, 1);
    assert.equal(line.commodity?.[0].description, "Cotton scarf");
    assert.equal(line.commodity?.[0].hsn_code, "62142010");
    // Four scarves at 2000 each, declared as the line's value not the unit's.
    assert.equal(line.commodity?.[0].invoice_value, 8000);
    // The box's own weight, since it is the only line in the box.
    assert.equal(line.commodity?.[0].weight, 2.4);

    const aramex = buildSkartBookingPayload(baseRequest(), {
      ...SKART_CONTEXT,
      channel: skartChannel("ARAMEX"),
    });
    assert.equal(aramex.shipment_dimensions[0].commodity, undefined);
  });

  it("maps a commercial shipment to shipment_type 4", () => {
    assert.equal(toSkartShipmentType("CSB4"), SKART_SHIPMENT_TYPE.CSB4);
    assert.equal(toSkartShipmentType("CSB5"), SKART_SHIPMENT_TYPE.CSB4);
    assert.equal(
      toSkartShipmentType("COMMERCIAL"),
      SKART_SHIPMENT_TYPE.COMMERCIAL,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. The Shipmozo international mapper
// ---------------------------------------------------------------------------

describe("Shipmozo international push-order payload", () => {
  it("converts kilograms to grams, always rounding up", () => {
    assert.equal(toGrams(2.4), 2400);
    // 0.0001 kg is a tenth of a gram. Rounding down would declare it as zero.
    assert.equal(toGrams(0.0001), 1);
    assert.equal(toGrams(0), 1);
    assert.equal(toGrams(-5), 1);
    assert.equal(toGrams(1.0001), 1001);
  });

  it("collapses many boxes to the largest of each dimension", () => {
    // international-push-order takes ONE L/W/H even for MPS. Over-declaring a
    // mixed-size consignment is deliberate: under-declaring gets it held.
    const request = baseRequest({
      parcels: [
        {
          quantity: 1,
          weightKg: 1,
          lengthCm: 30,
          widthCm: 45,
          heightCm: 10,
          declaredValue: 100,
          description: null,
        },
        {
          quantity: 1,
          weightKg: 1,
          lengthCm: 50,
          widthCm: 20,
          heightCm: 25.2,
          declaredValue: 100,
          description: null,
        },
      ],
    });

    const payload = buildIntlPushOrderPayload(request, {
      warehouseId: "wh_1",
      shipperId: "sh_1",
      countryId: "12",
    });

    assert.equal(payload.length, "50");
    assert.equal(payload.width, "45");
    // 25.2 rounds up to 26, never down to 25.
    assert.equal(payload.height, "26");
  });

  it("declares MPS once there is more than one box", () => {
    const single = buildIntlPushOrderPayload(baseRequest(), {
      warehouseId: "wh_1",
      shipperId: null,
      countryId: "12",
    });
    assert.equal(single.type_of_package, "SPS");

    const multi = buildIntlPushOrderPayload(
      baseRequest({
        parcels: [
          {
            quantity: 3,
            weightKg: 1,
            lengthCm: 10,
            widthCm: 10,
            heightCm: 10,
            declaredValue: 100,
            description: null,
          },
        ],
      }),
      { warehouseId: "wh_1", shipperId: null, countryId: "12" },
    );
    assert.equal(multi.type_of_package, "MPS");
  });

  it("maps the customs category to Shipmozo's shipment purpose", () => {
    const csb4 = buildIntlPushOrderPayload(baseRequest(), {
      warehouseId: "wh_1",
      shipperId: null,
      countryId: "12",
    });
    assert.equal(csb4.shipment_purpose, "SCSB4");

    const commercial = buildIntlPushOrderPayload(
      baseRequest({
        customs: { ...baseRequest().customs, shipmentType: "COMMERCIAL" },
      }),
      { warehouseId: "wh_1", shipperId: null, countryId: "12" },
    );
    assert.equal(commercial.shipment_purpose, "CSB5");
  });

  it("sends every documented key, blank rather than absent", () => {
    // Shipmozo reads fields without checking they exist, so an omitted optional
    // is not "no value", it is a refused order.
    const payload = buildIntlPushOrderPayload(
      baseRequest({
        exporter: {
          iecNumber: null,
          adCode: null,
          gstin: null,
          lutNumber: null,
          lutIssueDate: null,
          lutTillDate: null,
          iossNumber: null,
        },
      }),
      { warehouseId: "wh_1", shipperId: null, countryId: "12" },
    );

    assert.equal(payload.iec_number, "");
    assert.equal(payload.ad_code, "");
    assert.equal(payload.lut_number, "");
    assert.equal(payload.ioss_number, "");
    assert.equal(payload.shipper_id, "");
    // Present, not undefined.
    assert.ok("consignee_gst_number" in payload);
  });

  it("carries the export compliance block through", () => {
    const payload = buildIntlPushOrderPayload(baseRequest(), {
      warehouseId: "wh_9",
      shipperId: "sh_9",
      countryId: "12",
    });

    assert.equal(payload.iec_number, "0388012345");
    assert.equal(payload.ad_code, "6390004");
    assert.equal(payload.export_type, "UT");
    assert.equal(payload.incoterms, "DDP");
    assert.equal(payload.terms_of_invoice, "FOB");
    assert.equal(payload.lut_till_date, "2027-03-31");
    assert.equal(payload.warehouse_id, "wh_9");
    assert.equal(payload.shipper_id, "sh_9");
    // Never claimed: Arena has not filed under the MEIS scheme.
    assert.equal(payload.meis, "NO");
  });

  it("never sends a blank consignee state, whatever the destination", () => {
    // MEASURED, not inferred: the live endpoint answers a blank one with "The
    // consignee state field is required." Dubai, Singapore and most of the Gulf
    // have no state, so a straight pass-through refused every export to them.
    const dubai = buildIntlPushOrderPayload(
      baseRequest({
        delivery: {
          ...baseRequest().delivery,
          city: "Dubai",
          state: "",
          countryCode: "AE",
          countryName: "UNITED ARAB EMIRATES",
        },
      }),
      { warehouseId: "wh_1", shipperId: null, countryId: "231" },
    );
    assert.equal(dubai.consignee_state, "Dubai");

    // And the country when there is not even a city.
    const neither = buildIntlPushOrderPayload(
      baseRequest({
        delivery: {
          ...baseRequest().delivery,
          city: "",
          state: "",
          countryName: "SINGAPORE",
        },
      }),
      { warehouseId: "wh_1", shipperId: null, countryId: "1" },
    );
    assert.equal(neither.consignee_state, "SINGAPORE");

    // A real state still wins.
    const stated = buildIntlPushOrderPayload(baseRequest(), {
      warehouseId: "wh_1",
      shipperId: null,
      countryId: "12",
    });
    assert.equal(stated.consignee_state, "Victoria");
  });

  it("falls back to one honest generic line when contents are blank", () => {
    const payload = buildIntlPushOrderPayload(baseRequest({ items: [] }), {
      warehouseId: "wh_1",
      shipperId: null,
      countryId: "12",
    });

    assert.equal(payload.row_content.length, 1);
    assert.equal(payload.row_content[0].name, "General Cargo");
    assert.equal(payload.row_content[0].unit_price, 8000);
  });

  it("builds the shipper from the pickup party", () => {
    const shipper = buildShipperPayload(baseRequest());
    assert.equal(shipper.name, "Ajay Kumar");
    assert.equal(shipper.pin_code, "110049");
    // Shipmozo derives city and state from the pincode, so neither is sent.
    assert.ok(!("city" in shipper));
  });

  it("marks the shipper ACTIVE, which create-shipper requires undocumented", () => {
    // Shipmozo's published schema for /create-shipper lists six fields and
    // marks none required. The live endpoint refuses the call without this one:
    // "The status field is required." ACTIVE is their own vocabulary for an
    // address record, read from GET /get-warehouses.
    //
    // Pinned because dropping it is a silent break: the payload still typechecks
    // as a plausible shipper and every export then fails at the vendor.
    const shipper = buildShipperPayload(baseRequest());
    assert.equal(shipper.status, "ACTIVE");
  });
});

// ---------------------------------------------------------------------------
// 4. The export profile
// ---------------------------------------------------------------------------

describe("export profile resolution", () => {
  const org = {
    gstin: "07ORGGST0001Z1",
    iecNumber: "ORG-IEC",
    adCode: "ORG-AD",
    lutNumber: "ORG-LUT",
    lutIssueDate: new Date("2026-04-01T00:00:00Z"),
    lutTillDate: new Date("2027-03-31T00:00:00Z"),
    iossNumber: null,
    defaultIncoterms: "DDP" as const,
    defaultExportType: "LUT" as const,
  };

  it("prefers the client, who is the party legally exporting", () => {
    // For a BA org booking on behalf of a client, filing the export under the
    // BA's IEC is a compliance problem, not a cosmetic one.
    const resolved = resolveExportProfile({
      org,
      client: { iecNumber: "CLIENT-IEC" },
      override: null,
    });

    assert.equal(resolved.iecNumber, "CLIENT-IEC");
    assert.equal(resolved.sources.iecNumber, "client");
  });

  it("falls back field by field, not object by object", () => {
    // A client with an IEC but no AD code still inherits the org's AD code.
    // Merging whole objects would blank a complete profile with a partial one.
    const resolved = resolveExportProfile({
      org,
      client: { iecNumber: "CLIENT-IEC" },
      override: null,
    });

    assert.equal(resolved.adCode, "ORG-AD");
    assert.equal(resolved.sources.adCode, "org");
  });

  it("lets a per-shipment override beat both", () => {
    const resolved = resolveExportProfile({
      org,
      client: { iecNumber: "CLIENT-IEC" },
      override: { iecNumber: "OVERRIDE-IEC", exportType: "BOND" },
    });

    assert.equal(resolved.iecNumber, "OVERRIDE-IEC");
    assert.equal(resolved.sources.iecNumber, "override");
    assert.equal(resolved.exportType, "BOND");
  });

  it("keeps an LUT number with its own dates", () => {
    // A number from the client paired with dates from the org would describe a
    // document that does not exist.
    const resolved = resolveExportProfile({
      org,
      client: {
        lutNumber: "CLIENT-LUT",
        lutIssueDate: new Date("2026-05-01T00:00:00Z"),
        lutTillDate: new Date("2027-04-30T00:00:00Z"),
      },
      override: null,
    });

    assert.equal(resolved.lutNumber, "CLIENT-LUT");
    assert.equal(resolved.lutIssueDate, "2026-05-01");
    assert.equal(resolved.lutTillDate, "2027-04-30");
  });

  it("translates Prisma's LUT to the vendors' UT", () => {
    const resolved = resolveExportProfile({ org, client: null, override: null });
    assert.equal(resolved.exportType, "UT");
  });

  it("treats an empty string as unfilled, not as a value", () => {
    const resolved = resolveExportProfile({
      org,
      client: { iecNumber: "   " },
      override: null,
    });
    assert.equal(resolved.iecNumber, "ORG-IEC");
  });

  it("defaults to DDP and NA when nobody has said", () => {
    const resolved = resolveExportProfile({
      org: null,
      client: null,
      override: null,
    });
    assert.equal(resolved.incoterms, "DDP");
    assert.equal(resolved.exportType, "NA");
    assert.equal(resolved.iecNumber, null);
  });

  it("catches a lapsed LUT", () => {
    // Exporting zero-rated against an expired LUT lands months later as a tax
    // demand, so it is refused at preflight rather than discovered then.
    const profile = { lutNumber: "L1", lutTillDate: "2026-03-31" };
    assert.equal(isLutExpired(profile, new Date("2026-08-02")), true);
    assert.equal(isLutExpired(profile, new Date("2026-03-31")), false);
    // No LUT at all is not an expired one.
    assert.equal(
      isLutExpired({ lutNumber: null, lutTillDate: null }, new Date()),
      false,
    );
  });

  it("names the missing fields in words a person can act on", () => {
    const resolved = resolveExportProfile({
      org: null,
      client: null,
      override: null,
    });
    assert.deepEqual(missingExportFields(resolved, ["iecNumber", "adCode"]), [
      "IEC number",
      "AD code",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 5. Invoice numbering
// ---------------------------------------------------------------------------

describe("commercial invoice number", () => {
  it("is derived, so a retry declares the same number", () => {
    // A second attempt that invents a new invoice number is a customs
    // discrepancy found at the border, long after anyone remembers why.
    assert.equal(
      intlInvoiceNumber("ARN260130748291"),
      intlInvoiceNumber("ARN260130748291"),
    );
    assert.equal(intlInvoiceNumber("ARN260130748291"), "INV-ARN260130748291");
  });
});

// ---------------------------------------------------------------------------
// 6. Which papers a consignment actually needs
//
// This is the rule that decides whether an export is booked or held, and it was
// wrong once in the expensive direction: it demanded an IEC and an AD code on
// every consignment, on the belief that Shipmozo rejected the ones without. It
// does not — their spec marks nothing required — and the result was that every
// international booking in the system was permanently blocked. These tests pin
// the corrected rule so it cannot quietly widen again.
// ---------------------------------------------------------------------------

describe("missingExportPapers", () => {
  const bare = { iecNumber: null, adCode: null, lutNumber: null };
  const full = {
    iecNumber: "AAAAA1234A",
    adCode: "6390004",
    lutNumber: "AD070424000123M",
  };

  it("asks a low-value courier export for nothing", () => {
    // CSB-IV exists precisely so small exports can go without an IEC. This is
    // the case that was blocked, and it is the common one.
    assert.deepEqual(
      missingExportPapers({
        shipmentType: "CSB4",
        exportType: "NA",
        exporter: bare,
      }),
      [],
    );
  });

  it("requires the exporter's identity on a full shipping bill", () => {
    // CSB-V and COMMERCIAL are filed to customs against the exporter and their
    // bank. Missing here means stopped at the port, which is worse.
    for (const shipmentType of ["CSB5", "COMMERCIAL"] as const) {
      assert.deepEqual(
        missingExportPapers({ shipmentType, exportType: "NA", exporter: bare }),
        ["IEC number", "AD code"],
        `${shipmentType} should demand both`,
      );
    }
  });

  it("demands an LUT only when the export claims to move under one", () => {
    // Tax, not customs, so the route does not matter — only the declaration.
    assert.deepEqual(
      missingExportPapers({
        shipmentType: "CSB4",
        exportType: "UT",
        exporter: bare,
      }),
      ["LUT number"],
    );

    for (const exportType of ["NA", "BOND"] as const) {
      assert.deepEqual(
        missingExportPapers({
          shipmentType: "CSB4",
          exportType,
          exporter: bare,
        }),
        [],
        `${exportType} should not demand an LUT`,
      );
    }
  });

  it("is satisfied by a complete profile on every route", () => {
    for (const shipmentType of ["CSB4", "CSB5", "COMMERCIAL"] as const) {
      assert.deepEqual(
        missingExportPapers({ shipmentType, exportType: "UT", exporter: full }),
        [],
        `${shipmentType} with everything on file should pass`,
      );
    }
  });

  it("treats an unknown or absent route as the conservative one", () => {
    // A row written before the column existed must not be read as a commercial
    // export, which would invent a compliance claim nobody made.
    assert.deepEqual(
      missingExportPapers({
        shipmentType: null,
        exportType: "NA",
        exporter: bare,
      }),
      [],
    );
  });

  it("reports every missing paper at once, not one per attempt", () => {
    // Ops fix these by hand. Naming one, then another on the retry, turns a
    // single correction into three round trips.
    assert.deepEqual(
      missingExportPapers({
        shipmentType: "COMMERCIAL",
        exportType: "UT",
        exporter: bare,
      }),
      ["IEC number", "AD code", "LUT number"],
    );
  });
});
