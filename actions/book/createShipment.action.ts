"use server";

/**
 * create-shipment.action.ts
 *
 * Persists a completed BookingFormData to the database as a Shipment, and
 * pays for it out of the org's Wallet.
 *
 * Books BOTH modes. The two share this action rather than getting one each,
 * because everything structural about placing a booking — auth, addresses,
 * packages, the shipment number, the wallet debit, the status events, the
 * confirmation email — is identical, and only three things actually differ:
 * which documents are required, whether there is a first-mile leg, and whether
 * cash on delivery applies. Each of those branches on `isDomestic` below,
 * derived from BookingFormData.mode.
 *
 * Note what does NOT differ: the wallet is debited for the freight in both
 * modes. On a COD domestic booking the customer still pays Arena for shipping
 * out of their wallet here; COD is Shipmozo collecting the GOODS value from the
 * receiver at the door, recorded on the row but never part of chargeTotal.
 *
 * Write order (single $transaction — fully atomic):
 *   1. Resolve org + validate caller
 *   2. Pre-flight checks (service, packages, addresses, and — domestic only —
 *      the GST paperwork, re-derived here rather than trusted from the form)
 *   3. KYC check against the KycDocument table (export matrix by shipment type
 *      internationally; Aadhaar for an individual sender domestically)
 *  4. Generate shipment number via PostgreSQL sequence (atomic and globally unique)
 *   5. Create pickup Address (consignor)
 *   6. Create delivery Address (consignee)
 *   7. Create Shipment (status PENDING_PAYMENT) + nested PackageItems
 *   8. Create ShipmentDocuments for whatever files were uploaded
 *   9. Create ShipmentStatusEvent (DRAFT → PENDING_PAYMENT)
 *  10. Atomically debit the Wallet for service.price — throws
 *      InsufficientFundsError if short, which rolls back EVERYTHING above
 *      (address rows, shipment, packages, invoice doc, status event) via
 *      the transaction. No orphaned PENDING_PAYMENT shipment is ever left
 *      behind by a failed debit.
 *  11. Flip Shipment to BOOKED, set bookedAt, log the final status event
 *
 * Sentry: withScope wraps the action; addBreadcrumb at each stage;
 * captureException on unexpected errors. Unexpected errors are ALSO
 * console.error'd — Sentry capture alone can silently swallow the real
 * message/stack in local dev if the DSN isn't configured, which made
 * previous failures show only as the generic user-facing message with no
 * way to diagnose them from the terminal.
 */

import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";

import {
  ShipmentStatus,
  ShipmentDocType,
  ShipmentMode,
  PartyType,
  FirstMileStatus,
} from "@/generated/prisma";
import type {
  BookingFormData,
  CargoBox,
  ShipmentTypeValue,
} from "@/types/booking.types";
import { Decimal } from "@/generated/prisma/runtime/client";
import {
  totalActualWeight as cargoTotalWeight,
  totalDeclaredValue as cargoDeclaredValue,
  boxDeclaredValue,
} from "@/lib/booking/cargo";
import {
  requiredKycDocTypes,
  requiredDomesticKycDocTypes,
  KYC_DOC_CONFIGS,
} from "@/lib/booking/kyc";
import {
  DOMESTIC_DOC_CONFIGS,
  domesticDocLabels,
  isCompanyParty,
  missingDomesticDocs,
} from "@/lib/booking/domesticDocs";
import { domesticCodAmount } from "@/lib/booking/domesticRequest";
import { isKycWaived } from "@/lib/booking/waiver";
import {
  debitWalletForShipment,
  InsufficientFundsError,
} from "@/utils/wallet/service";
import { invalidateWalletBalance } from "@/lib/wallet/queries";
import { updateTag } from "next/cache";
import { SHIPMENTS_LIST_TAG, SHIPMENTS_COUNTS_TAG } from "@/queries/shipments";
import {
  generateShipmentNumber,
  ShipmentNumberSequenceError,
} from "@/utils/shipmentNumber";
import { sendShipmentMilestoneEmail } from "@/lib/email/shipment/send";
import { after } from "next/server";
import { notifyBookingPlaced } from "@/lib/notifications/emit";

// ---------------------------------------------------------------------------
// Public return type — fully JSON-serialisable
// ---------------------------------------------------------------------------

export type CreateShipmentResult =
  | {
      success: true;
      shipmentId: string;
      shipmentNumber: string;
      /**
       * True when the org has payments turned off (Org.skipPayment): the
       * shipment was booked WITHOUT a wallet debit and flagged so ops collect
       * payment when the parcel reaches the hub. The success screen shows
       * different copy in this case.
       */
      paymentDeferred: boolean;
    }
  | {
      success: false;
      /** Safe to show to the user */
      message: string;
      /** Field-path → message, fed back into RHF */
      fieldErrors?: Record<string, string>;
      /**
       * Set only when the booking failed because the wallet balance was
       * too low. The UI should show a top-up prompt (prefilled with
       * shortfallRupees, editable upward) instead of a generic error.
       */
      insufficientFunds?: {
        shortfallRupees: number;
        availableRupees: number;
        requiredRupees: number;
      };
    };

// ---------------------------------------------------------------------------
// Internal error sentinel — thrown only within resolveOrg()
// ---------------------------------------------------------------------------

class AuthError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "ORG_NOT_FOUND") {
    super(code);
    this.name = "AuthError";
  }
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function resolveOrg(): Promise<{
  dbOrgId: string;
  markupPercent: Decimal;
  skipPayment: boolean;
  userId: string;
}> {
  const { userId, orgId: clerkOrgId } = await auth();
  if (!userId || !clerkOrgId) throw new AuthError("UNAUTHENTICATED");

  const org = await prisma.org.findUnique({
    where: { clerkOrgId },
    select: { id: true, markupPercent: true, skipPayment: true },
  });
  if (!org) throw new AuthError("ORG_NOT_FOUND");

  return {
    dbOrgId: org.id,
    markupPercent: org.markupPercent,
    skipPayment: org.skipPayment,
    userId,
  };
}

// ---------------------------------------------------------------------------
// Numeric coercion helpers
//
// `data` crosses a client→server boundary and `selectedService` in
// particular originates from an external rates API (getRatesAction) before
// being round-tripped through client state. Either hop can turn a number
// into a numeric string in the JSON payload. Every place downstream that
// calls `.toFixed()` or constructs a `Decimal` assumes a real `number` —
// if it isn't one, that throws a plain TypeError with NO relation to
// InsufficientFundsError or a Prisma error code, so it was falling through
// to the generic catch-all and being reported as "we couldn't save your
// shipment" even when the wallet balance was completely fine.
//
// Coercing explicitly here, with a clear error if coercion fails, makes
// that failure mode impossible and — if the data is ever genuinely bad —
// turns it into a clean fieldError instead of a crash.
// ---------------------------------------------------------------------------

function toFiniteNumber(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(
      `Expected a numeric value for ${label}, got: ${JSON.stringify(value)}`,
    );
  }
  return n;
}

// ---------------------------------------------------------------------------
// Pre-flight — discriminated union, NOT an interface union
// ---------------------------------------------------------------------------

type PreflightOk = {
  ok: true;
  totalWeightKg: number;
  declaredTotal: number;
  servicePrice: number;
  /** Door → hub charge (0 unless door pickup was opted into AND a courier chosen). */
  firstMileCharge: number;
};

type PreflightFail = {
  ok: false;
  message: string;
  fieldErrors: Record<string, string>;
};

type PreflightResult = PreflightOk | PreflightFail;

function preflight(data: BookingFormData): PreflightResult {
  const fieldErrors: Record<string, string> = {};
  const isDomestic = data.mode === "DOMESTIC";

  // Service
  if (!data.selectedService) {
    fieldErrors.selectedService = "A shipping service must be selected.";
  } else if (!Number.isFinite(Number(data.selectedService.price))) {
    fieldErrors.selectedService =
      "The selected service has an invalid price. Please re-select a rate.";
  }

  // Boxes
  if (!data.boxes?.length) {
    fieldErrors.boxes = "At least one box is required.";
  }

  for (const [bi, box] of (data.boxes ?? []).entries()) {
    const w = Number(box.weightKg);
    const l = Number(box.lengthCm);
    const wd = Number(box.widthCm);
    const h = Number(box.heightCm);
    const qty = Number(box.quantity);

    if (!w || w <= 0) fieldErrors[`boxes.${bi}.weightKg`] = "Weight must be positive.";
    if (!l || l <= 0) fieldErrors[`boxes.${bi}.lengthCm`] = "Length must be positive.";
    if (!wd || wd <= 0) fieldErrors[`boxes.${bi}.widthCm`] = "Width must be positive.";
    if (!h || h <= 0) fieldErrors[`boxes.${bi}.heightCm`] = "Height must be positive.";
    if (!Number.isFinite(qty) || qty < 1) {
      fieldErrors[`boxes.${bi}.quantity`] = "Number of boxes is invalid.";
    }

    if (!box.contents?.length) {
      fieldErrors[`boxes.${bi}.contents`] = "Add at least one item to this box.";
    }
    for (const [ii, item] of (box.contents ?? []).entries()) {
      const uv = Number(item.unitValue);
      const iqty = Number(item.quantity);
      if (!item.description?.trim()) {
        fieldErrors[`boxes.${bi}.contents.${ii}.description`] = "Description is required.";
      }
      if (!Number.isFinite(uv) || uv < 0) {
        fieldErrors[`boxes.${bi}.contents.${ii}.unitValue`] = "Value is invalid.";
      }
      if (!Number.isFinite(iqty) || iqty < 1) {
        fieldErrors[`boxes.${bi}.contents.${ii}.quantity`] = "Quantity is invalid.";
      }
    }
  }

  // Client selection
  if (data.shipmentOwnerMode === "EXISTING_CLIENT" && !data.selectedClient) {
    fieldErrors.selectedClient = "A client must be selected.";
  }

  // First mile — when door pickup is opted into, a courier must have been
  // chosen (the wizard's first-mile step enforces this, but the server is the
  // source of truth: never persist pickupIncluded without a priced courier).
  // A domestic booking has no first-mile leg at all; the whole move is one
  // door-to-door courier order, so the flag is forced off below.
  if (!isDomestic && data.pickupIncluded) {
    if (!data.firstMile) {
      fieldErrors.firstMile = "A door-pickup courier must be selected.";
    } else if (!Number.isFinite(Number(data.firstMile.price))) {
      fieldErrors.firstMile =
        "The selected pickup courier has an invalid price. Please re-select it.";
    }
  }

  if (isDomestic) {
    // The destination must be in India. The wizard never offers a country
    // picker on a domestic booking, so this can only trip on a hand-edited
    // payload — but a foreign address on a domestic courier order is a
    // shipment nobody can deliver, so it is refused rather than trusted.
    const country = (data.consignee?.country ?? "").trim().toLowerCase();
    if (country && country !== "india" && country !== "in") {
      fieldErrors["consignee.country"] =
        "Domestic shipments can only be delivered within India.";
    }

    // GST paperwork. Re-derived here from the same rules the form used, rather
    // than trusting that the form asked for the right things: which documents
    // apply is a function of the company-name fields and the declared value,
    // and all three arrive in the same payload a browser could have edited.
    const missing = missingDomesticDocs(data);
    if (missing.length > 0) {
      fieldErrors.domesticDocs = `Missing required documents: ${domesticDocLabels(missing)}.`;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: "Some required fields are missing or invalid.",
      fieldErrors,
    };
  }

  // All coercions are safe here — we validated finiteness above.
  const totalWeightKg = cargoTotalWeight(data.boxes);
  const declaredTotal = cargoDeclaredValue(data.boxes);

  const servicePrice = Number(data.selectedService!.price);
  // A domestic booking has no first-mile leg, so it never carries a first-mile
  // charge even if a stale one survived in the payload.
  const firstMileCharge =
    !isDomestic && data.pickupIncluded && data.firstMile
      ? Number(data.firstMile.price)
      : 0;

  return { ok: true, totalWeightKg, declaredTotal, servicePrice, firstMileCharge };
}

// ---------------------------------------------------------------------------
// KYC check — queries DB, not the form payload
// ---------------------------------------------------------------------------

class KycIncompleteError extends Error {
  constructor(public readonly missingLabels: string) {
    super(`Required KYC documents not on file: ${missingLabels}`);
    this.name = "KycIncompleteError";
  }
}

/**
 * Returns whether the booking passed under a KYC waiver, so the shipment row can
 * record it. Throws KycIncompleteError when documents are genuinely missing.
 */
async function assertKycComplete(params: {
  orgId: string;
  clientId: string | null;
  shipmentType: ShipmentTypeValue;
  isDomestic: boolean;
  senderIsCompany: boolean;
}): Promise<boolean> {
  const { orgId, clientId, shipmentType, isDomestic, senderIsCompany } = params;

  // THE WAIVER IS READ HERE, FROM THE DATABASE.
  //
  // The wizard was told about it too, but only so the form could ask for the
  // right documents. Nothing in the submitted payload can turn this on: a
  // browser that lies about being waived arrives at exactly this query and is
  // told which documents it is still missing. Same reason the document check
  // below queries the vault instead of trusting the FileMeta in the form.
  const waived = await isKycWaived(
    clientId
      ? { partyType: "CLIENT", clientId }
      : { partyType: "ORG", orgId },
  );

  // Which documents are required.
  //
  //  • International — the export matrix keyed by shipment type, collapsing to
  //    Aadhaar alone under a live waiver.
  //
  //  • Domestic — the export matrix does not apply, because nothing clears
  //    customs. It is an Aadhaar for an individual sender and nothing at all
  //    for a company one (identified instead by the tax invoice it must
  //    attach). A waiver changes nothing here: the domestic list is already
  //    Aadhaar-only, and Aadhaar is the one document a waiver can never remove.
  //
  // Either way, when booking for a client the docs live in the CLIENT's vault,
  // not the org's.
  const required = isDomestic
    ? requiredDomesticKycDocTypes(senderIsCompany)
    : requiredKycDocTypes(shipmentType, waived);

  if (required.length === 0) return waived;

  const where = clientId
    ? { clientId, partyType: PartyType.CLIENT, docType: { in: required } }
    : { orgId, partyType: PartyType.ORG, docType: { in: required } };

  const found = await prisma.kycDocument.findMany({
    where,
    select: { docType: true },
  });

  const foundSet = new Set(found.map((d) => d.docType));
  const missing = required.filter((t) => !foundSet.has(t));

  if (missing.length > 0) {
    const labels = Object.fromEntries(
      KYC_DOC_CONFIGS.map((c) => [c.docType, c.label]),
    ) as Record<string, string>;
    throw new KycIncompleteError(missing.map((t) => labels[t] ?? t).join(", "));
  }

  return waived;
}

// ---------------------------------------------------------------------------
// Package (box) row builder — one PackageItem per box, with its items nested
// as PackageContentItem rows. Every numeric field is coerced with Number(...)
// before .toFixed()/Decimal, since these values may have crossed a
// client→server (JSON) boundary as strings.
// ---------------------------------------------------------------------------

function buildPackageRow(box: CargoBox, currency: string) {
  const weightKg = toFiniteNumber(box.weightKg, "box.weightKg");
  const lengthCm = toFiniteNumber(box.lengthCm, "box.lengthCm");
  const widthCm = toFiniteNumber(box.widthCm, "box.widthCm");
  const heightCm = toFiniteNumber(box.heightCm, "box.heightCm");
  const quantity = Math.trunc(toFiniteNumber(box.quantity, "box.quantity"));

  // Declared value of one box's contents (not multiplied by box quantity —
  // that multiplication lives on the box's own `quantity`).
  const boxValue = boxDeclaredValue(box);

  const description =
    box.contents
      .map((c) => c.description)
      .filter(Boolean)
      .join(", ") || "Package";
  const boxHsCode = box.contents.find((c) => c.hsCode)?.hsCode || null;

  return {
    description,
    quantity,

    lengthCm: new Decimal(lengthCm.toFixed(2)),
    widthCm: new Decimal(widthCm.toFixed(2)),
    heightCm: new Decimal(heightCm.toFixed(2)),
    weightKg: new Decimal(weightKg.toFixed(2)),

    declaredValue: boxValue > 0 ? new Decimal(boxValue.toFixed(2)) : null,
    declaredCurrency: currency,
    hsCode: boxHsCode,

    contents: {
      create: box.contents.map((c) => ({
        description: c.description,
        hsCode: c.hsCode || null,
        quantity: Math.trunc(toFiniteNumber(c.quantity, "item.quantity")),
        unitValue: new Decimal(
          toFiniteNumber(c.unitValue, "item.unitValue").toFixed(2),
        ),
        currency,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Main action
// ---------------------------------------------------------------------------

export async function createShipmentAction(
  data: BookingFormData,
): Promise<CreateShipmentResult> {
  return Sentry.withScope(async (scope) => {
    scope.setTag("action", "createShipment");

    // ── 1. Auth ───────────────────────────────────────────────────────────
    let dbOrgId: string;
    let markupPercent: Decimal;
    let skipPayment: boolean;
    let userId: string;

    try {
      const resolved = await resolveOrg();
      dbOrgId = resolved.dbOrgId;
      markupPercent = resolved.markupPercent;
      skipPayment = resolved.skipPayment;
      userId = resolved.userId;
      scope.setUser({ id: userId });
      scope.setTag("orgId", dbOrgId);
      scope.setTag("skipPayment", String(skipPayment));
    } catch (err) {
      if (err instanceof AuthError) {
        if (err.code === "UNAUTHENTICATED") {
          return {
            success: false,
            message: "You must be signed in to create a shipment.",
          };
        }
        return {
          success: false,
          message: "Organisation not found. Please contact support.",
        };
      }
      console.error("[createShipmentAction] auth error:", err);
      Sentry.captureException(err, { tags: { step: "auth" } });
      return {
        success: false,
        message: "Authentication error. Please try again.",
      };
    }

    // ── 2. Pre-flight ─────────────────────────────────────────────────────
    Sentry.addBreadcrumb({ message: "Pre-flight validation", level: "info" });

    // Both derived, never trusted from a separate field the payload could have
    // set independently of the addresses it is supposed to describe.
    const isDomestic = data.mode === "DOMESTIC";
    const senderIsCompany = isCompanyParty(data.consignor ?? {});
    scope.setTag("shipmentMode", isDomestic ? "DOMESTIC" : "INTERNATIONAL");

    const check = preflight(data);
    if (!check.ok) {
      // TypeScript now correctly narrows to PreflightFail here
      return {
        success: false,
        message: check.message,
        fieldErrors: check.fieldErrors,
      };
    }

    // Narrowed to PreflightOk — all properties are safely accessible and
    // guaranteed to be real finite numbers from here on.
    const { totalWeightKg, servicePrice, firstMileCharge } = check;

    // The wallet is debited for the full booking total: the international
    // service plus the door → hub first-mile leg (0 when pickup wasn't opted
    // into). Both prices already have the org markup applied by their rate
    // actions, so this is a straight sum.
    const chargeTotal = servicePrice + firstMileCharge;

    // ── 3. KYC check ─────────────────────────────────────────────────────
    Sentry.addBreadcrumb({ message: "KYC document check", level: "info" });

    // Set when the booking cleared KYC on a waiver rather than a full document
    // set. Snapshotted onto the shipment below, because the waiver expires and
    // ops still needs to know afterwards which shipments went out on one.
    let kycWaivedAtBooking = false;

    try {
      const kycClientId =
        data.shipmentOwnerMode === "EXISTING_CLIENT" && data.selectedClient
          ? data.selectedClient.id
          : null;
      kycWaivedAtBooking = await assertKycComplete({
        orgId: dbOrgId,
        clientId: kycClientId,
        shipmentType: data.shipmentType,
        isDomestic,
        senderIsCompany,
      });
    } catch (err) {
      if (err instanceof KycIncompleteError) {
        return { success: false, message: err.message };
      }
      console.error("[createShipmentAction] KYC check error:", err);
      Sentry.captureException(err, { tags: { step: "kycCheck" } });
      return {
        success: false,
        message: "Could not verify KYC documents. Please try again.",
      };
    }

    // ── 4. Shipment creation flow ────────────────────────────────────────
    Sentry.addBreadcrumb({ message: "Opening DB transaction", level: "info" });

    // service is guaranteed non-null — preflight would have returned early
    const service = data.selectedService!;

    // Door pickup is an INTERNATIONAL concept: it is the door → hub leg that
    // feeds the air carrier. A domestic booking is already door to door, so the
    // flag is forced off here rather than trusted from the payload, and every
    // firstMile* column below reads this instead of data.pickupIncluded.
    const pickupIncluded = isDomestic ? false : data.pickupIncluded;

    // Recipient snapshot for the customer-facing status emails. For a BA org
    // booking on behalf of a client, the real sender is the CLIENT; otherwise
    // it is the consignor entered in the wizard. Frozen onto the Shipment so
    // later status emails need no re-derivation. (See Shipment.senderEmail.)
    const bookingForClient =
      data.shipmentOwnerMode === "EXISTING_CLIENT" && data.selectedClient
        ? data.selectedClient
        : null;
    const senderEmail =
      (bookingForClient?.email || data.consignor.email || "").trim() || null;
    const senderName =
      (bookingForClient?.contactName ||
        bookingForClient?.companyName ||
        data.consignor.contactName ||
        "").trim() || null;

    let shipmentNumber: string;

    try {

        shipmentNumber = await generateShipmentNumber();

      const txResult = await prisma.$transaction(async (tx) => {
        // 4a. Log allocated shipment number

        Sentry.addBreadcrumb({
          message: `Shipment number: ${shipmentNumber}`,
          level: "info",
        });

        // 4b. Pickup address — the sender's address unless the user entered a
        // separate pickup location (pickupSameAsSender === false). Falls back
        // to the sender if pickup data is somehow absent (e.g. an old draft).
        const pickupSource =
          !data.pickupSameAsSender && data.pickup
            ? data.pickup
            : data.consignor;

        const pickupAddress = await tx.address.create({
          data: {
            orgId: dbOrgId,
            kind: "PICKUP",
            contactName: pickupSource.contactName,
            companyName: pickupSource.companyName?.trim() || null,
            contactPhone: pickupSource.phone || null,
            contactEmail: pickupSource.email || null,
            line1: pickupSource.addressLine1,
            line2: pickupSource.addressLine2 || null,
            city: pickupSource.city,
            state: pickupSource.state || null,
            country: pickupSource.country,
            postalCode: pickupSource.postalCode,
            isDefault: false,
          },
          select: { id: true },
        });

        // 4c. Delivery address (consignee → receiver)
        const deliveryAddress = await tx.address.create({
          data: {
            orgId: dbOrgId,
            kind: "DELIVERY",
            contactName: data.consignee.contactName,
            companyName: data.consignee.companyName?.trim() || null,
            contactPhone: data.consignee.phone || null,
            contactEmail: data.consignee.email || null,
            line1: data.consignee.addressLine1,
            line2: data.consignee.addressLine2 || null,
            city: data.consignee.city,
            state: data.consignee.state || null,
            country: data.consignee.country,
            postalCode: data.consignee.postalCode,
            isDefault: false,
          },
          select: { id: true },
        });

        // 4c-ii. Billing address — only when it differs from delivery.
        // Otherwise billingSameAsDelivery=true and billing is read from the
        // delivery address at invoice/display time (no separate row needed).
        let billingAddressId: string | null = null;
        if (!data.billingSameAsDelivery && data.billing) {
          const billingAddress = await tx.address.create({
            data: {
              orgId: dbOrgId,
              kind: "BILLING",
              contactName: data.billing.contactName,
              companyName: data.billing.companyName?.trim() || null,
              contactPhone: data.billing.phone || null,
              contactEmail: data.billing.email || null,
              line1: data.billing.addressLine1,
              line2: data.billing.addressLine2 || null,
              city: data.billing.city,
              state: data.billing.state || null,
              country: data.billing.country,
              postalCode: data.billing.postalCode,
              isDefault: false,
            },
            select: { id: true },
          });
          billingAddressId = billingAddress.id;
        }

        // 4d. Shipment + PackageItems — created PENDING_PAYMENT, not BOOKED.
        // It only becomes BOOKED once the wallet debit below succeeds. If
        // the debit throws, this whole transaction rolls back and this row
        // never existed as far as the DB is concerned.
        const shipment = await tx.shipment.create({
          data: {
            orgId: dbOrgId,
            shipmentNumber,
            clientId: data.selectedClient?.id ?? null,

            senderEmail,
            senderName,

            mode: isDomestic ? ShipmentMode.DOMESTIC : ShipmentMode.INTERNATIONAL,

            // The customs category exists only on an export. Writing CSB4 onto
            // a domestic row would make it read, everywhere it is displayed, as
            // a shipment that clears customs.
            shipmentType: isDomestic ? null : data.shipmentType,
            kycWaivedAtBooking,

            // Cash on delivery: the courier collects the declared goods value
            // from the receiver and Shipmozo remits it. Recorded here so ops
            // can see it and so the courier push can set it; it is deliberately
            // NOT part of what the wallet is debited below, which is the
            // freight and nothing else.
            codEnabled: isDomestic && data.codEnabled,
            codAmount:
              isDomestic && data.codEnabled
                ? new Decimal(domesticCodAmount(data).toFixed(2))
                : null,

            // A domestic booking is a single door-to-door courier move, so
            // there is no separate first leg to record.
            pickupIncluded,

            // First-mile (door → hub) snapshot — only when opted in. Priced
            // with the org markup already applied by getDomesticRatesAction and
            // frozen here so later rate/markup changes don't rewrite history.
            firstMileVendorId:
              pickupIncluded && data.firstMile ? data.firstMile.vendorId : null,
            firstMileVendorName:
              pickupIncluded && data.firstMile ? data.firstMile.productName : null,
            firstMileCharge:
              pickupIncluded && firstMileCharge > 0
                ? new Decimal(firstMileCharge.toFixed(2))
                : null,
            firstMileHubLabel:
              pickupIncluded ? data.firstMileHubLabel ?? null : null,
            firstMileChargeSnapshot:
              pickupIncluded && data.firstMile
                ? ({ ...data.firstMile, price: firstMileCharge } as unknown as object)
                : undefined,

            // Door-pickup shipments enter the first-mile leg at SCHEDULED; ops
            // advance it by hand from the booking page. Left null when there is
            // no door pickup, so the leg's UI never shows on those shipments.
            firstMileStatus: pickupIncluded
              ? FirstMileStatus.SCHEDULED
              : null,
            firstMileStatusUpdatedAt: pickupIncluded ? new Date() : null,

            pickupAddressId: pickupAddress.id,
            deliveryAddressId: deliveryAddress.id,
            billingAddressId,
            billingSameAsDelivery: data.billingSameAsDelivery,

            totalActualWeightKg: new Decimal(totalWeightKg.toFixed(2)),
            totalChargeableWeightKg: null, // carrier calculates this later

            selectedVendorId: service.vendorId,
            selectedVendorName: service.vendorName,
            selectedProductName: service.productName,

            markupPercentApplied: markupPercent,
            quotedTotal: new Decimal(servicePrice.toFixed(2)),
            currency: service.currency,

            // Immutable snapshot — price + service locked at booking time
            chargesSnapshot: {
              ...service,
              price: servicePrice,
            } as unknown as object,

            status: ShipmentStatus.PENDING_PAYMENT,

            // Orgs with payments turned off (Org.skipPayment) book without a
            // wallet debit; ops collect the charge when the parcel reaches the
            // hub. The flag lets ops filter these "payment pending" bookings.
            paymentDeferred: skipPayment,

            packages: {
              create: data.boxes.map((box) => buildPackageRow(box, data.currency)),
            },
          },
          select: { id: true, shipmentNumber: true },
        });

        // 4e. Documents.
        //
        // Domestic: the GST paperwork the customer attached — a tax invoice, an
        // e-way bill, a delivery challan. Every one of them is optional to
        // STORE (preflight above has already refused the booking if a required
        // one was absent), so this loop simply persists whatever is there.
        // Nothing is generated: Arena does not raise GST invoices on a
        // customer's behalf.
        //
        // International: the commercial invoice, when the customer uploaded
        // their own. In GENERATE mode the PDF is produced async by n8n, and
        // chargesSnapshot already carries the invoice items for the generator.
        if (isDomestic) {
          const docRows = DOMESTIC_DOC_CONFIGS.flatMap((config) => {
            const file = data.domesticDocs?.[config.key];
            if (!file) return [];
            return [
              {
                shipmentId: shipment.id,
                docType: config.docType,
                label: config.label,
                fileUrl: file.fileUrl,
                fileKey: file.fileKey,
                fileName: file.fileName,
                fileSize: file.fileSize,
                mimeType: file.mimeType,
                uploadedByType: "ORG" as const,
                uploadedById: userId,
              },
            ];
          });
          if (docRows.length > 0) {
            await tx.shipmentDocument.createMany({ data: docRows });
          }
        } else if (data.invoiceMode === "UPLOAD" && data.uploadedInvoice) {
          await tx.shipmentDocument.create({
            data: {
              shipmentId: shipment.id,
              docType: ShipmentDocType.INVOICE,
              label: "Commercial Invoice",
              fileUrl: data.uploadedInvoice.fileUrl,
              fileKey: data.uploadedInvoice.fileKey,
              fileName: data.uploadedInvoice.fileName,
              fileSize: data.uploadedInvoice.fileSize,
              mimeType: data.uploadedInvoice.mimeType,
              uploadedByType: "ORG",
              uploadedById: userId,
            },
          });
        }

        // 4f. Status event — DRAFT → PENDING_PAYMENT
        await tx.shipmentStatusEvent.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: ShipmentStatus.DRAFT,
            toStatus: ShipmentStatus.PENDING_PAYMENT,
            note: "Booking submitted via booking wizard.",
            changedByType: "ORG",
            changedById: userId,
          },
        });

        // 4g. Payment. Two mutually exclusive paths:
        //
        //   • skipPayment orgs — NO wallet debit. The shipment is booked with
        //     paymentDeferred=true (set above) and ops collect the charge at
        //     the hub. This is the ONLY path that must never touch the wallet.
        //
        //   • everyone else — atomic, race-safe wallet debit. Throws
        //     InsufficientFundsError if the wallet can't cover chargeTotal;
        //     that error propagates out of this callback and Prisma rolls back
        //     everything created above (addresses, shipment, packages, invoice
        //     doc, status event) automatically. No orphaned PENDING_PAYMENT
        //     row is ever left behind.
        if (skipPayment) {
          Sentry.addBreadcrumb({
            message: `Payment deferred (skipPayment org) — booking ${shipmentNumber} without debit`,
            level: "info",
          });
        } else {
          Sentry.addBreadcrumb({
            message: `Debiting wallet ₹${chargeTotal} (service ₹${servicePrice} + first-mile ₹${firstMileCharge}) for shipment ${shipmentNumber}`,
            level: "info",
          });
          await debitWalletForShipment(tx, dbOrgId, chargeTotal, shipment.id);
        }

        // 4h. Payment resolved — flip to BOOKED.
        await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            status: ShipmentStatus.BOOKED,
            bookedAt: new Date(),
          },
        });

        await tx.shipmentStatusEvent.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: ShipmentStatus.PENDING_PAYMENT,
            toStatus: ShipmentStatus.BOOKED,
            note: skipPayment
              ? "Booked with payment deferred — to be collected at hub."
              : "Wallet debit successful.",
            changedByType: "SYSTEM",
          },
        });

        return {
          shipmentId: shipment.id,
          shipmentNumber: shipment.shipmentNumber,
        };
      });

      // ── 5. Success ──────────────────────────────────────────────────────
      Sentry.addBreadcrumb({
        message: `Shipment created: ${txResult.shipmentNumber}`,
        level: "info",
        data: { shipmentId: txResult.shipmentId },
      });

      // The header wallet chip caches the balance with no expiry, so the debit
      // above is only reflected if this runs. See the CONTRACT note in
      // lib/wallet/queries.ts. Safe when skipPayment left the balance untouched
      // — an invalidation with nothing to change simply re-reads the same value.
      invalidateWalletBalance(dbOrgId);

      // The new booking should show up on the tenant's /shipments list (and
      // its stat cards) right away rather than waiting out the cache TTL.
      updateTag(SHIPMENTS_LIST_TAG);
      updateTag(SHIPMENTS_COUNTS_TAG);

      // Booking confirmation email to the sender. Fired only after the booking
      // is durably committed. sendShipmentMilestoneEmail never throws, so a
      // failed send can never turn a successful booking into an error.
      await sendShipmentMilestoneEmail(txResult.shipmentId, ShipmentStatus.BOOKED);

      // Ops needs to know work has arrived. Scheduled with `after` rather than
      // awaited, because the customer waiting on their booking confirmation should
      // not also be waiting on a row being written for somebody else to read.
      after(() => notifyBookingPlaced(txResult.shipmentId));

      return {
        success: true,
        shipmentId: txResult.shipmentId,
        shipmentNumber: txResult.shipmentNumber,
        paymentDeferred: skipPayment,
      };
    } catch (err) {
      // Insufficient wallet balance — not a bug, not reported to Sentry.
      // Return a structured shape the UI uses to show a top-up prompt.

      if (err instanceof ShipmentNumberSequenceError) {
        console.error("[createShipmentAction] shipment sequence error:", err);

        return {
          success: false,
          message:
            "Shipment numbering is not configured correctly. Please contact support.",
        };
      }
      if (err instanceof InsufficientFundsError) {
        Sentry.addBreadcrumb({
          message: `Insufficient funds — short by ₹${err.shortfallRupees.toFixed(2)}`,
          level: "info",
        });
        return {
          success: false,
          message: `Insufficient wallet balance. You're short by ₹${err.shortfallRupees.toFixed(2)}.`,
          insufficientFunds: {
            shortfallRupees: Math.ceil(err.shortfallRupees),
            availableRupees: err.availableRupees,
            requiredRupees: chargeTotal,
          },
        };
      }
      // Anything else lands here. This is the branch that was previously
      // producing "We couldn't save your shipment" with zero visibility
      // into WHY. console.error now makes the real error/stack visible in
      // the server terminal immediately, in addition to Sentry.
      console.error(
        "[createShipmentAction] unexpected error in transaction:",
        err,
      );

      Sentry.captureException(err, {
        tags: { step: "dbTransaction", orgId: dbOrgId },
        extra: {
          shipmentOwnerMode: data.shipmentOwnerMode,
          boxCount: data.boxes.length,
          selectedVendor: data.selectedService?.vendorId,
          servicePrice,
        },
      });

      return {
        success: false,
        message:
          "We couldn't save your shipment. Our team has been notified. Please try again.",
      };
    }
  });
}
