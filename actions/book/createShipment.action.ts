"use server";

/**
 * create-shipment.action.ts
 *
 * Persists a completed BookingFormData to the database as a Shipment.
 *
 * Write order (single $transaction — fully atomic):
 *   1. Resolve org + validate caller
 *   2. Pre-flight checks (service, packages, addresses)
 *   3. KYC check against the KycDocument table (PAN always; IEC if >₹25k)
 *   4. Generate shipment number — SHP-YYYY-NNNNN (race-safe inside txn)
 *   5. Create pickup Address (consignor)
 *   6. Create delivery Address (consignee)
 *   7. Create Shipment + nested PackageItems
 *   8. Create ShipmentDocument if invoice file was uploaded
 *   9. Create initial ShipmentStatusEvent (DRAFT → BOOKED)
 *
 * Sentry: withScope wraps the action; addBreadcrumb at each stage;
 * captureException on unexpected errors.
 */

import * as Sentry from "@sentry/nextjs";
import { auth }    from "@clerk/nextjs/server";
import { prisma }  from "@/utils/db";
 
import {
  KycDocType,
  ShipmentStatus,
  ShipmentDocType,
  PartyType,
} from "@/generated/prisma";

import type { BookingFormData, PackageForm } from "@/types/booking.types";
import { Decimal } from "@/generated/prisma/runtime/client";

// ---------------------------------------------------------------------------
// Public return type — fully JSON-serialisable
// ---------------------------------------------------------------------------

export type CreateShipmentResult =
  | { success: true;  shipmentId: string; shipmentNumber: string }
  | {
      success: false;
      /** Safe to show to the user */
      message: string;
      /** Field-path → message, fed back into RHF */
      fieldErrors?: Record<string, string>;
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
    where:  { clerkOrgId },
    select: { id: true, markupPercent: true },
  });
  if (!org) throw new AuthError("ORG_NOT_FOUND");

  return { dbOrgId: org.id, markupPercent: org.markupPercent, userId };
}

// ---------------------------------------------------------------------------
// Pre-flight — discriminated union, NOT an interface union
// ---------------------------------------------------------------------------

type PreflightOk = {
  ok: true;
  totalWeightKg: number;
  declaredTotal: number;
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
  }

  // Packages
  if (!data.packages.length) {
    fieldErrors.packages = "At least one package is required.";
  }

  for (const [i, pkg] of data.packages.entries()) {
    // Coerce to number — RHF input values may arrive as strings at runtime
    const w  = Number(pkg.weightKg);
    const l  = Number(pkg.lengthCm);
    const wd = Number(pkg.widthCm);
    const h  = Number(pkg.heightCm);
    if (!w  || w  <= 0) fieldErrors[`packages[${i}].weightKg`] = "Weight must be positive.";
    if (!l  || l  <= 0) fieldErrors[`packages[${i}].lengthCm`] = "Length must be positive.";
    if (!wd || wd <= 0) fieldErrors[`packages[${i}].widthCm`]  = "Width must be positive.";
    if (!h  || h  <= 0) fieldErrors[`packages[${i}].heightCm`] = "Height must be positive.";
  }

  // Sender
  if (!data.consignor.contactName?.trim())
    fieldErrors["consignor.contactName"]  = "Sender name is required.";
  if (!data.consignor.addressLine1?.trim())
    fieldErrors["consignor.addressLine1"] = "Sender address is required.";
  if (!data.consignor.country?.trim())
    fieldErrors["consignor.country"]      = "Sender country is required.";

  // Receiver
  if (!data.consignee.contactName?.trim())
    fieldErrors["consignee.contactName"]  = "Receiver name is required.";
  if (!data.consignee.addressLine1?.trim())
    fieldErrors["consignee.addressLine1"] = "Receiver address is required.";
  if (!data.consignee.country?.trim())
    fieldErrors["consignee.country"]      = "Receiver country is required.";

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

  // All coercions are safe here — we validated > 0 above
  const totalWeightKg = data.packages.reduce(
    (sum, p) => sum + Number(p.weightKg) * Number(p.quantity),
    0,
  );
  const declaredTotal = data.packages.reduce(
    (sum, p) => sum + Number(p.declaredValue) * Number(p.quantity),
    0,
  );

  return { ok: true, totalWeightKg, declaredTotal };
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

async function assertKycComplete(orgId: string, declaredTotal: number): Promise<void> {
  const required: KycDocType[] = [KycDocType.PAN_CARD, KycDocType.ADHAR_CARD];
  if (declaredTotal > 25_000) required.push(KycDocType.IEC_CODE);

  const found = await prisma.kycDocument.findMany({
    where: { orgId, partyType: PartyType.ORG, docType: { in: required } },
    select: { docType: true },
  });

  const foundSet = new Set(found.map((d) => d.docType));
  const missing  = required.filter((t) => !foundSet.has(t));

  if (missing.length > 0) {
    const labels: Record<string, string> = {
      [KycDocType.PAN_CARD]:   "PAN Card",
      [KycDocType.ADHAR_CARD]: "Aadhaar Card",
      [KycDocType.IEC_CODE]:   "IEC Certificate",
    };
    throw new KycIncompleteError(missing.map((t) => labels[t] ?? t).join(", "));
  }
}

// ---------------------------------------------------------------------------
// Shipment number — race-safe (runs inside the transaction)
// ---------------------------------------------------------------------------

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function generateShipmentNumber(tx: PrismaTx, orgId: string): Promise<string> {
  const year   = new Date().getFullYear();
  const prefix = `SHP-${year}-`;

  const count = await tx.shipment.count({
    where: { orgId, shipmentNumber: { startsWith: prefix } },
  });

  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Package row builder — all field values coerced to number defensively
// ---------------------------------------------------------------------------

function buildPackageRow(pkg: PackageForm) {
  const lengthCm      = Number(pkg.lengthCm);
  const widthCm       = Number(pkg.widthCm);
  const heightCm      = Number(pkg.heightCm);
  const weightKg      = Number(pkg.weightKg);
  const quantity      = Number(pkg.quantity);
  const declaredValue = Number(pkg.declaredValue);

  return {
    description:      pkg.description,
    quantity,
    lengthCm:         new Decimal(lengthCm.toFixed(2)),
    widthCm:          new Decimal(widthCm.toFixed(2)),
    heightCm:         new Decimal(heightCm.toFixed(2)),
    weightKg:         new Decimal(weightKg.toFixed(2)),
    declaredValue:    declaredValue > 0 ? new Decimal(declaredValue.toFixed(2)) : null,
    declaredCurrency: "INR",
    hsCode:           pkg.hsCode?.trim() || null,
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
      dbOrgId       = resolved.dbOrgId;
      markupPercent = resolved.markupPercent;
      userId        = resolved.userId;
      scope.setUser({ id: userId });
      scope.setTag("orgId", dbOrgId);
    } catch (err) {
      if (err instanceof AuthError) {
        if (err.code === "UNAUTHENTICATED") {
          return { success: false, message: "You must be signed in to create a shipment." };
        }
        return { success: false, message: "Organisation not found. Please contact support." };
      }
      Sentry.captureException(err, { tags: { step: "auth" } });
      return { success: false, message: "Authentication error. Please try again." };
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

    // Narrowed to PreflightOk — both properties are safely accessible
    const { totalWeightKg, declaredTotal } = check;

    // ── 3. KYC check ─────────────────────────────────────────────────────
    Sentry.addBreadcrumb({ message: "KYC document check", level: "info" });

    try {
      await assertKycComplete(dbOrgId, declaredTotal);
    } catch (err) {
      if (err instanceof KycIncompleteError) {
        return { success: false, message: err.message };
      }
      Sentry.captureException(err, { tags: { step: "kycCheck" } });
      return { success: false, message: "Could not verify KYC documents. Please try again." };
    }

    // ── 4. Atomic DB write ────────────────────────────────────────────────
    Sentry.addBreadcrumb({ message: "Opening DB transaction", level: "info" });

    // service is guaranteed non-null — preflight would have returned early
    const service = data.selectedService!;

    try {
      const txResult = await prisma.$transaction(async (tx) => {

        // 4a. Shipment number
        const shipmentNumber = await generateShipmentNumber(tx, dbOrgId);
        Sentry.addBreadcrumb({
          message: `Shipment number: ${shipmentNumber}`,
          level: "info",
        });

        // 4b. Pickup address (consignor → sender)
        const pickupAddress = await tx.address.create({
          data: {
            orgId:        dbOrgId,
            kind:         "PICKUP",
            contactName:  data.consignor.contactName,
            contactPhone: data.consignor.phone   || null,
            line1:        data.consignor.addressLine1,
            line2:        data.consignor.addressLine2 || null,
            city:         data.consignor.city,
            state:        data.consignor.state   || null,
            country:      data.consignor.country,
            postalCode:   data.consignor.postalCode,
            isDefault:    false,
          },
          select: { id: true },
        });

        // 4c. Delivery address (consignee → receiver)
        const deliveryAddress = await tx.address.create({
          data: {
            orgId:        dbOrgId,
            kind:         "DELIVERY",
            contactName:  data.consignee.contactName,
            contactPhone: data.consignee.phone   || null,
            line1:        data.consignee.addressLine1,
            line2:        data.consignee.addressLine2 || null,
            city:         data.consignee.city,
            state:        data.consignee.state   || null,
            country:      data.consignee.country,
            postalCode:   data.consignee.postalCode,
            isDefault:    false,
          },
          select: { id: true },
        });

        // 4d. Shipment + PackageItems
        const shipment = await tx.shipment.create({
          data: {
            orgId:            dbOrgId,
            shipmentNumber,
            clientId:         data.selectedClient?.id ?? null,

            pickupAddressId:      pickupAddress.id,
            deliveryAddressId:    deliveryAddress.id,
            billingSameAsDelivery: data.billingSameAsDelivery,

            totalActualWeightKg:     new Decimal(totalWeightKg.toFixed(2)),
            totalChargeableWeightKg: null, // carrier calculates this later

            selectedVendorId:    service.vendorId,
            selectedVendorName:  service.vendorName,
            selectedProductName: service.productName,

            markupPercentApplied: markupPercent,
            quotedTotal:          new Decimal(service.price.toFixed(2)),
            currency:             service.currency,

            // Immutable snapshot — price + service locked at booking time
            chargesSnapshot: service as unknown as object,

            status: ShipmentStatus.BOOKED,

            packages: {
              create: data.packages.map(buildPackageRow),
            },
          },
          select: { id: true, shipmentNumber: true },
        });

        // 4e. Invoice document (upload mode only)
        if (data.invoiceMode === "UPLOAD" && data.uploadedInvoice) {
          await tx.shipmentDocument.create({
            data: {
              shipmentId:     shipment.id,
              docType:        ShipmentDocType.INVOICE,
              label:          "Commercial Invoice",
              fileUrl:        data.uploadedInvoice.fileUrl,
              fileKey:        data.uploadedInvoice.fileKey,
              fileName:       data.uploadedInvoice.fileName,
              fileSize:       data.uploadedInvoice.fileSize,
              mimeType:       data.uploadedInvoice.mimeType,
              uploadedByType: "ORG",
              uploadedById:   userId,
            },
          });
        }
        // GENERATE mode: PDF is produced async by n8n.
        // chargesSnapshot already contains the invoice items for the generator.

        // 4f. Initial status event
        await tx.shipmentStatusEvent.create({
          data: {
            shipmentId:    shipment.id,
            fromStatus:    ShipmentStatus.DRAFT,
            toStatus:      ShipmentStatus.BOOKED,
            note:          "Booking submitted via booking wizard.",
            changedByType: "ORG",
            changedById:   userId,
          },
        });

        return { shipmentId: shipment.id, shipmentNumber: shipment.shipmentNumber };
      });

      // ── 5. Success ──────────────────────────────────────────────────────
      Sentry.addBreadcrumb({
        message: `Shipment created: ${txResult.shipmentNumber}`,
        level:   "info",
        data:    { shipmentId: txResult.shipmentId },
      });

      return {
        success:        true,
        shipmentId:     txResult.shipmentId,
        shipmentNumber: txResult.shipmentNumber,
      };

    } catch (err) {
      // P2002 on shipmentNumber = two concurrent submissions collided on the
      // sequence number. Retry once — generateShipmentNumber will produce
      // the next available number.
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as Record<string, unknown>).code === "P2002" &&
        "meta" in err &&
        Array.isArray((err as Record<string, unknown[]>).meta) &&
        ((err as any).meta?.target as string[] | undefined)?.includes("shipmentNumber")
      ) {
        Sentry.addBreadcrumb({
          message: "shipmentNumber collision — retrying",
          level:   "warning",
        });
        return createShipmentAction(data);
      }

      Sentry.captureException(err, {
        tags:  { step: "dbTransaction", orgId: dbOrgId },
        extra: {
          shipmentOwnerMode: data.shipmentOwnerMode,
          packageCount:      data.packages.length,
          selectedVendor:    data.selectedService?.vendorId,
        },
      });

      return {
        success: false,
        message: "We couldn't save your shipment. Our team has been notified. Please try again.",
      };
    }
  });
}