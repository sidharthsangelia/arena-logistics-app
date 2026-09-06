/**
 * SHIPMOZO DOMESTIC ADAPTER
 * -----------------------------------------------------------------------------
 * Talks to Shipmozo's DOMESTIC rate calculator (POST /rate-calculator) and
 * translates between the app's canonical shapes and Shipmozo's payload.
 *
 * This is deliberately a near-clone of the international ShipmozoAdapter, minus
 * the country-resolution round trip: domestic shipments are India → India, so
 * there is no delivery_country_id to look up. transformRequest builds the full
 * payload synchronously; callVendorApi just POSTs it.
 *
 * Each courier option Shipmozo returns becomes one canonical RateQuote. They
 * all carry vendorId "shipmozo" (so they get the same badge treatment as the
 * international Shipmozo results); the courier name goes in productName so the
 * results list shows one card per courier to compare.
 */

import { BaseVendorAdapter } from "../../core/base.adapter";
import type {
  CanonicalChargeBreakdown,
  CanonicalRateRequest,
  RateQuote,
} from "../../core/types";
import type {
  ShipmozoDomesticDimensionBox,
  ShipmozoDomesticPackageType,
  ShipmozoDomesticRatePayload,
  ShipmozoDomesticRateProduct,
  ShipmozoDomesticRateResponse,
} from "./shipmozo-domestic.types";
import {
  computeShipmentWeights,
  normalizePackages,
} from "@/lib/pricing/chargeableWeight";
import { applyDomesticCarrierRules } from "@/lib/rates/domesticCarrierRules";
import type { FetchRatesResult } from "../../core/base.adapter";

// --- CONFIG -------------------------------------------------------------------

const SHIPMOZO_BASE_URL =
  process.env.SHIPMOZO_API_URL ?? "https://shipping-api.com/app/api/v1";

const SHIPMOZO_PUBLIC_KEY = process.env.SHIPMOZO_PUBLIC_KEY ?? "";
const SHIPMOZO_PRIVATE_KEY = process.env.SHIPMOZO_PRIVATE_KEY ?? "";

// Shipmozo's domestic calculator wants an order value (used for ROV / risk and
// COD math). The quick rate calculator does not ask for one, so we fall back to
// this neutral dummy — the booking flow can pass a real value via declaredValue.
const SHIPMOZO_FALLBACK_ORDER_VALUE = Number(
  process.env.SHIPMOZO_DEFAULT_DECLARED_VALUE ?? 50000,
);

/**
 * Above this chargeable weight a consignment is declared multi-piece even when
 * it is one box. See resolvePackageType for what that declaration buys and
 * costs. Not an env var on purpose: it decides what a customer is offered and
 * what the courier is told, so changing it deserves a diff and a review.
 */
const DOMESTIC_MPS_WEIGHT_THRESHOLD_KG = 10;

// --- ADAPTER ------------------------------------------------------------------

export class ShipmozoDomesticAdapter extends BaseVendorAdapter<
  ShipmozoDomesticRatePayload,
  ShipmozoDomesticRateResponse
> {
  readonly vendorId = "shipmozo";
  readonly vendorName = "Shipmozo";

  // -- Step 1: Canonical → Vendor payload -------------------------------------

  protected transformRequest(
    input: CanonicalRateRequest,
  ): ShipmozoDomesticRatePayload {
    if (!input.origin.pincode || !input.destination.pincode) {
      throw new Error(
        "Shipmozo domestic requires both pickup and delivery pincodes.",
      );
    }

    // Shipmozo supports multi-piece natively via the `dimensions` array, so we
    // pass the real per-box array and send the summed ACTUAL weight (grams),
    // letting Shipmozo compute volumetric its own way — same rule as intl.
    const packages = normalizePackages({
      packages: input.shipment.packages,
      weight: input.shipment.weight,
      quantity: input.shipment.quantity,
      dimensions: input.shipment.dimensions,
    });
    const weights = computeShipmentWeights(packages);

    const dimensions: ShipmozoDomesticDimensionBox[] = packages.map((pkg) => ({
      no_of_box: Math.max(1, Math.trunc(pkg.quantity) || 1),
      length: Math.ceil(pkg.lengthCm),
      width: Math.ceil(pkg.widthCm),
      height: Math.ceil(pkg.heightCm),
    }));

    // Cash on delivery is priced, not bolted on: couriers charge a collection
    // fee that differs between them, so quoting prepaid and flipping the order
    // to COD at booking would show the customer a price they never pay. When
    // no COD amount is given we fall back to the declared goods value, which is
    // what the courier would be collecting anyway.
    const isCod = input.shipment.paymentType === "COD";
    const codAmount = isCod
      ? (input.shipment.codAmount ?? this.resolveOrderValue(input))
      : 0;

    return {
      pickup_pincode: input.origin.pincode,
      delivery_pincode: input.destination.pincode,
      payment_type: isCod ? "COD" : "PREPAID",
      shipment_type: "FORWARD",
      order_amount: String(this.resolveOrderValue(input)),
      type_of_package: this.resolvePackageType(input),
      rov_type: "ROV_OWNER",
      cod_amount: isCod ? String(Math.max(0, Math.round(codAmount))) : "",
      // Shipmozo wants weight in GRAM; canonical weight is always KG.
      weight: String(Math.round(weights.totalActualKg * 1000)),
      dimensions,
    };
  }

  // -- Step 2: HTTP call -------------------------------------------------------

  /**
   * POST the payload, and fall back from MPS to SPS when MPS prices nothing.
   *
   * `type_of_package` behaves as a COURIER FILTER on this endpoint rather than
   * a pricing input (see resolvePackageType), so an MPS request can come back
   * successful and completely empty on a lane where SPS would have offered a
   * dozen couriers. That is a dead end for the customer, and on the booking
   * step it is a dead end they reach after entering every address.
   *
   * So an empty MPS result is retried once as SPS. Two deliberate choices here:
   *
   *   • Only an EMPTY result retries. A short MPS list is a real answer — those
   *     couriers accepted the consignment as declared — and quietly widening it
   *     to SPS would undo the declaration the retry exists to protect.
   *
   *   • If the retry itself fails, the original response is returned rather
   *     than the error. The fallback is a bonus; it must never turn a
   *     successful (if empty) call into a vendor error on the results list.
   */
  protected async callVendorApi(
    payload: ShipmozoDomesticRatePayload,
  ): Promise<ShipmozoDomesticRateResponse> {
    const first = await this.postRateCalculator(payload);

    if (payload.type_of_package !== "MPS" || this.productCount(first) > 0) {
      return first;
    }

    try {
      const fallback = await this.postRateCalculator({
        ...payload,
        type_of_package: "SPS",
      });
      return this.productCount(fallback) > 0 ? fallback : first;
    } catch (err) {
      console.warn(
        "[shipmozo-domestic] MPS returned no couriers and the SPS retry failed:",
        err,
      );
      return first;
    }
  }

  private productCount(response: ShipmozoDomesticRateResponse): number {
    return Array.isArray(response.data) ? response.data.length : 0;
  }

  private async postRateCalculator(
    payload: ShipmozoDomesticRatePayload,
  ): Promise<ShipmozoDomesticRateResponse> {
    const res = await fetch(`${SHIPMOZO_BASE_URL}/rate-calculator`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const rawBody = await res.text();

    if (!res.ok) {
      throw new Error(
        `Shipmozo domestic API returned ${res.status} ${res.statusText}: ${rawBody}`,
      );
    }

    let json: ShipmozoDomesticRateResponse;
    try {
      json = JSON.parse(rawBody) as ShipmozoDomesticRateResponse;
    } catch {
      throw new Error(`Failed to parse Shipmozo domestic response: ${rawBody}`);
    }

    // Types are matched to a verified live payload; this dev-only log stays as
    // a cheap aid if a tenant/plan ever returns a variant shape.
    if (process.env.NODE_ENV !== "production") {
      console.debug("[shipmozo-domestic] raw rate-calculator response:", rawBody);
    }

    if (String(json.result) !== "1") {
      throw new Error(
        `Shipmozo domestic API error: ${json.message || "Unknown error"}`,
      );
    }

    return json;
  }

  // -- Step 3: Vendor response → Canonical ------------------------------------

  protected transformResponse(
    response: ShipmozoDomesticRateResponse,
  ): RateQuote[] {
    const products = Array.isArray(response.data) ? response.data : [];
    return products.map((p) => this.mapProduct(p));
  }

  private mapProduct(product: ShipmozoDomesticRateProduct): RateQuote {
    const currency = "INR";
    const charges: CanonicalChargeBreakdown[] = [];

    const freight = this.round2(this.toNumber(product.shipping_charges));
    if (freight > 0) {
      charges.push({ name: "FREIGHT", amount: freight, currency });
    }

    // Overhead surcharges (fuel, peak, AWB, ...) come itemised in
    // `overhead_charges_details`; fall back to the scalar total if a tenant
    // omits the breakdown.
    const details = product.overhead_charges_details ?? [];
    if (details.length > 0) {
      for (const overhead of details) {
        const value = this.round2(this.toNumber(overhead.value));
        if (value > 0) {
          charges.push({ name: overhead.name, amount: value, currency });
        }
      }
    } else {
      const overhead = this.round2(this.toNumber(product.overhead_charges));
      if (overhead > 0) {
        charges.push({ name: "Overhead charges", amount: overhead, currency });
      }
    }

    const gst = this.round2(this.toNumber(product.gst));
    if (gst > 0) {
      charges.push({ name: "GST", amount: gst, currency, taxAmount: gst });
    }

    const totalWithTax = this.round2(this.toNumber(product.total_charges));
    const totalWithoutTax =
      product.before_tax_total_charges !== undefined
        ? this.round2(this.toNumber(product.before_tax_total_charges))
        : this.round2(Math.max(0, totalWithTax - gst));

    return {
      vendorId: this.vendorId,
      vendorName: this.vendorName,
      productName: product.name?.trim() || "Courier",
      currency,
      totalWithTax,
      totalWithoutTax,
      tatDays: this.parseTatDays(product.estimated_delivery),
      charges,
      // Shipmozo's courier id — carried through so an ops booking can request
      // this exact courier via assign-courier instead of auto-assigning.
      courierId: product.id != null ? String(product.id) : null,
    };
  }

  /** `estimated_delivery` is free text ("1 Days", "2 Days"). */
  private parseTatDays(estimatedDelivery?: string): number {
    if (!estimatedDelivery) return 0;
    const match = String(estimatedDelivery).match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  // -- Small helpers -----------------------------------------------------------

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private authHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
      accept: "application/json",
      "public-key": SHIPMOZO_PUBLIC_KEY,
      "private-key": SHIPMOZO_PRIVATE_KEY,
    };
  }

  private toNumber(value: unknown): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  private resolveOrderValue(input: CanonicalRateRequest): number {
    const declared = input.shipment.declaredValue;
    if (declared !== undefined && declared !== null && declared > 0) {
      return declared;
    }
    return SHIPMOZO_FALLBACK_ORDER_VALUE;
  }

  /**
   * SPS or MPS, and why the answer is not simply "one box means SPS".
   *
   * ── WHAT THE FLAG ACTUALLY DOES ─────────────────────────────────────────
   * On Shipmozo's domestic calculator `type_of_package` reads as a COURIER
   * FILTER far more than a pricing input. Measured live on a Delhi → Mumbai
   * 2-box, 10 kg consignment: 15 couriers came back as SPS and 3 as MPS, and
   * the couriers present in both quoted the identical price (Delhivery Surface
   * 10 Kg: Rs 510.94 either way). Multi-piece pricing comes from the
   * `dimensions` array, which we always send per box and which this flag does
   * not affect.
   *
   * ── SO WHY DECLARE MPS AT ALL ───────────────────────────────────────────
   * Because the flag is a DECLARATION about the consignment, and the couriers
   * it filters to are the ones enrolled to carry it. Quoting a single-piece
   * courier for a 4-box consignment wins a cheaper card and loses it again at
   * the hub, where the extra boxes are re-weighed, surcharged or refused. The
   * business rule is therefore: SPS only for a genuinely single, light parcel;
   * MPS for anything multi-piece or heavy, whichever way the price moves.
   *
   * The empty-result fallback in callVendorApi is what keeps that honest
   * declaration from becoming a dead end on a lane no MPS courier serves.
   *
   * ── THE THRESHOLD ───────────────────────────────────────────────────────
   * Chargeable weight, strictly above 10 kg. Chargeable rather than actual
   * because it is the weight the courier bills and the figure already shown to
   * the customer as "You pay for" on both the calculator and the wizard, so the
   * card list can never disagree with the number beside it. Exactly 10.00 kg
   * stays SPS.
   *
   * An explicit `packageType` on the request still wins outright — an API
   * caller that has already decided is not second-guessed here.
   */
  private resolvePackageType(
    input: CanonicalRateRequest,
  ): ShipmozoDomesticPackageType {
    if (input.shipment.packageType) return input.shipment.packageType;

    const packages = normalizePackages({
      packages: input.shipment.packages,
      weight: input.shipment.weight,
      quantity: input.shipment.quantity,
      dimensions: input.shipment.dimensions,
    });
    const weights = computeShipmentWeights(packages);

    const multiPiece = weights.totalPieces > 1;
    const heavy = weights.totalChargeableKg > DOMESTIC_MPS_WEIGHT_THRESHOLD_KG;

    return multiPiece || heavy ? "MPS" : "SPS";
  }

  /**
   * Eligibility rules that are ours rather than Shipmozo's are applied here,
   * on the way out, so EVERY caller of this adapter gets them: the calculator,
   * the booking wizard, and the booking-time re-quote in
   * lib/booking/domesticCourierResolve.ts that has to find the exact service
   * the customer paid for. See lib/rates/domesticCarrierRules.ts for why that
   * third one makes a shared code path non-negotiable.
   */
  async fetchRates(input: CanonicalRateRequest): Promise<FetchRatesResult> {
    const result = await super.fetchRates(input);
    return {
      ...result,
      quotes: applyDomesticCarrierRules(result.quotes, input),
    };
  }
}
