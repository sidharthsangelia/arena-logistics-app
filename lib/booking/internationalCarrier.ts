/**
 * INTERNATIONAL CARRIER BOOKING: SHIPMENT → CANONICAL REQUEST
 * -----------------------------------------------------------------------------
 * The translation between what we stored at booking and what an international
 * vendor needs to place an export. The sibling of ./domesticCourier.ts, and it
 * follows the same discipline for the same reasons: kept out of the Inngest
 * function so the function reads as orchestration and this reads as data.
 *
 * VALIDATION IS THE POINT OF THIS FILE. Everything it throws is a fact about the
 * booking that no number of retries will change: a consignee address with no
 * country is not a transient failure. Those come back as IntlBookingDataError,
 * which the caller turns into a permanent failure and a message ops can act on,
 * rather than four more attempts at the same refusal.
 *
 * WHAT THIS FILE DOES NOT DECIDE is which fields a given vendor requires. That
 * belongs to each adapter's preflight, because it genuinely differs: Shipmozo
 * demands an AD code, sKart never asks for one. Here we assemble; there they
 * judge.
 */

import type { Prisma } from "@/generated/prisma";
import type {
  CanonicalIntlBookingRequest,
  IntlBookingParty,
  IntlVendorDocumentRef,
} from "@/lib/booking-adapters/core/intl.types";
import type { ServiceOption } from "@/types/booking.types";
import { COUNTRY_TO_ISO } from "@/utils/data";
import {
  type ExportProfileOverride,
  resolveExportProfile,
} from "./exportProfile";

/** Bad data, not a bad connection. Never retried. */
export class IntlBookingDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntlBookingDataError";
  }
}

// ---------------------------------------------------------------------------

const ADDRESS_SELECT = {
  contactName: true,
  companyName: true,
  contactPhone: true,
  contactEmail: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  country: true,
  postalCode: true,
} satisfies Prisma.AddressSelect;

/** The export-profile columns, identical on Org and Client. */
const EXPORT_PROFILE_SELECT = {
  gstin: true,
  iecNumber: true,
  adCode: true,
  lutNumber: true,
  lutIssueDate: true,
  lutTillDate: true,
  iossNumber: true,
  defaultIncoterms: true,
  defaultExportType: true,
};

/**
 * Everything the booking job reads. Exported as one object so the job, the ops
 * retry action and this builder cannot drift into disagreeing about which
 * fields were loaded.
 */
export const INTL_CARRIER_SHIPMENT_SELECT = {
  id: true,
  shipmentNumber: true,
  orgId: true,
  mode: true,
  status: true,
  shipmentType: true,
  bookedAt: true,
  createdAt: true,

  quotedTotal: true,
  currency: true,
  totalActualWeightKg: true,
  pickupIncluded: true,

  selectedVendorId: true,
  selectedProductName: true,
  selectedCourierId: true,
  chargesSnapshot: true,
  exportProfileOverride: true,

  intlBookingVendorId: true,
  intlBookingOrderId: true,
  intlShipperId: true,
  intlVendorDocuments: true,
  intlAwbNumber: true,
  intlCarrierName: true,
  intlTrackingUrl: true,
  intlBookingStatus: true,
  intlLabelDocumentId: true,

  org: { select: { name: true, ...EXPORT_PROFILE_SELECT } },
  client: { select: { companyName: true, ...EXPORT_PROFILE_SELECT } },
  pickupAddress: { select: ADDRESS_SELECT },
  deliveryAddress: { select: ADDRESS_SELECT },
  packages: {
    select: {
      description: true,
      quantity: true,
      lengthCm: true,
      widthCm: true,
      heightCm: true,
      weightKg: true,
      declaredValue: true,
      contents: {
        select: {
          description: true,
          quantity: true,
          unitValue: true,
          hsCode: true,
        },
      },
    },
  },
} satisfies Prisma.ShipmentSelect;

export type IntlCarrierShipment = Prisma.ShipmentGetPayload<{
  select: typeof INTL_CARRIER_SHIPMENT_SELECT;
}>;

// ---------------------------------------------------------------------------

/** Prisma Decimal | number | string | null → number. */
function num(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "object" && "toNumber" in (value as object)) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value) || 0;
}

/** Free-text country → ISO alpha-2. Same rule the rate request uses. */
function toISO(country: string): string {
  const trimmed = country.trim();
  if (!trimmed) return "";
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return COUNTRY_TO_ISO[trimmed] ?? trimmed.slice(0, 2).toUpperCase();
}

type AddressRow = IntlCarrierShipment["pickupAddress"];

function toParty(address: AddressRow, label: string): IntlBookingParty {
  const phone = address.contactPhone?.trim();
  const postalCode = address.postalCode?.trim();
  const line1 = address.line1?.trim();
  const country = address.country?.trim();

  // Each of these is something a carrier physically cannot work without, and
  // each names the exact field so ops can fix it in one look.
  if (!phone) {
    throw new IntlBookingDataError(
      `The ${label} address has no phone number. International carriers refuse a consignment without one.`,
    );
  }
  if (!postalCode) {
    throw new IntlBookingDataError(
      `The ${label} address has no postcode.`,
    );
  }
  if (!line1) {
    throw new IntlBookingDataError(
      `The ${label} address has no street address.`,
    );
  }
  if (!country) {
    throw new IntlBookingDataError(
      `The ${label} address has no country, which customs paperwork cannot be raised without.`,
    );
  }

  // NOT normalised through normalizeIndianMobile, unlike the domestic builder.
  // That helper enforces a ten-digit Indian mobile, which is right for a
  // domestic courier and wrong for an overseas consignee whose number is
  // legitimately a different length with a different dialling code.
  return {
    contactName: address.contactName?.trim() || "",
    companyName: address.companyName?.trim() || null,
    phone,
    email: address.contactEmail?.trim() || null,
    line1,
    line2: address.line2?.trim() || null,
    city: address.city?.trim() || "",
    state: address.state?.trim() || "",
    stateCode: null,
    postalCode,
    countryCode: toISO(country),
    countryName: country.toUpperCase(),
  };
}

/**
 * The service the customer chose, as snapshotted at booking.
 *
 * chargesSnapshot is the ServiceOption the wizard sent, spread over a `price`.
 * It is Json in the database, so it is read defensively.
 */
export function readIntlServiceSnapshot(
  shipment: Pick<IntlCarrierShipment, "chargesSnapshot">,
): Partial<ServiceOption> {
  const snapshot = shipment.chargesSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return {};
  }
  return snapshot as Partial<ServiceOption>;
}

/** The vendor that should book this shipment: the one that quoted it. */
export function resolveIntlVendorId(
  shipment: Pick<
    IntlCarrierShipment,
    "intlBookingVendorId" | "selectedVendorId" | "chargesSnapshot"
  >,
): string | null {
  // A booking already placed belongs to whoever holds it, regardless of what
  // the quote said. Only then fall back to the selection.
  return (
    shipment.intlBookingVendorId?.trim() ||
    shipment.selectedVendorId?.trim() ||
    readIntlServiceSnapshot(shipment).vendorId?.trim() ||
    null
  );
}

function readOverride(
  shipment: Pick<IntlCarrierShipment, "exportProfileOverride">,
): ExportProfileOverride | null {
  const value = shipment.exportProfileOverride;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ExportProfileOverride;
}

/**
 * The vendor document URLs stored at booking time.
 *
 * Read defensively: it is Json, written by a previous deploy's shape, and a
 * malformed value must degrade to "no refs" rather than throw inside a booking
 * job. Entries missing a url or a kind are dropped individually, because three
 * good URLs and one bad one should still give the customer their label.
 */
export function readVendorDocumentRefs(
  shipment: Pick<IntlCarrierShipment, "intlVendorDocuments">,
): IntlVendorDocumentRef[] {
  const value = shipment.intlVendorDocuments;
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const kind = record.kind;
    const url = record.url;
    if (typeof kind !== "string" || typeof url !== "string" || !url.trim()) {
      return [];
    }
    return [{ kind: kind as IntlVendorDocumentRef["kind"], url: url.trim() }];
  });
}

/**
 * The commercial invoice number declared to customs.
 *
 * Derived from the shipment number rather than generated, and that is the whole
 * point: a retry a day later must declare the SAME invoice number as the first
 * attempt. A second attempt that invents a new one is a customs discrepancy
 * found at the border, long after anyone remembers why.
 */
export function intlInvoiceNumber(shipmentNumber: string): string {
  return `INV-${shipmentNumber}`;
}

// ---------------------------------------------------------------------------

/**
 * Build the vendor-neutral international booking request.
 *
 * `orderDate` is derived from bookedAt rather than "today" so that a retry a day
 * later still sends the date the customer actually booked on.
 */
export function buildIntlBookingRequest(
  shipment: IntlCarrierShipment,
): CanonicalIntlBookingRequest {
  if (!shipment.packages.length) {
    throw new IntlBookingDataError(
      "The shipment has no packages, so there is nothing to book.",
    );
  }

  const pickup = toParty(shipment.pickupAddress, "pickup");
  const delivery = toParty(shipment.deliveryAddress, "delivery");

  if (!delivery.countryCode) {
    throw new IntlBookingDataError(
      `Could not resolve "${shipment.deliveryAddress.country}" to a country code. Carriers route on the code, not the name.`,
    );
  }
  if (delivery.countryCode === "IN") {
    throw new IntlBookingDataError(
      "The delivery address is in India, so this is not an export and no international carrier should be booked for it.",
    );
  }
  if (!delivery.city) {
    throw new IntlBookingDataError(
      "The delivery address has no city. Carriers need one to route a consignment.",
    );
  }

  const parcels = shipment.packages.map((p) => ({
    quantity: Math.max(1, p.quantity),
    weightKg: num(p.weightKg),
    lengthCm: num(p.lengthCm),
    widthCm: num(p.widthCm),
    heightCm: num(p.heightCm),
    declaredValue: num(p.declaredValue),
    description: p.description?.trim() || null,
  }));

  // The stored total is what the customer was quoted on. Falling back to the
  // sum of the boxes covers old rows that never had one.
  const totalActualWeightKg =
    num(shipment.totalActualWeightKg) ||
    parcels.reduce((sum, p) => sum + p.weightKg * p.quantity, 0);

  if (totalActualWeightKg <= 0) {
    throw new IntlBookingDataError(
      "The shipment has no weight recorded, so no carrier can price or carry it.",
    );
  }

  // Line items keep their box number, because an international manifest is
  // itemised per box and a commercial invoice that cannot say which carton a
  // line sits in is one a customs officer will query.
  const items = shipment.packages.flatMap((p, index) =>
    p.contents.length
      ? p.contents.map((c) => ({
          name: c.description?.trim() || "Cargo",
          quantity: Math.max(1, c.quantity),
          unitValue: num(c.unitValue),
          hsCode: c.hsCode?.trim() || null,
          boxNumber: index + 1,
          category: null,
        }))
      : [
          {
            name: p.description?.trim() || "Cargo",
            quantity: Math.max(1, p.quantity),
            unitValue: num(p.declaredValue),
            hsCode: null,
            boxNumber: index + 1,
            category: null,
          },
        ],
  );

  const declaredValue = shipment.packages.reduce(
    (sum, p) =>
      sum +
      (p.contents.length
        ? p.contents.reduce(
            (s, c) => s + num(c.unitValue) * Math.max(1, c.quantity),
            0,
          )
        : num(p.declaredValue) * Math.max(1, p.quantity)),
    0,
  );

  if (declaredValue <= 0) {
    throw new IntlBookingDataError(
      "The shipment has no declared value. Customs will not clear a consignment declared as worthless.",
    );
  }

  const service = readIntlServiceSnapshot(shipment);
  const vendorId = resolveIntlVendorId(shipment);
  if (!vendorId) {
    throw new IntlBookingDataError(
      "No vendor is recorded against this booking, so there is nobody to book it with.",
    );
  }

  const exporter = resolveExportProfile({
    org: shipment.org,
    client: shipment.client,
    override: readOverride(shipment),
  });

  const orderDate = (shipment.bookedAt ?? shipment.createdAt)
    .toISOString()
    .slice(0, 10);

  return {
    reference: shipment.id,
    displayReference: shipment.shipmentNumber,
    orderDate,

    pickup,
    delivery,

    parcels,
    totalActualWeightKg,
    items,

    customs: {
      // Defaults to CSB4, the low-value courier route, when the row predates
      // the field. Never guessed upward: declaring a consignment COMMERCIAL
      // that is not commits the exporter to paperwork they have not filed.
      shipmentType: shipment.shipmentType ?? "CSB4",
      incoterms: exporter.incoterms,
      exportType: exporter.exportType,
      // FOB: the declared value is the goods alone, with freight billed
      // separately by Arena. That is how every quote in this system is built.
      termsOfInvoice: "FOB",
      invoiceNumber: intlInvoiceNumber(shipment.shipmentNumber),
      invoiceDate: orderDate,
      currency: shipment.currency || "INR",
      declaredValue,
      freightAmount: num(shipment.quotedTotal) || null,
      insuranceAmount: null,
      // Arena books on behalf of exporters rather than running a marketplace.
      ecommerce: false,
    },

    exporter,

    freightCharge: num(shipment.quotedTotal) || null,

    service: {
      vendorId,
      serviceId:
        shipment.selectedCourierId?.trim() || service.courierId?.trim() || null,
      productName: shipment.selectedProductName ?? service.productName ?? null,
    },

    arenaHandlesFirstMile: shipment.pickupIncluded,
  };
}
