/**
 * CANONICAL → ARAMEX SHIPPING PAYLOAD
 * -----------------------------------------------------------------------------
 * Pure translation. No HTTP, no env reads beyond the two documented switches, no
 * decisions about whether a booking should happen — those belong to the adapter.
 *
 * Units follow the canonical rule: kilograms, centimetres and major currency
 * units in, and the same out, because Aramex works in exactly those. Nothing
 * here converts anything, which is the best kind of mapper to have.
 *
 * Deliberately NOT `server-only`, for the same reason sKart's mapper is not:
 * what we declare to a carrier has to be unit-testable without a server runtime.
 * It reads no credentials of its own — the account, and therefore the auth block
 * and the billing account number, is handed in by the adapter.
 */

import type { AramexAccount } from "@/lib/aramex/accounts";
import { aramexClientInfo } from "@/lib/aramex/accounts";
import { toAramexPropertyDate, toWcfDate } from "@/lib/aramex/wcfDate";
import type { AramexParty } from "@/lib/aramex/types";
import {
  computeShipmentWeights,
  type CanonicalPackage,
} from "@/lib/pricing/chargeableWeight";

import type {
  CanonicalIntlBookingRequest,
  IntlBookingParty,
} from "../../core/intl.types";
import type {
  AramexAdditionalProperty,
  AramexCreateShipmentsRequest,
  AramexShipmentItem,
} from "./aramex.booking.types";

/**
 * Priority Parcel Express under International Express.
 *
 * Pinned to match what the RATE call quoted (lib/rate-adapters/vendors/aramex).
 * Booking a consignment on a product other than the one it was priced on is the
 * quiet way to end up with an Aramex invoice nobody can tie to a shipment —
 * which is the same failure the per-account plumbing exists to prevent, one
 * level down. If the rate adapter's product ever changes, change it here in the
 * same commit.
 */
export const ARAMEX_PRODUCT_GROUP = "EXP";
export const ARAMEX_PRODUCT_TYPE = "PPX";

/**
 * Aramex's report template for the label. See AramexLabelInfo.
 */
const LABEL_REPORT_ID = Number(process.env.ARAMEX_LABEL_REPORT_ID ?? 9729);

/**
 * Whether to send our reference as ForeignHAWB.
 *
 * ── WHY THIS IS A SWITCH AND NOT JUST ON ────────────────────────────────────
 * Sending it is strictly better in normal operation: Aramex enforces ForeignHAWB
 * uniqueness, which turns a retry-after-a-lost-response into a REFUSAL instead
 * of a second export at full price. That is the only duplicate protection this
 * integration has, because Aramex publishes no lookup by our own reference.
 *
 * It is a switch because it is also the one field here whose format constraints
 * Aramex does not document, and this adapter goes live without a test booking
 * against their production account. If it turns out they reject our reference
 * shape, every Aramex booking fails — and the fix has to be available without a
 * deploy. Set ARAMEX_FOREIGN_HAWB=off, bookings resume, and the duplicate guard
 * is what is lost.
 */
function foreignHawbEnabled(): boolean {
  const raw = process.env.ARAMEX_FOREIGN_HAWB?.trim().toLowerCase();
  return raw !== "off" && raw !== "false" && raw !== "0";
}

/**
 * Aramex's system is not documented as accepting punctuation in ForeignHAWB, so
 * the reference is reduced to the alphanumerics it already is in practice
 * ("ARN260130748291") and capped. Uniqueness survives both operations: the
 * shipment number is alphanumeric and 15 characters to begin with.
 */
function toForeignHawb(displayReference: string): string {
  return displayReference.replace(/[^A-Za-z0-9]/g, "").slice(0, 30);
}

function text(value: string | null | undefined, fallback = ""): string {
  return value?.trim() || fallback;
}

/**
 * Aramex validates phone numbers loosely but does reject empty ones on the
 * shipper. Digits and a leading + are kept; everything else a customer may have
 * typed is dropped.
 */
function phone(value: string | null | undefined): string {
  return (value ?? "").replace(/[^\d+]/g, "").slice(0, 20);
}

function toParty(
  party: IntlBookingParty,
  options: { accountNumber?: string; reference?: string } = {},
): AramexParty {
  const contactPhone = phone(party.phone);

  return {
    Reference1: text(options.reference).slice(0, 50),
    Reference2: "",
    // Only ever set on the Shipper, and it is what decides which Aramex
    // contract this consignment is invoiced against. See lib/aramex/accounts.ts.
    AccountNumber: options.accountNumber ?? "",
    PartyAddress: {
      Line1: text(party.line1, text(party.city)),
      Line2: text(party.line2),
      Line3: "",
      City: text(party.city),
      StateOrProvinceCode: text(party.stateCode),
      PostCode: text(party.postalCode),
      CountryCode: text(party.countryCode).toUpperCase(),
      Longitude: 0,
      Latitude: 0,
      BuildingNumber: null,
      BuildingName: null,
      Floor: null,
      Apartment: null,
      POBox: null,
      Description: null,
    },
    Contact: {
      Department: "",
      PersonName: text(party.contactName).slice(0, 50),
      Title: "",
      // Aramex prints CompanyName on the label and the manifest. An individual
      // sender has none, so their own name stands in rather than a blank box on
      // a customs document.
      CompanyName: text(party.companyName, text(party.contactName)).slice(0, 50),
      PhoneNumber1: contactPhone,
      PhoneNumber1Ext: "",
      PhoneNumber2: "",
      PhoneNumber2Ext: "",
      FaxNumber: "",
      CellPhone: contactPhone,
      EmailAddress: text(party.email),
      Type: "",
    },
  };
}

/** Parcels → the shape lib/pricing/chargeableWeight speaks. */
export function toCanonicalPackages(
  request: CanonicalIntlBookingRequest,
): CanonicalPackage[] {
  return request.parcels.map((parcel) => ({
    quantity: parcel.quantity,
    weightKg: parcel.weightKg,
    lengthCm: parcel.lengthCm,
    widthCm: parcel.widthCm,
    heightCm: parcel.heightCm,
  }));
}

function toItems(request: CanonicalIntlBookingRequest): AramexShipmentItem[] {
  const currency = request.customs.currency;

  return request.items.map((item) => ({
    PackageType: "Box",
    Quantity: String(Math.max(1, Math.trunc(item.quantity))),
    // Per-line weight is not tracked canonically, and guessing one by dividing
    // the shipment weight across lines would put a fabricated number on a
    // customs declaration. Aramex treats it as optional.
    Weight: null,
    CustomsValue: {
      CurrencyCode: currency,
      // The LINE total, which is what Aramex's own samples carry here.
      Value: round2(item.unitValue * Math.max(1, Math.trunc(item.quantity))),
    },
    Comments: text(item.category).slice(0, 200),
    GoodsDescription: text(item.name, "Goods").slice(0, 200),
    Reference: "",
    CommodityCode: text(item.hsCode),
  }));
}

/**
 * Whether the sender is an individual rather than a company, for Aramex's KYC
 * rules: no company name on the sender's address means an individual.
 *
 * Deliberately simple, and the rule the business asked for (2026-09-25). If it
 * proves too loose (a sole trader who types their shop name, say), replace it
 * here; every caller goes through this function.
 */
export function isIndividualShipper(request: CanonicalIntlBookingRequest): boolean {
  return !request.pickup.companyName?.trim();
}

/**
 * Aramex's ExporterType for a courier export under neither an LUT nor a bond.
 *
 * Aramex India (Tanmay, 2026-09-25): an individual "selects not applicable in
 * courier case". The exact API string was not given; "NA" matches their `UT`
 * style of short code and our own ExportType. Overridable without a deploy if
 * Aramex says otherwise.
 */
function exporterTypeNotApplicable(): string {
  return process.env.ARAMEX_EXPORTER_TYPE_NA?.trim() || "NA";
}

/**
 * The customs block, as Aramex's key-value extension properties.
 *
 * Aramex India refuses an export without the shipper's KYC number and exporter
 * type (ERR48), although their manual marks both optional. What they want, per
 * Aramex India (2026-09-25):
 *
 *   company     ShipperTaxIdVATEINNumber = GSTIN
 *               ExporterType = UT (LUT) or BOND, as the shipper confirms,
 *               else "not applicable"
 *   individual  ShipperTaxIdVATEINNumber = Aadhaar number
 *               ExporterType = "not applicable"
 *
 * The Aadhaar arrives already decrypted from the adapter (`individualTaxId`),
 * so this module never touches the vault and stays pure.
 *
 * Everything else is sent only when we hold it: an empty-stringed tax number
 * asserts to customs that the exporter has none.
 */
function toAdditionalProperties(
  request: CanonicalIntlBookingRequest,
  individualTaxId: string | null,
): AramexAdditionalProperty[] {
  const props: AramexAdditionalProperty[] = [];
  const add = (name: string, value: string | null | undefined) => {
    const v = value?.trim();
    if (v) props.push({ CategoryName: "CustomsClearance", Name: name, Value: v });
  };

  const { customs, exporter } = request;

  add("InvoiceNumber", customs.invoiceNumber);
  add("InvoiceDate", toAramexPropertyDate(customs.invoiceDate));

  if (isIndividualShipper(request)) {
    add("ShipperTaxIdVATEINNumber", individualTaxId);
    add("ExporterType", exporterTypeNotApplicable());
  } else {
    add("ShipperTaxIdVATEINNumber", exporter.gstin);
    if (exporter.gstin?.trim()) add("RegisteredToGST", "1");
    add(
      "ExporterType",
      customs.exportType === "NA" ? exporterTypeNotApplicable() : customs.exportType,
    );
  }

  // EU consignments below the VAT threshold moving under our customer's IOSS
  // registration.
  add("IOSS", exporter.iossNumber);

  return props;
}

function round2(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Build the whole CreateShipments request for ONE account.
 *
 * `account` is not incidental: it supplies the credentials AND the Shipper's
 * AccountNumber, which together decide whose tariff prices the consignment and
 * whose monthly invoice it lands on. The adapter resolves it from the account
 * key snapshotted at quote time; there is no default and no fallback, by design.
 */
export function buildAramexBookingPayload(
  request: CanonicalIntlBookingRequest,
  options: {
    account: AramexAccount;
    now?: Date;
    /**
     * An individual shipper's decrypted Aadhaar, supplied by the adapter at call
     * time. Never persisted, logged or returned.
     */
    individualTaxId?: string | null;
  },
): AramexCreateShipmentsRequest {
  const { account } = options;
  const now = options.now ?? new Date();

  const weights = computeShipmentWeights(toCanonicalPackages(request));

  const shippingDateTime = toWcfDate(now);

  return {
    ClientInfo: aramexClientInfo(account),

    LabelInfo: {
      ReportID: LABEL_REPORT_ID,
      // A link rather than inline base64. Downloaded in fetchDocuments.
      ReportType: "URL",
    },

    Shipments: [
      {
        // The customer-facing number, so ops reading the Aramex panel see the
        // same string they see here.
        Reference1: text(request.displayReference).slice(0, 50),
        Reference2: "",
        Reference3: "",

        Shipper: toParty(request.pickup, {
          accountNumber: account.accountNumber,
          reference: request.displayReference,
        }),
        Consignee: toParty(request.delivery),
        // Prepaid by the shipper, so there is no third party to bill.
        ThirdParty: null,

        ShippingDateTime: shippingDateTime,
        // Aramex treats DueDate as the ready-by date. Same day: Arena has the
        // parcel at the hub before this call is made.
        DueDate: shippingDateTime,

        Comments: "",
        PickupLocation: "",
        OperationsInstructions: "",
        AccountingInstrcutions: "",

        Details: {
          // See the field's own note: one Dimensions block cannot honestly
          // describe a multi-box consignment, so the volumetric figure is given
          // explicitly below instead.
          Dimensions: null,

          // TRUTHFUL, unlike the rate call.
          //
          // The rate calculator pushes the chargeable weight through
          // ActualWeight because some Aramex accounts ignore an explicit
          // ChargeableWeight and would otherwise quote under the real price. A
          // BOOKING is a declaration, so the two numbers are stated for what
          // they are. The worst case of Aramex ignoring ChargeableWeight here is
          // that they bill us on the lower figure; the worst case of declaring
          // a false actual weight is a customs discrepancy.
          ActualWeight: { Unit: "KG", Value: round2(request.totalActualWeightKg) },
          ChargeableWeight: { Unit: "KG", Value: weights.totalChargeableKg },

          DescriptionOfGoods: text(
            request.items[0]?.name ?? request.parcels[0]?.description,
            "Goods",
          ).slice(0, 200),
          GoodsOriginCountry: text(request.pickup.countryCode, "IN").toUpperCase(),
          NumberOfPieces: Math.max(1, weights.totalPieces),

          ProductGroup: ARAMEX_PRODUCT_GROUP,
          ProductType: ARAMEX_PRODUCT_TYPE,

          // Prepaid. Arena has already collected from the customer.
          PaymentType: "P",
          PaymentOptions: "",

          CustomsValueAmount: {
            CurrencyCode: request.customs.currency,
            Value: round2(request.customs.declaredValue),
          },

          // Arena does not sell Aramex's cash or insurance facilities.
          CashOnDeliveryAmount: null,
          InsuranceAmount: null,
          CashAdditionalAmount: null,
          CashAdditionalAmountDescription: "",
          CollectAmount: null,

          // No service codes. The receiver pays any destination duty, which is
          // Aramex's default. Free Domicile (FRDM) would bill the duty to the
          // shipper account, i.e. to Arena, so it is never sent, whatever the
          // export profile's incoterms say (business rule, 2026-10-16).
          Services: "",

          Items: toItems(request),
          AdditionalProperties: toAdditionalProperties(request, options.individualTaxId ?? null),
        },

        Attachments: [],

        ForeignHAWB: foreignHawbEnabled()
          ? toForeignHawb(request.displayReference)
          : "",

        TransportType: 0,
        PickupGUID: "",
        Number: "",
        ScheduledDelivery: null,
      },
    ],

    // Echoed back untouched. Our shipment id rides here so a response we can
    // otherwise not match has something in it that identifies the booking.
    Transaction: {
      Reference1: request.reference,
      Reference2: request.displayReference,
      Reference3: "",
      Reference4: "",
      Reference5: "",
    },
  };
}
