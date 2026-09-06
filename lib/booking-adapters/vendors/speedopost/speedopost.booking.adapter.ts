/**
 * SPEEDOPOST BOOKING ADAPTER
 * -----------------------------------------------------------------------------
 * Books a domestic door → door order through SpeedoPost and fetches its label.
 *
 * The analysis this was written from is speedopostBooking.md. Read it before
 * changing anything here: it names which parts of their API are confirmed by a
 * real call and which are read off prose, and this file's shape is mostly a
 * consequence of that split.
 *
 * ── HOW IT DIFFERS FROM SHIPMOZO, AND WHY THE STEPS STILL LINE UP ───────────
 * Shipmozo pushes an order and then assigns a courier to it. SpeedoPost has no
 * assign step at all: `CreateOrder` takes `serviceProviderCode` on the way in
 * and hands the waybill back on the way out. That is genuinely better — order
 * creation and courier selection are one atomic act, so there is no window in
 * which we hold an order that could still end up on the wrong carrier.
 *
 * The base contract still has both steps, so they are mapped like this:
 *
 *   createOrder    → POST /CreateOrder, and the AWB it returns becomes the
 *                    `vendorOrderId`.
 *   assignCarrier  → NO VENDOR CALL. The courier was chosen at creation, so
 *                    this reports the waybill already in hand.
 *
 * The AWB is used as the vendorOrderId rather than any order id because it is
 * the handle every other SpeedoPost endpoint accepts: PrintLabel, CancelOrder
 * and TrackingDetails all take `awb` and nothing else. An order id we could not
 * spend anywhere would be a worse thing to persist.
 *
 * That also means the two steps CANNOT rely on in-process state between them.
 * Inngest replays a function once per step, so anything the adapter stashed in
 * memory during create-order is gone by assign-courier. Everything assign needs
 * therefore comes from its arguments or from a cached vendor catalogue.
 *
 * ── THE ONE FAILURE THAT COSTS A SECOND PARCEL ──────────────────────────────
 * `domesticCourierBooking.md` §4 relies on a third idempotency layer: asking the
 * vendor, on a retry, whether they already hold an order under our reference.
 * SpeedoPost publishes no such lookup. There is no order search, no list, and no
 * documented dedupe on `clientOrderId`, so `findExistingOrder` cannot be
 * implemented and is left returning null.
 *
 * The gap is closed from the other side instead. `createOrder` refuses to be
 * retried whenever the outcome is UNKNOWN — a timeout, a reset, a 502, a body we
 * could not parse — because in that state the order may well exist and a retry
 * is what turns "we are not sure" into two consignments. Only a complete
 * `status: FAIL` envelope, which is SpeedoPost saying they considered the
 * request and created nothing, is treated as a clean failure.
 *
 * The trade is deliberate and it is the one speedopostBooking.md §3.1 lists as
 * option three: a rare double parcel becomes a more common failed booking that
 * ops re-drive by hand, with the money already held and a CRITICAL notification
 * raised. Settle it properly by asking SpeedoPost whether `clientOrderId` is
 * enforced unique; if it is, this whole paragraph goes away.
 *
 * ONE WINDOW REMAINS OPEN, and it is worth naming rather than implying it is
 * closed. This adapter can only refuse to retry a call it made. If the vendor
 * call SUCCEEDS and the caller's own database write of the order id then fails,
 * the step retries with nothing on file and creates a second order. Shipmozo
 * covers that case with `findExistingOrder`; here there is nothing to ask. The
 * window is one local write wide, which is why it is accepted rather than
 * designed around, but it is not zero.
 *
 * ── WHAT IS STILL UNCONFIRMED ───────────────────────────────────────────────
 * The success shapes of CreateOrder, CreatePickupRequest and PrintLabel have
 * never been seen. Each is read defensively and, where it matters, logged in
 * full on the first live call so the types can be tightened from evidence. A
 * response we cannot find a waybill in fails LOUDLY and permanently rather than
 * being papered over, because an order that exists at SpeedoPost and has no AWB
 * on our side is the exact state decision D4 exists to prevent.
 */

import "server-only";

import {
  SpeedoPostApiError,
  cancelOrderByAwb,
  createOrder,
  createPickupRequest,
  createWarehouse,
  isSpeedoPostConfigured,
  printLabel,
  speedoPostProviderCatalogue,
} from "@/lib/speedopost/client";
import { speedoPostServiceName } from "@/lib/speedopost/courierCatalogue";
import type { SpeedoPostCreateOrderData } from "@/lib/speedopost/types";

import {
  BaseBookingAdapter,
  BookingAdapterError,
} from "../../core/base.booking.adapter";
import type {
  AssignedCarrier,
  CanonicalBookingRequest,
  CreateOrderResult,
  LabelFile,
  PickupPointResult,
  SchedulePickupInput,
} from "../../core/types";
import {
  SpeedoPostBookingDataError,
  buildCreateOrderPayload,
  buildPickupPayload,
  buildWarehousePayload,
  pickupDateForOrder,
  speedoPostPickupSlot,
  speedoPostWarehouseName,
} from "./speedopost.booking.mapper";

const VENDOR_ID = "speedopost";

/**
 * Their own identifier for us, required on every order and explained nowhere.
 * Their example sends "API". We cannot guess it: a wrong value is either
 * refused or files the order under somebody else's client, so an unset variable
 * refuses to book rather than defaulting.
 */
const CLIENT_CODE = process.env.SPEEDOPOST_CLIENT_CODE ?? "";

/**
 * Field names a waybill might arrive under on CreateOrder.
 *
 * Their documentation says only that "the response will provide the status and
 * order details", with no example, so this is a list of candidates rather than
 * a schema. `awbNumber` is what TrackingDetails calls the same number, so it
 * leads. `serviceProviderAwbNumber` is deliberately LAST and deliberately
 * present: it is the downstream courier's waybill, which TrackingDetails will
 * not accept as input, so taking it would leave us holding a number we cannot
 * track. Better than nothing, worse than everything above it.
 */
const AWB_FIELDS = [
  "awbNumber",
  "awb_number",
  "awb",
  "waybill",
  "orderAwbNumber",
  "serviceProviderAwbNumber",
] as const;

/** File extension for a label's content type. Defaults to pdf, the usual case. */
function extensionFor(mimeType: string): string {
  const subtype = mimeType.split(";")[0].trim().split("/")[1] ?? "pdf";
  if (subtype === "jpeg") return "jpg";
  return /^[a-z0-9]+$/i.test(subtype) ? subtype : "pdf";
}

export class SpeedoPostBookingAdapter extends BaseBookingAdapter {
  readonly vendorId = VENDOR_ID;
  readonly vendorName = "SpeedoPost";

  isConfigured(): boolean {
    return isSpeedoPostConfigured() && Boolean(CLIENT_CODE);
  }

  /**
   * SpeedoPost fails this check for a reason nobody would guess from the
   * caller's default wording.
   *
   * Quoting and tracking need only the login, so an account that prices
   * perfectly well can still be unable to book, and the generic "API
   * credentials are not configured" then sends somebody to re-check a username
   * and password that are correct. That is the same wasted trip the auth-failure
   * hint in lib/speedopost/client.ts exists to prevent, one layer up.
   */
  configurationGap(): string | null {
    if (!isSpeedoPostConfigured()) {
      return "SPEEDOPOST_USER_ID and SPEEDOPOST_PASSWORD are not set on the server.";
    }
    if (!CLIENT_CODE) {
      return (
        "SPEEDOPOST_CLIENT_CODE is not set on the server. The login is fine, so " +
        "quoting and tracking still work, but SpeedoPost requires a clientCode on " +
        "every order and refuses one without it. Ask SpeedoPost for the clientCode " +
        "on our account, set the variable and restart the server."
      );
    }
    return null;
  }

  // -- Pickup point ------------------------------------------------------------

  /**
   * Register the collection address.
   *
   * Returns the warehouse NAME as the pickup point id, because that is the key
   * SpeedoPost actually uses: `CreateOrder` and `CreatePickupRequest` both take
   * `warehouseName`, and the `warehouseId` they hand back is accepted by
   * nothing. Persisting the id would leave the booking holding the one field it
   * cannot spend.
   */
  async ensurePickupPoint(
    request: CanonicalBookingRequest,
  ): Promise<PickupPointResult> {
    const payload = buildWarehousePayload(request);

    try {
      const created = await createWarehouse(payload);
      return { pickupPointId: created.warehouseName };
    } catch (err) {
      // What SpeedoPost does when a warehouse name is registered twice is
      // undocumented and untested (speedopostBooking.md §6, question 4). If the
      // refusal is that the name already exists, the address we need is already
      // there under the name we just sent, and failing the booking over it would
      // be refusing to use something we have. Any other refusal still fails.
      if (isAlreadyExists(err)) {
        return { pickupPointId: payload.warehouseName };
      }
      throw this.toBookingError(err);
    }
  }

  // -- Order -------------------------------------------------------------------

  async createOrder(
    request: CanonicalBookingRequest,
    pickupPointId: string | null,
  ): Promise<CreateOrderResult> {
    const courierId = request.service.courierId?.trim();

    // The one refusal that is not about connectivity. SpeedoPost reads a missing
    // provider code as permission to choose a courier itself and then reports
    // success, so an auto-assign here is not a degraded booking, it is a parcel
    // on a carrier nobody picked at a price nobody quoted.
    if (!courierId) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "SpeedoPost will not be asked to book without the exact service provider code, because a missing one makes them pick a courier at random and call it a success. Place this order by hand.",
        { retriable: false },
      );
    }

    // Falls back to recomputing the name rather than failing: it is derived from
    // the shipment number, so the value is the same either way, and a booking
    // should not stall on a field it can rebuild.
    const warehouseName = pickupPointId?.trim() || speedoPostWarehouseName(request);

    const provider = await this.lookupProvider(courierId);
    const slot = speedoPostPickupSlot(new Date());

    let payload;
    try {
      payload = buildCreateOrderPayload({
        request,
        warehouseName,
        courierId,
        orderType: provider.orderType,
        clientCode: CLIENT_CODE,
        // The same IST day the pickup will be asked for, NOT the booking date.
        // A retry days later would otherwise send a pickupDate already in the
        // past at their end.
        pickupDate: pickupDateForOrder(slot),
      });
    } catch (err) {
      if (err instanceof SpeedoPostBookingDataError) {
        throw new BookingAdapterError(VENDOR_ID, err.message, {
          retriable: false,
          cause: err,
        });
      }
      throw this.toBookingError(err);
    }

    let data: SpeedoPostCreateOrderData | null;
    try {
      data = await createOrder(payload);
    } catch (err) {
      throw this.toCreateOrderError(err);
    }

    // Logged in full, once per order, because this shape has never been
    // documented or observed. It is the evidence that lets
    // SpeedoPostCreateOrderData stop being a list of optional guesses.
    console.info(
      `[speedopost] CreateOrder response for ${request.displayReference}:`,
      JSON.stringify(data),
    );

    const awbNumber = readAwb(data);

    if (!awbNumber) {
      // The order almost certainly exists at SpeedoPost and we hold no waybill
      // for it. Permanent by design: a retry would create a SECOND order in the
      // same unusable state. Ops read the AWB out of the panel and record it.
      throw new BookingAdapterError(
        VENDOR_ID,
        `SpeedoPost accepted the order for ${request.displayReference} but returned no waybill we could read. ` +
          `The order is likely to exist at their end. Do not re-drive this booking: find it in the SpeedoPost panel ` +
          `and record the AWB by hand. Response was: ${JSON.stringify(data)?.slice(0, 400)}`,
        { retriable: false },
      );
    }

    return { vendorOrderId: awbNumber };
  }

  // -- Waybill -----------------------------------------------------------------

  /**
   * No vendor call. SpeedoPost assigned the courier when the order was created,
   * so the waybill is already the vendorOrderId and this step only reports it.
   *
   * The courier's NAME is read from the provider catalogue rather than from the
   * order response, for two reasons: the response shape is unconfirmed, and the
   * catalogue is the same source the rate card named the service from, so what
   * the customer is told here cannot contradict what they bought.
   */
  async assignCarrier(input: {
    vendorOrderId: string;
    courierId?: string | null;
  }): Promise<AssignedCarrier> {
    const awbNumber = input.vendorOrderId.trim();

    if (!awbNumber) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "SpeedoPost returns the waybill when the order is created, and no waybill is on file for this shipment.",
        { retriable: false },
      );
    }

    let courierName: string | null = null;
    const courierId = input.courierId?.trim();

    if (courierId) {
      try {
        const provider = await this.lookupProvider(courierId);
        courierName = speedoPostServiceName(provider.name, provider.orderType);
      } catch {
        // A name is a label on a notification. Failing an assigned, waybilled
        // booking to go and fetch one would be the wrong trade.
        courierName = null;
      }
    }

    return { awbNumber, courierName, trackingUrl: null };
  }

  // -- Pickup ------------------------------------------------------------------

  /**
   * Ask the chosen carrier to collect.
   *
   * A separate call here, unlike Shipmozo where it hangs off the order. Best
   * effort, as the base class intends: the job swallows a failure, because
   * nothing at SpeedoPost un-books an order that could not get a collection
   * slot, and failing here would re-enter a run holding an AWB it can no longer
   * use. An uncollected order is a phone call; a duplicated one is a parcel.
   */
  async schedulePickup(input: SchedulePickupInput): Promise<void> {
    const courierId = input.courierId?.trim();
    if (!courierId) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "SpeedoPost schedules a pickup per carrier, and no service provider code is on file for this shipment.",
        { retriable: false },
      );
    }

    const warehouseName =
      input.pickupPointId?.trim() || speedoPostWarehouseName(input.request);

    try {
      await createPickupRequest(
        buildPickupPayload({
          request: input.request,
          warehouseName,
          courierId,
          // Recomputed rather than carried from create-order, because this runs
          // as its own step and may be minutes or a retry later. Their
          // validation is against IST now, not against when we decided.
          slot: speedoPostPickupSlot(new Date()),
        }),
      );
    } catch (err) {
      throw this.toBookingError(err);
    }
  }

  // -- Label -------------------------------------------------------------------

  /**
   * The carrier's waybill.
   *
   * PrintLabel's success shape is undocumented — their only captured example is
   * "Shipment not found." — so all three plausible answers are handled: a PDF
   * body, a JSON envelope carrying a URL, and one carrying base64. Anything else
   * fails with the first part of what actually came back, so the next person
   * reads the answer instead of guessing again.
   */
  async fetchLabel(input: {
    vendorOrderId: string;
    awbNumber: string;
  }): Promise<LabelFile> {
    const awb = input.awbNumber.trim() || input.vendorOrderId.trim();

    let raw;
    try {
      raw = await printLabel(awb);
    } catch (err) {
      throw this.toBookingError(err);
    }

    const resolved = await this.resolveLabelBytes(raw, awb);

    return {
      bytes: resolved.bytes,
      mimeType: resolved.mimeType,
      fileName: `AWB-${awb}.${extensionFor(resolved.mimeType)}`,
    };
  }

  private async resolveLabelBytes(
    raw: { bytes: Uint8Array; contentType: string; text: string },
    awb: string,
  ): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const looksLikeJson =
      raw.contentType.includes("json") || raw.text.trimStart().startsWith("{");

    // A body that is not JSON is the document itself. PDF is what a waybill
    // normally is, and the magic bytes say so more reliably than a header a
    // proxy may have rewritten.
    if (!looksLikeJson) {
      if (raw.bytes.length === 0) {
        throw new BookingAdapterError(
          VENDOR_ID,
          `SpeedoPost returned an empty label for AWB ${awb}.`,
        );
      }
      const isPdf = raw.text.startsWith("%PDF");
      return {
        bytes: raw.bytes,
        mimeType: isPdf ? "application/pdf" : raw.contentType || "application/pdf",
      };
    }

    let payload: unknown = null;
    try {
      payload = (JSON.parse(raw.text) as { response?: unknown }).response ?? null;
    } catch {
      payload = null;
    }

    const value =
      typeof payload === "string"
        ? payload
        : typeof (payload as { labelUrl?: unknown })?.labelUrl === "string"
          ? (payload as { labelUrl: string }).labelUrl
          : typeof (payload as { url?: unknown })?.url === "string"
            ? (payload as { url: string }).url
            : null;

    if (value && /^https?:\/\//i.test(value.trim())) {
      return this.downloadLabel(value.trim(), awb);
    }

    if (value && isProbablyBase64(value)) {
      const bytes = Uint8Array.from(Buffer.from(stripDataUri(value), "base64"));
      if (bytes.length > 0) {
        return {
          bytes,
          mimeType: readDataUriMime(value) ?? "application/pdf",
        };
      }
    }

    throw new BookingAdapterError(
      VENDOR_ID,
      `SpeedoPost returned a label for AWB ${awb} in a shape this adapter does not recognise. ` +
        `Print it from the SpeedoPost panel and file it against the shipment. Body began: ${raw.text.slice(0, 300)}`,
      { retriable: false },
    );
  }

  /**
   * Fetch a label SpeedoPost pointed at rather than sent.
   *
   * Copied into our own storage by the caller for the same reason Shipmozo's is
   * (lib/booking/labelStorage.ts): a vendor URL is often presigned and short
   * lived, and a customer printing a waybill a week later must not depend on it.
   */
  private async downloadLabel(
    url: string,
    awb: string,
  ): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `SpeedoPost's label URL for AWB ${awb} answered ${res.status} ${res.statusText}.`,
      );
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `SpeedoPost's label URL for AWB ${awb} returned an empty document.`,
      );
    }

    return {
      bytes,
      mimeType: res.headers.get("content-type")?.split(";")[0].trim() || "application/pdf",
    };
  }

  // -- Cancel ------------------------------------------------------------------

  /** `vendorOrderId` is the AWB, which is what their cancel endpoint takes. */
  async cancelOrder(vendorOrderId: string): Promise<void> {
    try {
      await cancelOrderByAwb(vendorOrderId.trim());
    } catch (err) {
      throw this.toBookingError(err);
    }
  }

  // -- Shared ------------------------------------------------------------------

  /**
   * The segment and the vendor's own name for a provider code.
   *
   * `CreateOrder` needs an `orderType` alongside the code and the two must
   * agree, but a shipment only ever stored the code. SpeedoPost publishes the
   * mapping and the codes do not overlap between their two lists, so this is
   * recovered rather than persisted.
   *
   * A code that is not in the catalogue is permanent: it means the service the
   * customer bought is no longer sold, and guessing a segment for it would send
   * a parcel network's code to the freight network or the reverse.
   */
  private async lookupProvider(courierId: string) {
    let catalogue;
    try {
      catalogue = await speedoPostProviderCatalogue();
    } catch (err) {
      throw this.toBookingError(err);
    }

    const provider = catalogue.get(courierId.trim());
    if (!provider) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `SpeedoPost no longer lists service provider ${courierId}, so the service the customer paid for cannot be booked. Ops should re-quote or place this by hand.`,
        { retriable: false },
      );
    }

    return provider;
  }

  /**
   * A SpeedoPost failure as a booking failure.
   *
   * The judgement is the retriable flag. A 4xx means we sent something they will
   * refuse again, and so does a parsed FAIL envelope: neither improves by being
   * repeated four more times over twenty minutes. 408 and 429 are the exceptions
   * because both explicitly mean "later". Anything unrecognised stays retriable,
   * since an unknown failure is more often the network than the request.
   *
   * NOT used by createOrder, which needs the opposite default. See
   * toCreateOrderError.
   */
  private toBookingError(err: unknown): BookingAdapterError {
    if (err instanceof BookingAdapterError) return err;

    if (err instanceof SpeedoPostApiError) {
      const status = err.status;
      const permanentStatus =
        status != null && status >= 400 && status < 500 && status !== 408 && status !== 429;

      return new BookingAdapterError(VENDOR_ID, err.message, {
        retriable: !(permanentStatus || err.vendorRefused),
        status,
        cause: err,
      });
    }

    return new BookingAdapterError(
      VENDOR_ID,
      err instanceof Error ? err.message : "Unknown SpeedoPost error",
      { cause: err },
    );
  }

  /**
   * The same, for the one call that must never be replayed on a maybe.
   *
   * SpeedoPost gives us no way to ask whether they already hold an order under
   * our reference, so a retry after an ambiguous outcome is how one booking
   * becomes two parcels. Everything here is therefore permanent EXCEPT a clean
   * refusal, which is the only outcome we know created nothing.
   *
   * The message carries that distinction, because the person reading it is
   * deciding whether it is safe to press retry.
   */
  private toCreateOrderError(err: unknown): BookingAdapterError {
    if (err instanceof SpeedoPostApiError && err.vendorRefused) {
      return new BookingAdapterError(
        VENDOR_ID,
        `${err.message} (SpeedoPost refused the order, so nothing was created.)`,
        { retriable: false, status: err.status, cause: err },
      );
    }

    const message = err instanceof Error ? err.message : String(err);

    return new BookingAdapterError(
      VENDOR_ID,
      `SpeedoPost did not complete the order and did not say why: ${message}. ` +
        `They publish no way to ask whether the order landed, so this will NOT be retried automatically. ` +
        `Check the SpeedoPost panel before re-driving this booking, or a second parcel will be created.`,
      { retriable: false, cause: err },
    );
  }
}

// --- READING THEIR RESPONSES --------------------------------------------------

/** The first field in AWB_FIELDS that carries something usable. */
function readAwb(data: SpeedoPostCreateOrderData | null): string | null {
  if (!data || typeof data !== "object") return null;

  for (const field of AWB_FIELDS) {
    const value = (data as Record<string, unknown>)[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return null;
}

/**
 * Whether a refusal means "that warehouse is already there".
 *
 * Matched on the message because SpeedoPost has no error codes. Kept narrow: a
 * false positive here books an order against a warehouse that may not hold the
 * address we meant, so it must not catch a general validation failure.
 */
function isAlreadyExists(err: unknown): boolean {
  if (!(err instanceof SpeedoPostApiError) || !err.vendorRefused) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("already exist") ||
    message.includes("already registered") ||
    message.includes("duplicate")
  );
}

function stripDataUri(value: string): string {
  const comma = value.indexOf(",");
  return value.startsWith("data:") && comma > 0 ? value.slice(comma + 1) : value;
}

function readDataUriMime(value: string): string | null {
  const match = value.match(/^data:([^;,]+)[;,]/);
  return match ? match[1] : null;
}

/**
 * A cheap "could this be base64?" test.
 *
 * Length and alphabet only. It exists to keep a short error string or an
 * identifier from being decoded into rubbish and filed as a customer's waybill;
 * anything that passes is decoded and then checked for actually having bytes.
 */
function isProbablyBase64(value: string): boolean {
  const body = stripDataUri(value).replace(/\s+/g, "");
  return body.length > 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(body);
}
