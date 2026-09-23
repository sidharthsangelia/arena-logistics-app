/**
 * ARAMEX BOOKING ADAPTER
 * -----------------------------------------------------------------------------
 * Books an export on the Aramex account that quoted it, and files its label.
 *
 * ONE vendor call. CreateShipments takes the whole consignment and answers with
 * the waybill and a link to the rendered label together. This is the SINGLE-CALL
 * shape described in BaseInternationalBookingAdapter: `createBooking` returns an
 * AWB, so the orchestrator skips the assign step and `assignCarrier` is never
 * reached.
 *
 * ── THE THING THIS ADAPTER EXISTS TO GET RIGHT ──────────────────────────────
 * Arena holds several Aramex contracts with different tariffs (see
 * lib/aramex/accounts.ts). The rate adapter quotes the cheapest and stamps that
 * account's key onto the quote; the platform snapshots it onto
 * `Shipment.selectedCourierId` and hands it back here as `service.serviceId`.
 *
 * This adapter books on THAT ACCOUNT AND NO OTHER. If the key is missing or
 * names an account that is no longer configured, it REFUSES rather than picking
 * one — an export billed to a contract that did not sell it is an invoice line
 * nobody can reconcile three weeks later, and quietly choosing for someone is
 * how that happens. `resolveServiceId` returning null is the mechanism, and the
 * orchestrator already treats null as terminal.
 *
 * ── DUPLICATE PROTECTION ────────────────────────────────────────────────────
 * Aramex publishes no lookup by our own reference, so `findExistingBooking`
 * cannot be implemented and a lost response genuinely cannot be told from a
 * failed request. Two things compensate:
 *
 *   1. ForeignHAWB carries our shipment number and Aramex enforces it as
 *      unique, so a duplicate create is REFUSED rather than accepted. The
 *      refusal is recognised below and reported as "you probably already have
 *      an AWB" rather than as a generic failure.
 *   2. `call` makes anything Aramex actually rejected non-retriable, so a
 *      booking whose outcome is unknown stops for a human instead of being
 *      placed twice.
 */

import "server-only";

import {
  ARAMEX_CUSTOMER_PRODUCT_NAME,
  aramexAccountByKey,
  aramexAccounts,
  aramexClientInfo,
  aramexConfigurationGap,
  isAramexConfigured,
  type AramexAccount,
} from "@/lib/aramex/accounts";
import {
  describeNotifications,
  looksLikeAramexDuplicate,
} from "@/lib/aramex/notifications";

import {
  BaseInternationalBookingAdapter,
  BookingAdapterError,
} from "../../core/base.international.adapter";
import type {
  CanonicalIntlBookingRequest,
  CreatedIntlBooking,
  IntlVendorDocument,
} from "../../core/intl.types";

import {
  AramexApiError,
  createShipments,
  fetchDocument,
  holdShipments,
  isAddressServiced,
} from "./aramex.booking.client";
import {
  ARAMEX_PRODUCT_GROUP,
  ARAMEX_PRODUCT_TYPE,
  buildAramexBookingPayload,
} from "./aramex.booking.mapper";
import type {
  AramexAddressValidationRequest,
  AramexAddressValidationResponse,
  AramexCreateShipmentsResponse,
  AramexHoldShipmentsRequest,
  AramexHoldShipmentsResponse,
  AramexProcessedShipment,
} from "./aramex.booking.types";

const VENDOR_ID = "aramex";

export class AramexBookingAdapter extends BaseInternationalBookingAdapter {
  readonly vendorId = VENDOR_ID;
  readonly vendorName = "Aramex";

  isConfigured(): boolean {
    return isAramexConfigured();
  }

  configurationGap(): string | null {
    return aramexConfigurationGap();
  }

  /**
   * Refuse everything Aramex would refuse, before the export exists.
   *
   * The account check is the important one and it is done here as well as in
   * createBooking, because it is the only check that can say "the contract that
   * sold this can no longer be billed". Discovering that here means a named,
   * permanent failure on the booking row instead of a rejection after the money
   * has moved.
   */
  async preflight(request: CanonicalIntlBookingRequest): Promise<void> {
    if (!request.parcels.length) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "This booking has no packages, so there is nothing to declare to Aramex.",
        { retriable: false },
      );
    }

    if (!request.items.length) {
      // PPX is a dutiable product type: Aramex requires an itemised customs
      // declaration and rejects the shipment without one.
      throw new BookingAdapterError(
        VENDOR_ID,
        "This booking has no item lines, and Aramex requires an itemised customs declaration for a parcel export.",
        { retriable: false },
      );
    }

    if (!request.pickup.phone.trim()) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "The consignor has no phone number on file, and Aramex requires one on the shipper.",
        { retriable: false },
      );
    }

    if (!request.delivery.phone.trim()) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "The receiver has no phone number on file, and Aramex requires one on the consignee.",
        { retriable: false },
      );
    }

    if (!(request.customs.declaredValue > 0)) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "This booking has no declared value, which Aramex requires on a dutiable parcel export.",
        { retriable: false },
      );
    }

    // The contract that sold this service. Throws when it cannot be named.
    this.requireAccount(request);

    await this.checkServiceability(request);
  }

  /**
   * The Aramex account the customer's price came from.
   *
   * Unlike every other vendor's implementation of this method, there is no
   * fallback resolution from the product name — and there must not be one. Our
   * accounts sell the SAME product at different prices, so a product name
   * identifies the service perfectly and the billing account not at all. Any
   * "helpful" guess here picks a contract at random and misfiles the invoice.
   *
   * Null means the account cannot be named, which the orchestrator treats as
   * terminal. That is the correct outcome: every Aramex shipment quoted before
   * this integration existed has no account key, and those are exactly the
   * bookings a person should place by hand. It is also what they do today.
   */
  async resolveServiceId(
    request: CanonicalIntlBookingRequest,
  ): Promise<string | null> {
    return aramexAccountByKey(request.service.serviceId)?.key ?? null;
  }

  async createBooking(
    request: CanonicalIntlBookingRequest,
    context: { shipperId: string | null; serviceId: string | null },
  ): Promise<CreatedIntlBooking> {
    // The orchestrator's resolved id wins when it has one — that is the value
    // confirmed at the resolve step — and it is re-validated rather than
    // trusted, because an account can be removed from the environment between
    // the two steps of a durable function that may be hours apart.
    const account =
      aramexAccountByKey(context.serviceId) ?? this.requireAccount(request);

    const payload = buildAramexBookingPayload(request, { account });

    const response = await this.call(() =>
      createShipments<AramexCreateShipmentsResponse>(payload),
    );

    const processed = readProcessedShipment(response);

    // Aramex reports per-shipment failures INSIDE a response whose envelope says
    // HasErrors: false, so the client's envelope check does not catch this one.
    if (!processed || processed.HasErrors) {
      const detail = describeNotifications(
        processed?.Notifications,
        "Aramex accepted the request but did not book the shipment.",
      );
      throw this.rejection(detail);
    }

    const awbNumber = processed.ID?.trim();
    if (!awbNumber) {
      // Aramex accepted the booking and named no waybill. There is no lookup
      // endpoint to recover it and a retry would book a second export, so this
      // needs a person with the Aramex panel open.
      throw new BookingAdapterError(
        VENDOR_ID,
        "Aramex accepted the booking but returned no AWB. Check the Aramex panel before retrying — a retry would place a second booking.",
        { retriable: false },
      );
    }

    const labelUrl = processed.ShipmentLabel?.LabelURL?.trim();

    return {
      // Aramex has no order handle distinct from the waybill; the AWB is how
      // every later call addresses the booking.
      vendorOrderId: awbNumber,
      awbNumber,
      // Account-neutral, and stored on the shipment for the customer to read.
      // Which of our contracts carried it is recorded separately, on
      // selectedCourierId. See lib/aramex/accountKeys.ts.
      carrierName: ARAMEX_CUSTOMER_PRODUCT_NAME,
      trackingUrl: `https://www.aramex.com/us/en/track/results?ShipmentNumber=${encodeURIComponent(awbNumber)}`,
      // Aramex collects nothing: Arena delivers to their hub. See the note on
      // arenaHandlesFirstMile in intl.types.ts.
      vendorPickupId: null,
      documents: labelUrl ? [{ kind: "LABEL", url: labelUrl }] : [],
    };
  }

  /**
   * Download the label Aramex rendered with the booking.
   *
   * A missing label is fatal and RETRIABLE: the booking itself has already
   * succeeded, so another attempt costs nothing but time, and Aramex's report
   * server answering badly once is the common case this recovers from.
   */
  async fetchDocuments(input: {
    vendorOrderId: string;
    awbNumber: string;
    documents?: CreatedIntlBooking["documents"];
  }): Promise<IntlVendorDocument[]> {
    const label = (input.documents ?? []).find((d) => d.kind === "LABEL");

    if (!label) {
      // The label URL comes back exactly once, from the booking call, and is
      // persisted on the shipment for this reason. Reaching here means it was
      // never there.
      throw new BookingAdapterError(
        VENDOR_ID,
        `Aramex returned no label link for AWB ${input.awbNumber}. The label has to be printed from the Aramex panel.`,
        { retriable: false },
      );
    }

    const file = await this.call(() => fetchDocument(label.url), {
      // Downloading a rendered PDF mutates nothing, so the duplicate-booking
      // reasoning behind the strict default does not apply here.
      retriableByDefault: true,
    });

    return [
      {
        kind: "LABEL",
        bytes: file.bytes,
        mimeType: file.mimeType,
        fileName: `AWB-${input.awbNumber}.pdf`,
      },
    ];
  }

  /**
   * Stop a booked consignment.
   *
   * Aramex has no "cancel" for a created shipment — HoldShipments is the
   * documented way to take one out of the network, and it is what their own
   * collection labels "Cancel Order". The AWB stays issued, which is worth
   * saying plainly in the message rather than reporting a deletion that did not
   * happen.
   */
  async cancelBooking(vendorOrderId: string): Promise<void> {
    const accounts = aramexAccounts();

    if (accounts.length === 0) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `Aramex is not configured, so AWB ${vendorOrderId} cannot be held from here. Hold it in the Aramex panel.`,
        { retriable: false },
      );
    }

    /**
     * Every account, until one of them owns the waybill.
     *
     * The base signature hands this method an AWB and nothing else — there is
     * no account context, and the shipment's account key is not in scope here.
     * A waybill belongs to exactly one of Arena's contracts, and asking the
     * wrong one to hold it is simply refused, so the accounts are tried in turn.
     *
     * Holding is idempotent at Aramex's end (a held shipment held again is
     * still held), which is what makes trying more than one safe. The last
     * failure is reported when none of them owned it, because that is the one
     * carrying Aramex's own wording.
     */
    let lastError: unknown = null;

    for (const account of accounts) {
      const payload: AramexHoldShipmentsRequest = {
        ClientInfo: aramexClientInfo(account),
        Transaction: { Reference1: vendorOrderId },
        ShipmentHolds: [
          {
            ShipmentNumber: vendorOrderId,
            Comment: "Cancelled by Arena Logistics",
          },
        ],
      };

      try {
        await this.call(
          () => holdShipments<AramexHoldShipmentsResponse>(payload),
          { retriableByDefault: true },
        );
        return;
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError instanceof BookingAdapterError
      ? lastError
      : new BookingAdapterError(
          VENDOR_ID,
          `No Aramex account was able to hold AWB ${vendorOrderId}. Hold it in the Aramex panel.`,
          { retriable: false, cause: lastError },
        );
  }

  // findExistingBooking is deliberately NOT implemented: Aramex has no lookup by
  // our own reference, so the base class's null is the honest answer. What
  // prevents a duplicate is ForeignHAWB uniqueness plus `call` refusing to retry
  // anything Aramex actually rejected. See the class header.

  // -------------------------------------------------------------------------

  /** The account that quoted this, or a refusal naming why it cannot be found. */
  private requireAccount(request: CanonicalIntlBookingRequest): AramexAccount {
    const key = request.service.serviceId?.trim();

    if (!key) {
      throw new BookingAdapterError(
        VENDOR_ID,
        "This shipment does not record which Aramex account quoted it, so there is no way to bill the export to the contract that sold it. It has to be booked by hand.",
        { retriable: false },
      );
    }

    const account = aramexAccountByKey(key);

    if (!account) {
      throw new BookingAdapterError(
        VENDOR_ID,
        `The Aramex account this shipment was quoted on ("${key}") is no longer configured on the server. Booking it on a different account would bill the export to the wrong contract, so this one has to be placed by hand.`,
        { retriable: false },
      );
    }

    return account;
  }

  /**
   * Ask Aramex, read-only, whether they serve the destination.
   *
   * ADVISORY BY DESIGN, and this is the deliberate difference from sKart's
   * preflight. Aramex signals "not serviced" through the same `HasErrors` flag
   * they use for a rotated PIN and for a malformed request — there is no
   * boolean to read. So a hard refusal here would turn a credential problem
   * into "Aramex does not deliver to Germany", which sends ops to the wrong
   * place entirely.
   *
   * The result: a clear "not serviced" answer stops the booking with Aramex's
   * own wording, and ANY failure of the check itself is ignored. A read-only
   * probe must never be the reason a booking Aramex would have accepted does
   * not happen.
   */
  private async checkServiceability(
    request: CanonicalIntlBookingRequest,
  ): Promise<void> {
    const account = aramexAccountByKey(request.service.serviceId);
    if (!account) return;

    const payload: AramexAddressValidationRequest = {
      ClientInfo: aramexClientInfo(account),
      Address: {
        Line1: request.delivery.line1 || request.delivery.city,
        Line2: request.delivery.line2 ?? "",
        Line3: "",
        City: request.delivery.city,
        StateOrProvinceCode: request.delivery.stateCode ?? "",
        PostCode: request.delivery.postalCode,
        CountryCode: request.delivery.countryCode.toUpperCase(),
      },
      ServiceDetails: {
        ProductGroup: ARAMEX_PRODUCT_GROUP,
        ProductType: ARAMEX_PRODUCT_TYPE,
        ServiceMode: 1,
      },
      Transaction: { Reference1: request.displayReference },
    };

    let response: AramexAddressValidationResponse;
    try {
      response = await isAddressServiced<AramexAddressValidationResponse>(payload);
    } catch {
      // The probe itself failed. Say nothing and let the booking call be the
      // judge — it is the one that matters.
      return;
    }

    if (!response.HasErrors) return;

    const detail = describeNotifications(
      response.Notifications,
      "Aramex did not say why.",
    );

    throw new BookingAdapterError(
      VENDOR_ID,
      `Aramex will not accept a consignment to ${request.delivery.city}, ${request.delivery.countryName || request.delivery.countryCode}: ${detail}`,
      { retriable: false },
    );
  }

  /**
   * One place where an Aramex failure becomes a booking failure.
   *
   * STRICT BY DEFAULT, for the same reason sKart's is. Aramex books in a single
   * call and cannot be asked whether it already holds our order, so a retry
   * after an ambiguous failure risks a SECOND export at full price.
   *
   * Therefore the default is: a transport fault or a 5xx is retriable, because
   * the request plausibly never landed. Anything Aramex itself rejected — which
   * is everything arriving as HasErrors at HTTP 200 — is permanent, and ops look
   * at it. Spending four automatic attempts against a vendor that might have
   * accepted the first is the one mistake this layer must not make.
   *
   * `retriableByDefault` lifts that for calls that create nothing: downloading a
   * label and holding a shipment are both safe to repeat.
   */
  private async call<T>(
    fn: () => Promise<T>,
    options: { retriableByDefault?: boolean } = {},
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AramexApiError) {
        switch (err.kind) {
          case "rejection":
            // Aramex read the request and said no. Permanent unless the call
            // creates nothing.
            throw this.rejection(err.message, {
              retriable: options.retriableByDefault,
              cause: err,
            });

          case "transport":
            // Nothing came back, so the request may never have arrived. This is
            // the one ambiguous case worth retrying: an export that was never
            // pushed has to be pushed, and Aramex's own ForeignHAWB uniqueness
            // is what stops the other reading from costing a second one.
            throw new BookingAdapterError(VENDOR_ID, err.message, {
              retriable: true,
              cause: err,
            });

          case "http":
            throw new BookingAdapterError(VENDOR_ID, err.message, {
              retriable:
                options.retriableByDefault ||
                (err.status ?? 0) >= 500 ||
                err.status === 408 ||
                err.status === 429,
              status: err.status,
              cause: err,
            });
        }
      }

      if (err instanceof BookingAdapterError) throw err;

      throw new BookingAdapterError(
        VENDOR_ID,
        err instanceof Error ? err.message : "Unknown Aramex error",
        { retriable: true, cause: err },
      );
    }
  }

  /**
   * An Aramex refusal, with the duplicate case called out.
   *
   * The duplicate message is the one worth getting right. Aramex enforcing
   * ForeignHAWB uniqueness is what stops a retry becoming a second export, and
   * an operator who reads "booking failed" for that goes and books it again by
   * hand — which is exactly the outcome the constraint prevented.
   */
  private rejection(
    detail: string,
    options: { retriable?: boolean; cause?: unknown } = {},
  ): BookingAdapterError {
    if (looksLikeAramexDuplicate(detail)) {
      return new BookingAdapterError(
        VENDOR_ID,
        `Aramex already holds a shipment under this booking's reference, which means it was almost certainly booked already. Find the AWB in the Aramex panel and record it here rather than booking again. Aramex said: ${detail}`,
        { retriable: false, cause: options.cause },
      );
    }

    return new BookingAdapterError(VENDOR_ID, `Aramex refused the booking: ${detail}`, {
      retriable: options.retriable ?? false,
      cause: options.cause,
    });
  }
}

// ---------------------------------------------------------------------------

/**
 * The one shipment out of a response that carries a list.
 *
 * Accepts both field names the two published shapes use. A response with
 * neither returns null and the caller reports a refusal, which beats reading
 * `undefined[0]` and reporting a crash.
 */
function readProcessedShipment(
  response: AramexCreateShipmentsResponse,
): AramexProcessedShipment | null {
  const list = response.Shipments ?? response.ProcessedShipments ?? [];
  return list[0] ?? null;
}
