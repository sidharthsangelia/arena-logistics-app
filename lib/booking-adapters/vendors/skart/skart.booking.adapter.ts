/**
 * SKART BOOKING ADAPTER
 * -----------------------------------------------------------------------------
 * Books an export through sKart Express and files its label.
 *
 * ONE vendor call. sKart's /booking-api takes the whole consignment and returns
 * the waybill, the carrier's label and its paperwork together. This is the
 * SINGLE-CALL shape described in the base class: `createBooking` returns an AWB,
 * so the orchestrator skips the assign step entirely and `assignCarrier` is
 * never reached.
 *
 * That single call is also why idempotency here is thinner than Shipmozo's.
 * sKart publishes no "look up my order by reference" endpoint, so
 * findExistingBooking cannot be implemented and a lost response genuinely
 * cannot be distinguished from a failed request. The orchestrator's answer is to
 * make this step non-retriable on anything but a network-level fault, so a
 * booking whose outcome is unknown stops for a human rather than being placed
 * twice. See the note on `call` at the bottom.
 */

import "server-only";

import {
  SkartApiError,
  createBooking as postBooking,
  fetchDocument,
  isSkartConfigured,
  listCountries,
  skartCredentials,
} from "./skart.booking.client";
import {
  buildSkartBookingPayload,
  toSkartShipmentType,
} from "./skart.booking.mapper";
import { skartChannel } from "./skart.booking.strategies";
import {
  type ResolvedSkartCourier,
  resolveSkartCourier,
} from "./skart.courierCatalogue";

import {
  BaseInternationalBookingAdapter,
  BookingAdapterError,
} from "../../core/base.international.adapter";
import type {
  CanonicalIntlBookingRequest,
  CreatedIntlBooking,
  IntlVendorDocument,
  IntlVendorDocumentKind,
} from "../../core/intl.types";
import type { SkartCountryEntry } from "./skart.booking.types";

const VENDOR_ID = "skart";

/**
 * sKart's GST slab id and type.
 *
 * Only the FedEx and UPS channels read these, and sKart publishes /gst-slabs to
 * enumerate them. Held as env overrides on a documented default rather than
 * fetched per booking: the slab for Arena's own exports does not change between
 * consignments, and a lookup on the customer's critical path buys nothing.
 */
const GST_DATA_ID = process.env.SKART_GST_DATA_ID ?? "106";
const GST_TYPE = process.env.SKART_GST_TYPE ?? "1";

export class SkartBookingAdapter extends BaseInternationalBookingAdapter {
  readonly vendorId = VENDOR_ID;
  readonly vendorName = "sKart Express";

  isConfigured(): boolean {
    return isSkartConfigured();
  }

  /**
   * Refuse everything sKart would refuse, before the booking exists.
   *
   * The courier lookup is the important one, and it is deliberately done TWICE
   * — here and again in createBooking — because it is the only check that can
   * say "the service the customer paid for can no longer be addressed". Doing
   * it here means that answer arrives as a named, permanent failure on the
   * booking row rather than as a vendor rejection after the money has moved.
   */
  async preflight(request: CanonicalIntlBookingRequest): Promise<void> {
    if (!request.parcels.length) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "This booking has no packages, so there is nothing to declare to sKart.",
        { retriable: false },
      );
    }

    if (!request.delivery.postalCode.trim()) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "The destination address has no postcode, which sKart requires for an international consignment.",
        { retriable: false },
      );
    }

    if (!request.pickup.phone.trim()) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "The consignor has no phone number on file, and sKart requires one on the exporter.",
        { retriable: false },
      );
    }

    // Resolving the country now both catches an unserviced destination and
    // warms nothing — it is a fresh call — but it is read-only and it means a
    // booking is never created against a destination we then cannot name.
    const countryId = await this.resolveCountryId(request);
    if (!countryId) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `sKart does not list ${request.delivery.countryName || request.delivery.countryCode} as a destination it serves.`,
        { retriable: false },
      );
    }

    // And the exact service sold. Resolved here so a booking is never created
    // for a service we cannot address — see resolveCourier.
    await this.resolveCourier(request);
  }

  /**
   * The service the customer bought, as sKart's numeric courier id.
   *
   * The snapshotted id wins when there is one. Otherwise the catalogue resolves
   * it from the product name and the shipment type — both, because the same
   * carrier carries different ids on the CSB4 and commercial routes.
   *
   * Returned as a string to satisfy the base contract; converted back at the
   * payload boundary. Null means "we cannot identify what was sold", which the
   * caller must treat as terminal.
   */
  async resolveServiceId(
    request: CanonicalIntlBookingRequest,
  ): Promise<string | null> {
    const snapshot = request.service.serviceId?.trim();
    if (snapshot && /^\d+$/.test(snapshot)) return snapshot;

    const resolved = await resolveSkartCourier({
      productName: request.service.productName,
      shipmentType: toSkartShipmentType(request.customs.shipmentType),
    });

    return resolved ? String(resolved.courierId) : null;
  }

  async createBooking(
    request: CanonicalIntlBookingRequest,
    context: { shipperId: string | null; serviceId: string | null },
  ): Promise<CreatedIntlBooking> {
    const resolved = await this.resolveCourier(request);

    // The orchestrator's snapshotted id wins when it has one, because that is
    // what was confirmed at the resolve step. The catalogue entry is still what
    // names the carrier family, and therefore which payload variant goes out.
    const snapshot = Number(context.serviceId);
    const courierId =
      Number.isFinite(snapshot) && snapshot > 0 ? snapshot : resolved.courierId;

    const destinationCountryId = await this.resolveCountryId(request);
    if (!destinationCountryId) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `sKart does not list ${request.delivery.countryName || request.delivery.countryCode} as a destination it serves.`,
        { retriable: false },
      );
    }

    const channel = skartChannel(resolved.family);

    const payload = buildSkartBookingPayload(request, {
      credentials: skartCredentials(),
      courierId,
      destinationCountryId,
      channel,
      gstDataId: GST_DATA_ID,
      gstType: GST_TYPE,
    });

    const result = await this.call(() => postBooking(payload));

    const awbNumber = result.airwaybilno?.trim();
    if (!awbNumber) {
      // sKart accepted the booking but named no waybill. There is no lookup
      // endpoint to recover it and a retry would book a second consignment, so
      // this needs a person with the sKart panel open.
      throw new BookingAdapterError(
        VENDOR_ID,
        "sKart accepted the booking but returned no AWB. Check the sKart panel before retrying — a retry would place a second booking.",
        { retriable: false },
      );
    }

    return {
      // sKart has no order handle distinct from the waybill; the AWB is how
      // every later call addresses the booking.
      vendorOrderId: awbNumber,
      awbNumber,
      // The product sKart itself names, not the family, so ops and the customer
      // see the service that was actually bought.
      carrierName: resolved.productName ?? channel.label,
      trackingUrl: null,
      vendorPickupId: result.pickup_id?.trim() || null,
      documents: collectDocumentRefs(result),
    };
  }

  /**
   * Download the PDFs sKart returned with the booking.
   *
   * Only the LABEL is ever shown to the customer; the invoice and proforma are
   * vendor-branded and stay internal, and the invoice the customer sees is
   * Arena's own. See carrierBranding.md and the IntlVendorDocumentKind doc.
   *
   * A missing label is fatal — the customer was promised one. A missing extra
   * is not, and is skipped rather than failing a booking that has otherwise
   * completely succeeded.
   */
  async fetchDocuments(input: {
    vendorOrderId: string;
    awbNumber: string;
    documents?: CreatedIntlBooking["documents"];
  }): Promise<IntlVendorDocument[]> {
    const refs = input.documents ?? [];

    if (refs.length === 0) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `sKart returned no document URLs for AWB ${input.awbNumber}, and publishes no endpoint to ask again.`,
        { retriable: false },
      );
    }

    const documents: IntlVendorDocument[] = [];

    for (const ref of refs) {
      try {
        const file = await fetchDocument(ref.url);
        documents.push({
          kind: ref.kind,
          bytes: file.bytes,
          mimeType: file.mimeType,
          fileName: fileNameFor(ref.kind, input.awbNumber, file.mimeType),
        });
      } catch (err) {
        if (ref.kind === "LABEL") {
          // The one the customer is waiting for. Retriable: an S3 URL that
          // 500s once usually serves on the second attempt, and the booking
          // itself has already succeeded so a retry costs nothing but time.
          throw new BookingAdapterError(
            VENDOR_ID,
            `Could not download the shipping label for AWB ${input.awbNumber}: ${err instanceof Error ? err.message : "unknown error"}`,
            { retriable: true, cause: err },
          );
        }
        // An ops-only document. Not worth failing a completed booking over.
      }
    }

    return documents;
  }

  /**
   * sKart publishes no cancel endpoint for an export booking.
   *
   * /cancel-pickup exists but cancels a COLLECTION on a pre-placed import
   * booking, which is a different thing entirely. Saying so plainly is better
   * than calling it and reporting a success that did not happen.
   */
  async cancelBooking(vendorOrderId: string): Promise<void> {
    throw new BookingAdapterError(
      VENDOR_ID,
      `sKart exposes no API to cancel an export booking. Cancel AWB ${vendorOrderId} in the sKart panel, then mark it cancelled here.`,
      { retriable: false },
    );
  }

  // findExistingBooking is deliberately NOT implemented: sKart has no lookup by
  // our own reference, so the base class's null is the honest answer. The
  // orchestrator compensates by not retrying an ambiguous create — see `call`.

  // -------------------------------------------------------------------------

  /**
   * The courier the customer bought, with the family that decides the payload.
   *
   * Throws rather than returning null: every caller treats "cannot identify the
   * service" as terminal, and an adapter that never auto-assigns has nothing
   * else to do with the answer. An international carrier is not interchangeable
   * — transit time, duty handling and customs paperwork all differ, and the
   * customer chose on those.
   */
  private async resolveCourier(
    request: CanonicalIntlBookingRequest,
  ): Promise<ResolvedSkartCourier> {
    const productName = request.service.productName;

    const resolved = await resolveSkartCourier({
      productName,
      shipmentType: toSkartShipmentType(request.customs.shipmentType),
    });

    if (!resolved) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `sKart lists no courier for "${productName ?? "this service"}" on a ${
          request.customs.shipmentType
        } export. The service may no longer be offered on this route, and shipping on a different carrier is not a decision to make automatically, so this booking has to be placed by hand.`,
        { retriable: false },
      );
    }

    return resolved;
  }

  /**
   * sKart's numeric id for the destination.
   *
   * ── THE FIELD NAMES ARE THE WHOLE STORY ───────────────────────────────────
   * This used to read `id`, `name`, `iso2` and `code`. GET /country emits
   * `country_id`, `country_name` and `country_code` and none of the others, so
   * the match never succeeded and every sKart export was refused at preflight
   * with "sKart does not list … as a destination it serves". The legacy names
   * are still accepted, second, so an older response shape still resolves.
   */
  private async resolveCountryId(
    request: CanonicalIntlBookingRequest,
  ): Promise<number | null> {
    let countries: SkartCountryEntry[];
    try {
      countries = await listCountries();
    } catch (err) {
      // A list we could not fetch is a network problem, not an unknown
      // destination, and the two must not produce the same permanent failure.
      throw new BookingAdapterError(
        VENDOR_ID,
        err instanceof Error
          ? `Could not read sKart's country list: ${err.message}`
          : "Could not read sKart's country list.",
        { retriable: true, cause: err },
      );
    }

    const code = request.delivery.countryCode.trim().toUpperCase();
    const name = request.delivery.countryName.trim().toUpperCase();

    const match = countries.find((c) => {
      const entryCode = (c.country_code ?? c.iso2 ?? c.code)
        ?.trim()
        .toUpperCase();
      const entryName = (c.country_name ?? c.name)?.trim().toUpperCase();
      // The ISO code first: two countries can share a name spelling in a way
      // two codes cannot.
      return (code && entryCode === code) || (name && entryName === name);
    });

    const id = match?.country_id ?? match?.id;
    if (id == null) return null;
    const parsed = Number(String(id).trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  /**
   * One place where a sKart failure becomes a booking failure.
   *
   * STRICTER THAN SHIPMOZO'S, on purpose. Shipmozo can be asked "do you already
   * hold an order under our reference?", so an ambiguous failure there is
   * recoverable and its envelope errors stay retriable. sKart cannot be asked,
   * and it books in a single call, so a retry after an ambiguous failure risks
   * a SECOND export at full price.
   *
   * Therefore: a 5xx or a network fault is retriable, because the request
   * plausibly never landed. Everything else — including their HTTP-200 envelope
   * rejections — is permanent, and ops look at it. Spending four automatic
   * attempts against a vendor that might have accepted the first is the one
   * mistake this layer must not make.
   */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof SkartApiError) {
        const status = err.status;
        const retriable =
          status == null || status >= 500 || status === 408 || status === 429;

        throw new BookingAdapterError(VENDOR_ID, err.message, {
          retriable,
          status,
          cause: err,
        });
      }

      // Not a SkartApiError: a fetch that never got a response. The request may
      // not have landed, so this one IS worth retrying.
      throw new BookingAdapterError(
        VENDOR_ID,
        err instanceof Error ? err.message : "Unknown sKart error",
        { retriable: true, cause: err },
      );
    }
  }
}

// ---------------------------------------------------------------------------

/** The four PDFs, in the order they matter. Absent ones are simply skipped. */
function collectDocumentRefs(
  result: import("./skart.booking.types").SkartBookingResult,
): CreatedIntlBooking["documents"] {
  const candidates: { kind: IntlVendorDocumentKind; url?: string }[] = [
    { kind: "LABEL", url: result.dispatch_url },
    { kind: "COMMERCIAL_INVOICE", url: result.invoice_url },
    { kind: "PROFORMA", url: result.proforma_url },
    { kind: "MERGED", url: result.merge_url },
  ];

  return candidates.flatMap((c) =>
    c.url?.trim() ? [{ kind: c.kind, url: c.url.trim() }] : [],
  );
}

function fileNameFor(
  kind: IntlVendorDocumentKind,
  awb: string,
  mimeType: string,
): string {
  const subtype = mimeType.split(";")[0].trim().split("/")[1] ?? "pdf";
  const ext =
    subtype === "jpeg" ? "jpg" : /^[a-z0-9]+$/i.test(subtype) ? subtype : "pdf";

  const prefix: Record<IntlVendorDocumentKind, string> = {
    LABEL: "AWB",
    COMMERCIAL_INVOICE: "Commercial-invoice",
    PROFORMA: "Proforma",
    MERGED: "Shipping-pack",
  };

  return `${prefix[kind]}-${awb}.${ext}`;
}
