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
  KycDocType,
  ShipmentStatus,
  ShipmentDocType,
  PartyType,
} from "@/generated/prisma";
import type { BookingFormData, ShipmentItem } from "@/types/booking.types";
import { Decimal } from "@/generated/prisma/runtime/client";
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

  // Packages
  if (!data.items?.length) {
    fieldErrors.items = "At least one shipment item is required.";
  }

  for (const [i, item] of (data.items ?? []).entries()) {
    const w = Number(item.weightKg);
    const l = Number(item.lengthCm);
    const wd = Number(item.widthCm);
    const h = Number(item.heightCm);
    const uv = Number(item.unitValue);
    const qty = Number(item.quantity);

    if (!w || w <= 0) {
      fieldErrors[`items.${i}.weightKg`] = "Weight must be positive.";
    }
    if (!l || l <= 0) {
      fieldErrors[`items.${i}.lengthCm`] = "Length must be positive.";
    }
    if (!wd || wd <= 0) {
      fieldErrors[`items.${i}.widthCm`] = "Width must be positive.";
    }
    if (!h || h <= 0) {
      fieldErrors[`items.${i}.heightCm`] = "Height must be positive.";
    }
    if (!Number.isFinite(uv) || uv < 0) {
      fieldErrors[`items.${i}.unitValue`] = "Unit value is invalid.";
    }
    if (!Number.isFinite(qty) || qty < 1) {
      fieldErrors[`items.${i}.quantity`] = "Quantity is invalid.";
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

  // All coercions are safe here — we validated finiteness above
  const totalWeightKg = data.items.reduce(
    (sum, item) => sum + Number(item.weightKg) * Number(item.quantity),
    0,
  );

  const declaredTotal = data.items.reduce(
    (sum, item) => sum + Number(item.unitValue) * Number(item.quantity),
    0,
  );

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

async function assertKycComplete(
  orgId: string,
  declaredTotal: number,
): Promise<void> {
  const required: KycDocType[] = [KycDocType.PAN_CARD, KycDocType.ADHAR_CARD];
  if (declaredTotal > 25_000) required.push(KycDocType.IEC_CODE);

  const found = await prisma.kycDocument.findMany({
    where: { orgId, partyType: PartyType.ORG, docType: { in: required } },
    select: { docType: true },
  });

  const foundSet = new Set(found.map((d) => d.docType));
  const missing = required.filter((t) => !foundSet.has(t));

  if (missing.length > 0) {
    const labels: Record<string, string> = {
      [KycDocType.PAN_CARD]: "PAN Card",
      [KycDocType.ADHAR_CARD]: "Aadhaar Card",
      [KycDocType.IEC_CODE]: "IEC Certificate",
    };
    throw new KycIncompleteError(missing.map((t) => labels[t] ?? t).join(", "));
  }
}

// ---------------------------------------------------------------------------
// Package row builder — every field explicitly coerced with Number(...)
// before .toFixed()/Decimal, since these values may have crossed a
// client→server (JSON) boundary as strings.
// ---------------------------------------------------------------------------

function buildPackageRow(item: ShipmentItem) {
  const weightKg = toFiniteNumber(item.weightKg, "item.weightKg");
  const lengthCm = toFiniteNumber(item.lengthCm, "item.lengthCm");
  const widthCm = toFiniteNumber(item.widthCm, "item.widthCm");
  const heightCm = toFiniteNumber(item.heightCm, "item.heightCm");
  const unitValue = toFiniteNumber(item.unitValue, "item.unitValue");
  const quantity = Math.trunc(toFiniteNumber(item.quantity, "item.quantity"));

  return {
    description: item.description,
    quantity,

    lengthCm: new Decimal(lengthCm.toFixed(2)),
    widthCm: new Decimal(widthCm.toFixed(2)),
    heightCm: new Decimal(heightCm.toFixed(2)),
    weightKg: new Decimal(weightKg.toFixed(2)),

    declaredValue: unitValue > 0 ? new Decimal(unitValue.toFixed(2)) : null,

    declaredCurrency: "INR",

    hsCode: item.hsCode || null,
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
    const { totalWeightKg, declaredTotal, servicePrice } = check;

    // ── 3. KYC check ─────────────────────────────────────────────────────
    Sentry.addBreadcrumb({ message: "KYC document check", level: "info" });

    try {
      await assertKycComplete(dbOrgId, declaredTotal);
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

        // 4d. Shipment + PackageItems — created PENDING_PAYMENT, not BOOKED.
        // It only becomes BOOKED once the wallet debit below succeeds. If
        // the debit throws, this whole transaction rolls back and this row
        // never existed as far as the DB is concerned.
        const shipment = await tx.shipment.create({
          data: {
            orgId: dbOrgId,
            shipmentNumber,
            clientId: data.selectedClient?.id ?? null,

            pickupAddressId: pickupAddress.id,
            deliveryAddressId: deliveryAddress.id,
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
              create: data.items.map(buildPackageRow),
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
          itemCount: data.items.length,
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
