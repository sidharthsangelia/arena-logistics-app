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

    return {
      pickup_pincode: input.origin.pincode,
      delivery_pincode: input.destination.pincode,
      payment_type: "PREPAID",
      shipment_type: "FORWARD",
      order_amount: String(this.resolveOrderValue(input)),
      type_of_package: this.resolvePackageType(input, weights.totalPieces),
      rov_type: "ROV_OWNER",
      cod_amount: "",
      // Shipmozo wants weight in GRAM; canonical weight is always KG.
      weight: String(Math.round(weights.totalActualKg * 1000)),
      dimensions,
    };
  }

  // -- Step 2: HTTP call -------------------------------------------------------

  protected async callVendorApi(
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

  /** SPS (single) vs MPS (multi-piece); honours an explicit override. */
  private resolvePackageType(
    input: CanonicalRateRequest,
    totalPieces: number,
  ): ShipmozoDomesticPackageType {
    if (input.shipment.packageType) return input.shipment.packageType;
    return totalPieces > 1 ? "MPS" : "SPS";
  }
}
