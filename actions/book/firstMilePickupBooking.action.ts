"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { requireArenaMember } from "@/utils/arena-auth";
import {
  createWarehouse,
  pushOrder,
  assignCourier,
  autoAssignOrder,
  schedulePickup,
  isShipmozoConfigured,
  ShipmozoApiError,
} from "@/lib/shipmozo/client";
import type {
  ShipmozoProductDetail,
  ShipmozoPushOrderPayload,
} from "@/lib/shipmozo/types";
import { FIRST_MILE_HUBS } from "@/lib/booking/firstMile";
import type { BookFirstMileResult } from "@/lib/booking/firstMilePickup";
import { getRates } from "@/lib/services/rate-calculator.service";
import { domesticAdapterRegistry } from "@/lib/rate-adapters/vendors/domestic.index";
import type {
  CanonicalPackage,
  CanonicalRateRequest,
} from "@/lib/rate-adapters/core/types";

// ---------------------------------------------------------------------------
// Book the door → hub pickup with Shipmozo (forward model)
//
// In Shipmozo a "warehouse" is the PICKUP point, so we register one per booking
// from the customer's pickup address, then push a FORWARD order whose consignee
// is our hub. Flow: create-warehouse (pickup) → push-order → assign the courier
// the customer selected (or auto-assign) → schedule the pickup. Every external
// id is persisted the moment we get it, so a retry after a mid-flow failure
// resumes rather than duplicating (no second warehouse, no second order).
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "object" && "toNumber" in (v as object))
    return (v as { toNumber(): number }).toNumber();
  return Number(v) || 0;
}

/**
 * Recovers the Shipmozo courier id for the exact service the customer selected
 * and paid for. Prefers the id snapshotted at booking time; when that is missing
 * (legacy rows, or a rate response that carried no id) it re-quotes the same
 * door → hub leg and matches the stored product name. Returns null only when the
 * paid courier can no longer be resolved — the caller must NOT silently swap in
 * a different courier, since the customer has already been charged for this one.
 */
async function resolveExactCourierId(s: {
  firstMileVendorName: string | null;
  pickupPin: string;
  pickupCity: string;
  pickupLine1: string;
  hubCity: string;
  hubPin: string;
  hubLine1: string;
  packages: {
    quantity: number;
    weightKg: unknown;
    lengthCm: unknown;
    widthCm: unknown;
    heightCm: unknown;
    declaredValue: unknown;
  }[];
  snapshotCourierId: string | null;
}): Promise<string | null> {
  if (s.snapshotCourierId) return s.snapshotCourierId;

  const productName = s.firstMileVendorName?.trim().toLowerCase();
  if (!productName) return null;

  const boxes: CanonicalPackage[] = s.packages.map((p) => ({
    quantity: Math.max(1, p.quantity),
    weightKg: num(p.weightKg),
    lengthCm: num(p.lengthCm),
    widthCm: num(p.widthCm),
    heightCm: num(p.heightCm),
  }));
  if (!boxes.length) return null;

  const totalWeight = boxes.reduce((a, b) => a + b.weightKg * b.quantity, 0);
  const totalDeclared = s.packages.reduce(
    (a, p) => a + num(p.declaredValue) * Math.max(1, p.quantity),
    0,
  );
  const first = boxes[0];

  const request: CanonicalRateRequest = {
    origin: {
      city: s.pickupCity,
      pincode: s.pickupPin,
      countryCode: "IN",
      country: "India",
      line1: s.pickupLine1,
    },
    destination: {
      city: s.hubCity,
      pincode: s.hubPin,
      countryCode: "IN",
      country: "India",
      line1: s.hubLine1,
    },
    shipment: {
      packages: boxes,
      weight: totalWeight || 0.5,
      quantity: boxes.reduce((a, b) => a + b.quantity, 0) || 1,
      dimensions: {
        length: Math.max(1, first.lengthCm),
        width: Math.max(1, first.widthCm),
        height: Math.max(1, first.heightCm),
        unit: "cm",
      },
      declaredValue: totalDeclared || undefined,
    },
  };

  // Markup is irrelevant to which courier id we get, so quote at 0%.
  const res = await getRates(request, {
    vendorIds: ["shipmozo"],
    markupPercent: 0,
    registry: domesticAdapterRegistry,
  });

  const match = res.quotes.find(
    (q) => q.productName?.trim().toLowerCase() === productName,
  );
  return match?.courierId ?? null;
}

export async function bookFirstMilePickup(
  shipmentId: string,
  opts?: { allowAutoAssign?: boolean },
): Promise<BookFirstMileResult> {
  try {
    await requireArenaMember();

    if (!isShipmozoConfigured()) {
      return {
        success: false,
        message: "Shipmozo API keys are not configured on the server.",
      };
    }

    const s = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        status: true,
        shipmentNumber: true,
        pickupIncluded: true,
        firstMileHubLabel: true,
        firstMileVendorName: true,
        firstMileCharge: true,
        firstMileChargeSnapshot: true,
        firstMileShipmozoOrderId: true,
        firstMileShipmozoWarehouseId: true,
        firstMileTrackingNumber: true,
        totalActualWeightKg: true,
        pickupAddress: {
          select: {
            contactName: true,
            contactPhone: true,
            contactEmail: true,
            line1: true,
            line2: true,
            city: true,
            state: true,
            country: true,
            postalCode: true,
          },
        },
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
              select: { description: true, quantity: true, unitValue: true, hsCode: true },
            },
          },
        },
      },
    });

    if (!s) return { success: false, message: "Shipment not found." };
    if (!s.pickupIncluded) {
      return { success: false, message: "This shipment does not include door pickup." };
    }
    if (s.firstMileTrackingNumber) {
      return {
        success: false,
        message: `Pickup already booked (AWB ${s.firstMileTrackingNumber}).`,
      };
    }
    if (!s.packages.length) {
      return { success: false, message: "No packages to book a pickup for." };
    }

    const addr = s.pickupAddress;
    const pin = (addr.postalCode ?? "").trim();
    const pickupPhone = addr.contactPhone?.trim();
    if (!pin || !pickupPhone) {
      return {
        success: false,
        message: "The pickup address needs a phone number and pincode before booking.",
      };
    }

    // Consignee = our hub. Its address comes from the hub registry; its contact
    // (name / phone / email) falls back to the pickup contact when the hub
    // config leaves them blank, so no separate hub-contact setup is needed.
    const hub =
      (s.firstMileHubLabel && FIRST_MILE_HUBS.find((h) => h.label === s.firstMileHubLabel)) ||
      FIRST_MILE_HUBS[0];
    const hubContact = hub.contactName?.trim() || addr.contactName?.trim() || "Consignor";
    const hubPhone = hub.phone?.trim() || pickupPhone;
    const hubEmail = hub.email?.trim() || addr.contactEmail?.trim() || undefined;

    const snapshot = (s.firstMileChargeSnapshot ?? {}) as {
      courierId?: string | null;
      productName?: string | null;
    };

    // Resolve the EXACT courier the customer paid for before touching Shipmozo,
    // so we never create an order we would then refuse to assign. If it cannot
    // be resolved we stop here (no orphan order) unless ops explicitly allow an
    // auto-assign — the customer has already been charged for a specific service.
    const courierId = await resolveExactCourierId({
      firstMileVendorName: s.firstMileVendorName,
      pickupPin: pin,
      pickupCity: addr.city ?? "",
      pickupLine1: addr.line1 ?? "",
      hubCity: hub.city,
      hubPin: hub.postalCode,
      hubLine1: hub.line1,
      packages: s.packages,
      snapshotCourierId: snapshot.courierId?.trim() || null,
    });

    if (!courierId && !opts?.allowAutoAssign) {
      return {
        success: false,
        code: "COURIER_UNRESOLVED",
        message: `Could not confirm the exact courier the customer paid for${
          s.firstMileVendorName ? ` (${s.firstMileVendorName})` : ""
        }. It may no longer be offered on this route. Book with an auto-assigned courier only if you have checked this is acceptable.`,
      };
    }

    // 1) Warehouse = the customer's pickup point. Reuse if a prior attempt made
    //    one; Shipmozo derives city/state from the pincode.
    let warehouseId = s.firstMileShipmozoWarehouseId ?? null;
    if (!warehouseId) {
      const created = await createWarehouse({
        address_title: `Pickup ${s.shipmentNumber}`,
        name: addr.contactName?.trim() || "Consignor",
        phone: pickupPhone,
        email: addr.contactEmail?.trim() || undefined,
        address_line_one: addr.line1?.trim() || "",
        address_line_two: addr.line2?.trim() || undefined,
        pin_code: pin,
      });
      warehouseId = created.warehouse_id != null ? String(created.warehouse_id) : "";
      if (!warehouseId) {
        return {
          success: false,
          message: "Shipmozo did not return a warehouse id for the pickup address.",
        };
      }
      await prisma.shipment.update({
        where: { id: s.id },
        data: { firstMileShipmozoWarehouseId: warehouseId },
      });
    }

    // Dimensions: push-order takes a single L/W/H, so use the largest box so the
    // parcel is never under-declared. Weight is the shipment's total actual kg.
    const dims = s.packages.reduce(
      (acc, p) => ({
        length: Math.max(acc.length, Math.ceil(num(p.lengthCm))),
        width: Math.max(acc.width, Math.ceil(num(p.widthCm))),
        height: Math.max(acc.height, Math.ceil(num(p.heightCm))),
      }),
      { length: 1, width: 1, height: 1 },
    );
    const weightGrams = Math.max(1, Math.round(num(s.totalActualWeightKg) * 1000));

    const productDetail: ShipmozoProductDetail[] = [];
    for (const p of s.packages) {
      if (p.contents.length) {
        for (const c of p.contents) {
          productDetail.push({
            name: c.description?.trim() || "Cargo",
            quantity: Math.max(1, c.quantity),
            unit_price: num(c.unitValue),
            hsn: c.hsCode?.trim() || undefined,
          });
        }
      } else {
        productDetail.push({
          name: p.description?.trim() || "Cargo",
          quantity: Math.max(1, p.quantity),
          unit_price: num(p.declaredValue),
        });
      }
    }
    if (!productDetail.length) {
      productDetail.push({ name: "General Cargo", quantity: 1, unit_price: 0 });
    }

    // 2) Order. Reuse an existing order id if a prior attempt pushed but failed
    //    before assigning a courier.
    let orderHandle = s.firstMileShipmozoOrderId ?? null;
    if (!orderHandle) {
      const payload: ShipmozoPushOrderPayload = {
        order_id: s.id, // echoed back as refrence_id on the tracking webhook
        order_date: new Date().toISOString().slice(0, 10),
        // Consignee = our hub (the parcel is delivered here).
        consignee_name: hubContact,
        consignee_phone: hubPhone,
        consignee_email: hubEmail,
        consignee_address_line_one: hub.line1,
        consignee_pin_code: hub.postalCode,
        consignee_city: hub.city,
        consignee_state: hub.state,
        product_detail: productDetail,
        payment_type: "PREPAID",
        shipping_charges: s.firstMileCharge ? String(num(s.firstMileCharge)) : undefined,
        weight: String(weightGrams),
        length: String(dims.length),
        width: String(dims.width),
        height: String(dims.height),
        warehouse_id: warehouseId,
        shipment_type: "FORWARD",
      };

      const pushed = await pushOrder(payload);
      orderHandle = pushed.order_id?.trim() || s.id;
      await prisma.shipment.update({
        where: { id: s.id },
        data: { firstMileShipmozoOrderId: orderHandle, firstMileBookedAt: new Date() },
      });
    }

    // 3) Assign the exact courier the customer paid for. Auto-assign is only
    //    reached when it could not be resolved AND ops explicitly allowed it
    //    (guarded above), so it never silently swaps a paid-for service.
    const assigned = courierId
      ? await assignCourier(orderHandle, courierId)
      : await autoAssignOrder(orderHandle);

    const awb = assigned.awb_number?.trim() || null;
    const carrier =
      assigned.courier_company?.trim() ||
      assigned.courier?.trim() ||
      snapshot.productName?.trim() ||
      null;

    if (!awb) {
      return {
        success: false,
        message: "Courier assigned but Shipmozo returned no AWB. Check the Shipmozo panel.",
      };
    }

    // 4) Schedule pickup — optional per Shipmozo; a failure must not undo a
    //    booked, courier-assigned order.
    try {
      await schedulePickup(orderHandle);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { location: "bookFirstMilePickup:schedulePickup" },
        extra: { shipmentId: s.id },
      });
    }

    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: s.id },
        data: { firstMileTrackingNumber: awb },
      }),
      prisma.shipmentStatusEvent.create({
        data: {
          shipmentId: s.id,
          // Not a status change — logged on the timeline like an AWB update.
          fromStatus: s.status,
          toStatus: s.status,
          note: `Door pickup booked with Shipmozo. AWB ${awb}${carrier ? ` (${carrier})` : ""}`,
          changedByType: "OPS",
        },
      }),
    ]);

    revalidatePath(`/arena-dashboard/bookings/${s.id}`);
    revalidatePath(`/shipments/${s.id}`);

    return { success: true, awb, carrier };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { location: "bookFirstMilePickup" },
      extra: { shipmentId },
    });
    const message =
      err instanceof ShipmozoApiError
        ? err.message
        : "Failed to book the pickup with Shipmozo. Please try again.";
    return { success: false, message };
  }
}
