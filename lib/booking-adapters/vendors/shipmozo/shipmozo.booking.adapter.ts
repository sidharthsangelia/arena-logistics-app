/**
 * SHIPMOZO BOOKING ADAPTER
 * -----------------------------------------------------------------------------
 * Books a domestic door → door order through Shipmozo and fetches its label.
 *
 * In Shipmozo a "warehouse" IS the pickup point, so one is registered per
 * booking from the customer's own pickup address and the order goes out as a
 * FORWARD move to the consignee. That is the same model the international
 * first-mile leg uses (actions/book/firstMilePickupBooking.action.ts), except
 * there the consignee is our hub and here it is the actual receiver.
 *
 * Every method is one vendor call and nothing else. The orchestration — what to
 * persist between calls, what to retry, what to do when it will never work —
 * belongs to the caller, which is a durable function that can do all three.
 */

import "server-only";

import {
  ShipmozoApiError,
  assignCourier,
  autoAssignOrder,
  cancelOrder,
  createWarehouse,
  getOrderDetail,
  getOrderLabel,
  isShipmozoConfigured,
  pushOrder,
  schedulePickup,
} from "@/lib/shipmozo/client";

import {
  BaseBookingAdapter,
  BookingAdapterError,
} from "../../core/base.booking.adapter";
import type {
  AssignedCarrier,
  CanonicalBookingRequest,
  CreateOrderResult,
  ExistingOrder,
  LabelFile,
  PickupPointResult,
} from "../../core/types";
import {
  buildPushOrderPayload,
  buildWarehousePayload,
} from "./shipmozo.booking.mapper";

const VENDOR_ID = "shipmozo";

/** File extension for a label's content type. Defaults to pdf, the usual case. */
function extensionFor(mimeType: string): string {
  const subtype = mimeType.split(";")[0].trim().split("/")[1] ?? "pdf";
  if (subtype === "jpeg") return "jpg";
  return /^[a-z0-9]+$/i.test(subtype) ? subtype : "pdf";
}

export class ShipmozoBookingAdapter extends BaseBookingAdapter {
  readonly vendorId = VENDOR_ID;
  readonly vendorName = "Shipmozo";

  isConfigured(): boolean {
    return isShipmozoConfigured();
  }

  async ensurePickupPoint(
    request: CanonicalBookingRequest,
  ): Promise<PickupPointResult> {
    const created = await this.call(() =>
      createWarehouse(buildWarehousePayload(request)),
    );

    const pickupPointId =
      created.warehouse_id != null ? String(created.warehouse_id).trim() : "";

    if (!pickupPointId) {
      // A warehouse we cannot name is a warehouse we cannot ship from, and a
      // retry would register a second one. Stop here instead.
      throw new BookingAdapterError(
        VENDOR_ID,
        "Shipmozo accepted the pickup address but returned no warehouse id.",
        { retriable: false },
      );
    }

    return { pickupPointId };
  }

  async createOrder(
    request: CanonicalBookingRequest,
    pickupPointId: string | null,
  ): Promise<CreateOrderResult> {
    if (!pickupPointId) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "Shipmozo needs a registered pickup point before an order can be pushed.",
        { retriable: false },
      );
    }

    const pushed = await this.call(() =>
      pushOrder(buildPushOrderPayload(request, pickupPointId)),
    );

    // Shipmozo echoes our reference back as the order handle. Falling back to
    // it keeps every later call addressable even if the field is ever absent.
    return { vendorOrderId: pushed.order_id?.trim() || request.reference };
  }

  async assignCarrier(input: {
    vendorOrderId: string;
    courierId?: string | null;
  }): Promise<AssignedCarrier> {
    const courierId = input.courierId?.trim();

    const assigned = await this.call(() =>
      courierId
        ? assignCourier(input.vendorOrderId, courierId)
        : autoAssignOrder(input.vendorOrderId),
    );

    const awbNumber = assigned.awb_number?.trim();
    if (!awbNumber) {
      // The courier is assigned but we hold no waybill. Retrying the assign
      // would try to assign an already-assigned order, so this needs a human
      // with the Shipmozo panel open.
      throw new BookingAdapterError(
        VENDOR_ID,
        "Shipmozo assigned a courier but returned no AWB. Check the Shipmozo panel.",
        { retriable: false },
      );
    }

    return {
      awbNumber,
      courierName:
        assigned.courier_company?.trim() || assigned.courier?.trim() || null,
      trackingUrl: null,
    };
  }

  async schedulePickup(vendorOrderId: string): Promise<void> {
    await this.call(() => schedulePickup(vendorOrderId));
  }

  async fetchLabel(input: {
    vendorOrderId: string;
    awbNumber: string;
  }): Promise<LabelFile> {
    const label = await this.call(() => getOrderLabel(input.awbNumber));

    return {
      bytes: label.bytes,
      mimeType: label.mimeType,
      // Extension follows what they actually sent. They answer with a PDF when
      // asked and a PNG when not, and a .pdf name on PNG bytes is a download
      // the customer's reader refuses to open.
      fileName: `AWB-${input.awbNumber}.${extensionFor(label.mimeType)}`,
    };
  }

  async cancelOrder(vendorOrderId: string): Promise<void> {
    await this.call(() => cancelOrder(vendorOrderId));
  }

  async findExistingOrder(reference: string): Promise<ExistingOrder | null> {
    // push-order carries `order_id: reference`, so Shipmozo's handle for one of
    // our orders is our own reference. getOrderDetail swallows its own errors.
    const detail = await getOrderDetail(reference);
    if (!detail) return null;

    const vendorOrderId = detail.order_id?.trim() || reference;
    return {
      vendorOrderId,
      awbNumber: detail.awb_number?.trim() || null,
      courierName:
        detail.courier_company?.trim() || detail.courier?.trim() || null,
    };
  }

  /**
   * One place where a Shipmozo failure becomes a booking failure.
   *
   * The retriable call is the only judgement here. A 4xx means we sent
   * something Shipmozo will refuse again — bad credentials, a malformed
   * payload — so retrying spends four more attempts to reach the same place.
   * 408 and 429 are the exceptions: both explicitly mean "later".
   *
   * Envelope errors (HTTP 200, result != 1) stay retriable. They cover both a
   * genuinely bad request and a transient fault at their end, and we cannot
   * tell which from the message, so we take the slower wrong answer over the
   * one that abandons a paid booking.
   */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ShipmozoApiError) {
        const status = err.status;
        const permanent =
          status != null && status >= 400 && status < 500 && status !== 408 && status !== 429;

        throw new BookingAdapterError(VENDOR_ID, err.message, {
          retriable: !permanent,
          status,
          cause: err,
        });
      }

      throw new BookingAdapterError(
        VENDOR_ID,
        err instanceof Error ? err.message : "Unknown Shipmozo error",
        { cause: err },
      );
    }
  }
}
