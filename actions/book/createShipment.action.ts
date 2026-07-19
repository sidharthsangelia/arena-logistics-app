"use server";

/**
 * create-shipment.action.ts
 *
 * Persists a completed BookingFormData to the database as a Shipment, and
 * pays for it out of the org's Wallet.
 *
 * Write order (single $transaction — fully atomic):
 *   1. Resolve org + validate caller
 *   2. Pre-flight checks (service, packages, addresses)
 *   3. KYC check against the KycDocument table (PAN always; IEC if >₹25k)
 *  4. Generate shipment number via PostgreSQL sequence (atomic and globally unique)
 *   5. Create pickup Address (consignor)
 *   6. Create delivery Address (consignee)
 *   7. Create Shipment (status PENDING_PAYMENT) + nested PackageItems
 *   8. Create ShipmentDocument if invoice file was uploaded
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
  PartyType,
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
import { requiredKycDocTypes, KYC_DOC_CONFIGS } from "@/lib/booking/kyc";
import {
  debitWalletForShipment,
  InsufficientFundsError,
} from "@/utils/wallet/service";
import {
  generateShipmentNumber,
  ShipmentNumberSequenceError,
} from "@/utils/shipmentNumber";

// ---------------------------------------------------------------------------
// Public return type — fully JSON-serialisable
// ---------------------------------------------------------------------------

export type CreateShipmentResult =
  | { success: true; shipmentId: string; shipmentNumber: string }
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
  userId: string;
}> {
  const { userId, orgId: clerkOrgId } = await auth();
  if (!userId || !clerkOrgId) throw new AuthError("UNAUTHENTICATED");

  const org = await prisma.org.findUnique({
    where: { clerkOrgId },
    select: { id: true, markupPercent: true },
  });
  if (!org) throw new AuthError("ORG_NOT_FOUND");

  return { dbOrgId: org.id, markupPercent: org.markupPercent, userId };
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
};

type PreflightFail = {
  ok: false;
  message: string;
  fieldErrors: Record<string, string>;
};

type PreflightResult = PreflightOk | PreflightFail;

function preflight(data: BookingFormData): PreflightResult {
  const fieldErrors: Record<string, string> = {};

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

  return { ok: true, totalWeightKg, declaredTotal, servicePrice };
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

async function assertKycComplete(params: {
  orgId: string;
  clientId: string | null;
  shipmentType: ShipmentTypeValue;
}): Promise<void> {
  const { orgId, clientId, shipmentType } = params;

  // Required docs branch by shipment type (shared matrix). When booking for a
  // client (clientId set), the docs live in the CLIENT's vault, not the org's.
  const required = requiredKycDocTypes(shipmentType);

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
    let userId: string;

    try {
      const resolved = await resolveOrg();
      dbOrgId = resolved.dbOrgId;
      markupPercent = resolved.markupPercent;
      userId = resolved.userId;
      scope.setUser({ id: userId });
      scope.setTag("orgId", dbOrgId);
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
    const { totalWeightKg, servicePrice } = check;

    // ── 3. KYC check ─────────────────────────────────────────────────────
    Sentry.addBreadcrumb({ message: "KYC document check", level: "info" });

    try {
      const kycClientId =
        data.shipmentOwnerMode === "EXISTING_CLIENT" && data.selectedClient
          ? data.selectedClient.id
          : null;
      await assertKycComplete({
        orgId: dbOrgId,
        clientId: kycClientId,
        shipmentType: data.shipmentType,
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

            shipmentType: data.shipmentType,
            pickupIncluded: data.pickupIncluded,

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

            packages: {
              create: data.boxes.map((box) => buildPackageRow(box, data.currency)),
            },
          },
          select: { id: true, shipmentNumber: true },
        });

        // 4e. Invoice document (upload mode only)
        if (data.invoiceMode === "UPLOAD" && data.uploadedInvoice) {
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
        // GENERATE mode: PDF is produced async by n8n.
        // chargesSnapshot already contains the invoice items for the generator.

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

        // 4g. Atomic, race-safe wallet debit. Throws InsufficientFundsError
        // if the org's wallet can't cover servicePrice — that error
        // propagates out of this callback, and Prisma rolls back
        // everything created above (addresses, shipment, packages,
        // invoice doc, status event) automatically.
        Sentry.addBreadcrumb({
          message: `Debiting wallet ₹${servicePrice} for shipment ${shipmentNumber}`,
          level: "info",
        });

        await debitWalletForShipment(tx, dbOrgId, servicePrice, shipment.id);

        // 4h. Debit succeeded — flip to BOOKED.
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
            note: "Wallet debit successful.",
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

      return {
        success: true,
        shipmentId: txResult.shipmentId,
        shipmentNumber: txResult.shipmentNumber,
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
            requiredRupees: servicePrice,
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
