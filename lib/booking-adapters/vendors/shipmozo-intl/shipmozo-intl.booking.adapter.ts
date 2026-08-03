/**
 * SHIPMOZO INTERNATIONAL BOOKING ADAPTER
 * -----------------------------------------------------------------------------
 * Books an export through Shipmozo and fetches its label.
 *
 * Four vendor calls: create-shipper (the exporter of record), create-warehouse
 * (the pickup point), international-push-order, then assign-courier for the
 * waybill. This is the TWO-CALL shape described in the base class — push, then
 * assign — so `createBooking` returns no AWB and the orchestrator runs the
 * assign step after it.
 *
 * Shares lib/shipmozo/client.ts with the domestic adapter, and registers under
 * the same vendorId "shipmozo" in a SEPARATE registry. See the note in
 * lib/booking-adapters/core/registry.ts for why the registries are split.
 *
 * Every method is one vendor call and nothing else. The orchestration — what to
 * persist between calls, what to retry, what to do when it will never work —
 * belongs to the caller, which is a durable function that can do all three.
 */

import "server-only";

import {
  ShipmozoApiError,
  assignCourier,
  cancelOrder,
  createShipper,
  createWarehouse,
  getOrderLabel,
  getWarehouses,
  internationalPushOrder,
  internationalRateCalculator,
  isShipmozoConfigured,
  resolveCountryId,
} from "@/lib/shipmozo/client";
import {
  isLutExpired,
  missingExportPapers,
  requiresFullExportIdentity,
} from "@/lib/booking/exportProfile";

import {
  BaseInternationalBookingAdapter,
  BookingAdapterError,
} from "../../core/base.international.adapter";
import type {
  AssignedIntlCarrier,
  CanonicalIntlBookingRequest,
  CreatedIntlBooking,
  IntlVendorDocument,
} from "../../core/intl.types";
import {
  buildIntlPushOrderPayload,
  buildIntlRatePayload,
  buildIntlWarehousePayload,
  buildShipperPayload,
} from "./shipmozo-intl.booking.mapper";

const VENDOR_ID = "shipmozo";

/** One service Shipmozo says it will carry a given consignment on. */
interface OfferedService {
  id: string;
  name: string | null;
}

/** File extension for a label's content type. Defaults to pdf, the usual case. */
function extensionFor(mimeType: string): string {
  const subtype = mimeType.split(";")[0].trim().split("/")[1] ?? "pdf";
  if (subtype === "jpeg") return "jpg";
  return /^[a-z0-9]+$/i.test(subtype) ? subtype : "pdf";
}

export class ShipmozoInternationalBookingAdapter extends BaseInternationalBookingAdapter {
  readonly vendorId = VENDOR_ID;
  readonly vendorName = "Shipmozo";

  isConfigured(): boolean {
    return isShipmozoConfigured();
  }

  /**
   * Everything that would make this export fail, checked before the order
   * exists.
   *
   * ── WHAT THIS DOES AND DOES NOT DEMAND, AND WHY ─────────────────────────────
   * SHIPMOZO ITSELF REQUIRES NONE OF THE CUSTOMS FIELDS. Their published spec for
   * international-push-order (vendor-api-docs/shipmozo.json) marks not one of its
   * 42 fields as required, and iec_number, ad_code and lut_number each default to
   * an empty string. An earlier version of this method demanded an IEC and an AD
   * code on every consignment on the assumption that a push without them returned
   * a 422. That assumption was wrong, and it blocked every export Arena had.
   *
   * So what is enforced here is INDIAN CUSTOMS PRACTICE, not a vendor contract,
   * and it therefore depends on which route the consignment takes:
   *
   *   CSB-IV  — the courier shipping bill for low-value exports. It exists
   *             precisely so small consignments can go without an IEC, so
   *             nothing is required. Anything on file is still passed through:
   *             an exporter who HAS an IEC should have it on their paperwork.
   *
   *   CSB-V / COMMERCIAL — a full shipping bill. Customs genuinely needs the IEC
   *             to identify the exporter and the AD code to tie the consignment
   *             to a bank. A commercial export filed without them is stopped at
   *             the port, which is far worse than being stopped here.
   *
   * The LUT is orthogonal to both, and is about tax rather than customs: claiming
   * zero-rated relief requires actually holding the Letter of Undertaking being
   * claimed under. So it is demanded only when the export is declared as moving
   * under one, whatever the route.
   *
   * Refusing here rather than at the vendor means the booking row names the field
   * ops have to fix. That was always the point of preflight; the mistake was the
   * breadth of the rule, not the existence of it.
   *
   * The rule itself lives in lib/booking/exportProfile.ts, because it is customs
   * practice rather than Shipmozo's contract and every vendor wants the same
   * answer. Only the vendor-specific checks below are decided here.
   */
  async preflight(request: CanonicalIntlBookingRequest): Promise<void> {
    const missing = missingExportPapers({
      shipmentType: request.customs.shipmentType,
      exportType: request.customs.exportType,
      exporter: request.exporter,
    });

    const needsFullExportIdentity = requiresFullExportIdentity(
      request.customs.shipmentType,
    );

    if (missing.length > 0) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `This ${
          needsFullExportIdentity ? "commercial export" : "export"
        } cannot be filed until the following are on file: ${missing.join(", ")}. Add them to the exporter's profile and retry.`,
        { retriable: false },
      );
    }

    if (isLutExpired(request.exporter)) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `The LUT on file expired on ${request.exporter.lutTillDate}. Exporting zero-rated against a lapsed LUT is a tax exposure, so this booking is held until a current one is uploaded.`,
        { retriable: false },
      );
    }

    if (!request.delivery.postalCode.trim()) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "The destination address has no postcode, which Shipmozo requires for an international consignment.",
        { retriable: false },
      );
    }

    // Cheap, read-only, and catches the most common permanent failure of all:
    // a destination Shipmozo does not serve. Resolving it now also warms the
    // country cache the push payload needs a moment later.
    const countryId = await this.resolveDestinationCountryId(request);
    if (!countryId) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `Shipmozo does not list ${request.delivery.countryName || request.delivery.countryCode} as a destination it serves.`,
        { retriable: false },
      );
    }
  }

  /**
   * The service the customer bought.
   *
   * Shipmozo's international rate calculator returns a numeric `id` per product,
   * which the rate adapter snapshots onto the shipment. So the answer is
   * normally just "read the snapshot", and there is no name-matching fallback:
   * re-quoting an export to match on a product name would re-price it, and a
   * price that moved between quote and booking is exactly what the snapshot
   * exists to prevent.
   */
  async resolveServiceId(
    request: CanonicalIntlBookingRequest,
  ): Promise<string | null> {
    return request.service.serviceId?.trim() || null;
  }

  async ensureShipper(
    request: CanonicalIntlBookingRequest,
  ): Promise<{ shipperId: string | null }> {
    const created = await this.call(() =>
      createShipper(buildShipperPayload(request)),
    );

    const shipperId =
      created.shipper_id != null ? String(created.shipper_id).trim() : "";

    if (!shipperId) {
      // A shipper we cannot name is one we cannot push against, and a retry
      // would register a second one. Stop here instead.
      throw new BookingAdapterError(
        VENDOR_ID,
        "Shipmozo accepted the exporter details but returned no shipper id.",
        { retriable: false },
      );
    }

    return { shipperId };
  }

  /**
   * Register the pickup point and push the order.
   *
   * Two calls in one step, unlike the domestic adapter which splits them. The
   * warehouse is REUSED rather than resumed: `address_title` carries this
   * booking's own reference, so a retry finds the one the previous attempt
   * registered instead of adding another. That is why there is nothing worth
   * persisting between the two calls, and why the orchestrator has one fewer id
   * to carry. The domestic split exists because that flow keeps its warehouse in
   * a column.
   */
  async createBooking(
    request: CanonicalIntlBookingRequest,
    context: { shipperId: string | null; serviceId: string | null },
  ): Promise<CreatedIntlBooking> {
    const countryId = await this.resolveDestinationCountryId(request);
    if (!countryId) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `Shipmozo does not list ${request.delivery.countryName || request.delivery.countryCode} as a destination it serves.`,
        { retriable: false },
      );
    }

    const warehouseId = await this.ensureWarehouse(request);

    const pushed = await this.callCreate(() =>
      internationalPushOrder(
        buildIntlPushOrderPayload(request, {
          warehouseId,
          shipperId: context.shipperId,
          countryId,
        }),
      ),
    );

    const vendorOrderId = pushed.order_id?.trim();
    if (!vendorOrderId) {
      // Their own handle is how every later call addresses this order, and it
      // is NOT our reference — get-order-detail refuses one of ours. An order
      // we cannot name is one we cannot assign a courier to or cancel, and
      // retrying would push a second one, so this stops for a person.
      throw new BookingAdapterError(
        VENDOR_ID,
        `Shipmozo accepted the export but returned no order id. The order exists under reference ${request.reference}; find it in the Shipmozo panel before retrying, because a retry would push a second one.`,
        { retriable: false },
      );
    }

    return {
      vendorOrderId,
      // Deliberately absent: this vendor assigns a carrier in a second call.
      awbNumber: null,
    };
  }

  /**
   * Step 4 then step 5 of Shipmozo's documented international flow: ask what
   * they will carry this consignment on, then assign from that answer.
   *
   * ── WHY THE RATE CALL IS HERE AND NOT SKIPPED ───────────────────────────────
   * The courier id on the shipment was snapshotted when the customer picked a
   * price, from a quote built out of the CART's numbers. What finally gets
   * pushed can differ — a box re-measured, a weight corrected, an address
   * edited — and Shipmozo decides serviceability on the pushed consignment, not
   * on the quote. When the two disagree, assign-courier answers "Service not
   * found", which names neither the field that moved nor the services that do
   * work.
   *
   * So the offer is re-read first, for the consignment as pushed. It is used
   * ONLY to confirm the bought courier is still on the list and to name the
   * alternatives when it is not. NOTHING is re-priced: the customer's price was
   * fixed at selection, and a booking path that quietly accepts a new one is how
   * a shipment ends up costing more than the quote it was sold on.
   */
  async assignCarrier(input: {
    vendorOrderId: string;
    serviceId: string | null;
    request: CanonicalIntlBookingRequest;
  }): Promise<AssignedIntlCarrier> {
    const serviceId = input.serviceId?.trim();

    if (!serviceId) {
      // No auto-assign fallback on an export, unlike the domestic adapter.
      // Domestic couriers are broadly interchangeable at a given price; an
      // international carrier is not — transit time, duty handling and customs
      // paperwork all differ, and the customer chose on those.
      throw new BookingAdapterError(
        VENDOR_ID,
        "No Shipmozo service id was resolved for this booking, and an international carrier is never auto-assigned.",
        { retriable: false },
      );
    }

    const offered = await this.offeredServices(input.request);

    // An empty list means the rate call itself could not answer, which is not
    // the same as "nothing is offered". Only a list we actually received is
    // allowed to refuse the assign.
    if (offered.length > 0 && !offered.some((s) => s.id === serviceId)) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `Shipmozo no longer offers ${
          input.request.service.productName ?? `courier ${serviceId}`
        } for this consignment as it was pushed (${input.request.totalActualWeightKg} kg to ${
          input.request.delivery.city
        }, ${input.request.delivery.countryCode}). What they do offer: ${offered
          .map((s) => `${s.name ?? "unnamed"} (${s.id})`)
          .join(", ")}. The export is pushed under order ${
          input.vendorOrderId
        } and waiting; putting it on a different carrier is a decision for a person, because the customer chose this one on transit time and duty handling.`,
        { retriable: false },
      );
    }

    const assigned = await this.callAssign(
      () => assignCourier(input.vendorOrderId, serviceId),
      { vendorOrderId: input.vendorOrderId, serviceId, offered },
    );

    const awbNumber = assigned.awb_number?.trim();
    if (!awbNumber) {
      // The carrier is assigned but we hold no waybill. Retrying the assign
      // would try to assign an already-assigned order, so this needs a human
      // with the Shipmozo panel open.
      throw new BookingAdapterError(
        VENDOR_ID,
        "Shipmozo assigned a carrier but returned no AWB. Check the Shipmozo panel.",
        { retriable: false },
      );
    }

    return {
      awbNumber,
      carrierName:
        assigned.courier_company?.trim() || assigned.courier?.trim() || null,
      trackingUrl: null,
    };
  }

  async fetchDocuments(input: {
    vendorOrderId: string;
    awbNumber: string;
  }): Promise<IntlVendorDocument[]> {
    const label = await this.call(() => getOrderLabel(input.awbNumber));

    return [
      {
        kind: "LABEL",
        bytes: label.bytes,
        mimeType: label.mimeType,
        // Extension follows what they actually sent. They answer with a PDF
        // when asked and a PNG when not, and a .pdf name on PNG bytes is a
        // download the customer's reader refuses to open.
        fileName: `AWB-${input.awbNumber}.${extensionFor(label.mimeType)}`,
      },
    ];
  }

  async cancelBooking(vendorOrderId: string): Promise<void> {
    await this.call(() => cancelOrder(vendorOrderId));
  }

  // findExistingBooking is deliberately NOT implemented, and the base class's
  // null is the honest answer. See the note on `callCreate` below: Shipmozo
  // publishes no way to look an order up by our own reference, so the question
  // "did the push land?" cannot be asked, and an override that always answered
  // null was worse than none — it made the orchestrator believe it had checked.

  // -------------------------------------------------------------------------

  /**
   * The pickup point for this booking, reused if a previous attempt made one.
   *
   * `address_title` is "Pickup ARN…", unique to the shipment, which makes the
   * warehouse list a lookup table keyed on the booking. Without this, every
   * attempt registered another address: the account had accumulated one per
   * booking, and a retried booking added a second for the same parcel.
   *
   * The lookup is best effort. A list we could not read means we create one,
   * which is exactly the old behaviour, so a Shipmozo outage on this endpoint
   * costs a stray address and never a booking.
   */
  private async ensureWarehouse(
    request: CanonicalIntlBookingRequest,
  ): Promise<string> {
    const payload = buildIntlWarehousePayload(request);

    const existing = (await getWarehouses()).find(
      (entry) =>
        entry.address_title?.trim().toLowerCase() ===
        payload.address_title.trim().toLowerCase(),
    );

    const existingId =
      existing?.id != null ? String(existing.id).trim() : "";
    if (existingId) return existingId;

    const created = await this.call(() => createWarehouse(payload));
    const warehouseId =
      created.warehouse_id != null ? String(created.warehouse_id).trim() : "";

    if (!warehouseId) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "Shipmozo accepted the pickup address but returned no warehouse id.",
        { retriable: false },
      );
    }

    return warehouseId;
  }

  private async resolveDestinationCountryId(
    request: CanonicalIntlBookingRequest,
  ): Promise<string | null> {
    try {
      return await resolveCountryId(
        request.delivery.countryCode,
        request.delivery.countryName,
      );
    } catch (err) {
      // A country list we could not fetch is a network problem, not an unknown
      // destination, and the two must not produce the same permanent failure.
      throw new BookingAdapterError(
        VENDOR_ID,
        err instanceof Error
          ? `Could not read Shipmozo's country list: ${err.message}`
          : "Could not read Shipmozo's country list.",
        { retriable: true, cause: err },
      );
    }
  }

  /**
   * One place where a Shipmozo failure becomes a booking failure.
   *
   * Identical judgement to the domestic adapter, and stated again rather than
   * shared because the two are free to diverge: a 4xx means we sent something
   * Shipmozo will refuse again — bad credentials, a malformed payload — so
   * retrying spends four more attempts to reach the same place. 408 and 429 are
   * the exceptions: both explicitly mean "later".
   *
   * Envelope errors (HTTP 200, result != 1) stay retriable. They cover both a
   * genuinely bad request and a transient fault at their end, and we cannot
   * tell which from the message, so we take the slower wrong answer over the one
   * that abandons a paid booking.
   */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ShipmozoApiError) {
        const status = err.status;
        const permanent =
          status != null &&
          status >= 400 &&
          status < 500 &&
          status !== 408 &&
          status !== 429;

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

  /**
   * Assigning a carrier, which is the call that issues a waybill and bills.
   *
   * ── WHY THIS IS NEVER RETRIED ───────────────────────────────────────────────
   * Every failure mode here is either deterministic or dangerous, and none is
   * improved by trying again four more times:
   *
   *   • Shipmozo's refusals ("Service not found", "Courier id is not valid",
   *     "Courier service not available") are decisions about this order and this
   *     courier. The fifth attempt gets the same answer as the first.
   *   • A lost response is the dangerous one. If the assign landed, the order
   *     now HAS a courier and a waybill; assigning again is at best refused and
   *     at worst a second consignment. The code has always said retrying an
   *     already-assigned order needs a human — this makes that true rather than
   *     aspirational, because `call` used to leave envelope errors retriable and
   *     spend five real assign attempts on the way to failing.
   *
   * ── ON "Service not found" ──────────────────────────────────────────────────
   * Called out by name because it is the one that looks like our bug and is not.
   * Measured against the live API: for a valid order and courier 317, Shipmozo
   * answers "Service not found", while an unknown courier answers "Courier id is
   * not valid" and a domestic courier on an export answers "Courier service not
   * available". Three distinct messages, so the courier id IS recognised and the
   * order IS valid — their own rate calculator offers 317 for these exact
   * parameters, and then their assign says no service exists for it. That
   * contradiction is theirs to resolve, so the message says so instead of
   * sending ops to look at a payload that is correct.
   */
  private async callAssign<T>(
    fn: () => Promise<T>,
    context: {
      vendorOrderId: string;
      serviceId: string;
      offered: OfferedService[];
    },
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown Shipmozo error";

      // "Service not found" AFTER the rate call confirmed the courier is on
      // offer is the one that is not ours to fix: their own two endpoints
      // disagree about the same consignment. Say so, rather than sending ops to
      // audit a payload that has already been checked against the vendor's own
      // answer.
      const contradiction =
        /service not found/i.test(message) &&
        context.offered.some((s) => s.id === context.serviceId);

      throw new BookingAdapterError(
        VENDOR_ID,
        contradiction
          ? `Shipmozo's rate calculator offers courier ${context.serviceId} for this consignment, and their assign-courier then answers "Service not found" for the same one on order ${context.vendorOrderId}. Those two answers contradict each other and nothing in the payload will reconcile them: the courier id is valid (an unknown one is refused differently) and so is the order. This needs the service enabling on the Shipmozo account, or the courier assigning by hand in their panel.`
          : `${message}. The export is pushed and waiting under order ${context.vendorOrderId}; assigning again automatically could issue a second waybill, so this stops here.`,
        {
          retriable: false,
          status: err instanceof ShipmozoApiError ? err.status : undefined,
          cause: err,
        },
      );
    }
  }

  /**
   * What Shipmozo says it will carry this consignment on, as (id, name) pairs.
   *
   * Best effort by design. A rate call that fails must not stop an assign that
   * would have worked, so a failure here returns an empty list and the assign
   * proceeds — the caller treats "empty" as "could not ask", never as "nothing
   * is offered".
   */
  private async offeredServices(
    request: CanonicalIntlBookingRequest,
  ): Promise<OfferedService[]> {
    try {
      const countryId = await this.resolveDestinationCountryId(request);
      if (!countryId) return [];

      const products = await internationalRateCalculator(
        buildIntlRatePayload(request, { countryId }),
      );

      return products.flatMap((product) => {
        const id = product.id != null ? String(product.id).trim() : "";
        return id ? [{ id, name: product.name?.trim() || null }] : [];
      });
    } catch {
      return [];
    }
  }

  /**
   * The same judgement for the ONE call that creates an export, and it is
   * deliberately the opposite of the rule above.
   *
   * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
   * SHIPMOZO DOES NOT DEDUPLICATE ON OUR `order_id`. Pushing the same reference
   * twice returns two different handles for two real orders, both carrying the
   * same `refrence_id`. This was measured against the live API, not inferred,
   * and it invalidates the assumption the retry logic used to rest on.
   *
   * Nor can the duplicate be detected afterwards: get-order-detail takes their
   * handle, not ours, and they publish nothing that searches on `refrence_id`.
   * So there is no lookup to recover with and no vendor-side guard to fall back
   * on. The only remaining protection is not making the second call.
   *
   * Therefore, for the push alone:
   *
   *   HTTP 200, result 0    the order was REFUSED and nothing was created. Safe
   *                         to retry, and usually pointless — it is a validation
   *                         failure that will be refused identically — so it is
   *                         permanent, which puts the vendor's own message on
   *                         the booking row where ops can read it.
   *   HTTP 4xx              same: not created. Permanent.
   *   HTTP 5xx, timeout,    UNKNOWN. The request may well have landed. Retrying
   *   network fault         here is what books a second export at full price, so
   *                         it stops for a person instead.
   *
   * That last line is the whole point, and it is the same trade sKart's adapter
   * makes for the same reason: a booking whose outcome is unknown waits for a
   * human rather than being placed twice.
   */
  private async callCreate<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ShipmozoApiError && err.status == null) {
        // An envelope rejection: HTTP 200 with result 0, which is proof the
        // order was not created.
        throw new BookingAdapterError(VENDOR_ID, err.message, {
          retriable: false,
          cause: err,
        });
      }

      if (err instanceof ShipmozoApiError && err.status != null) {
        const clientError = err.status >= 400 && err.status < 500;
        throw new BookingAdapterError(
          VENDOR_ID,
          clientError
            ? err.message
            : `${err.message}. This booking is held rather than retried: Shipmozo may have accepted the export before the connection failed, and they do not reject a repeated order id, so a retry would place a second one. Check the Shipmozo panel for reference before re-driving.`,
          { retriable: false, status: err.status, cause: err },
        );
      }

      throw new BookingAdapterError(
        VENDOR_ID,
        `${
          err instanceof Error ? err.message : "Unknown Shipmozo error"
        }. This booking is held rather than retried: the push may have landed before the connection failed, and Shipmozo does not reject a repeated order id, so a retry would place a second export. Check the Shipmozo panel before re-driving.`,
        { retriable: false, cause: err },
      );
    }
  }
}
