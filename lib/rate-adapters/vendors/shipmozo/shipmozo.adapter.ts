/**
 * SHIPMOZO ADAPTER
 * -----------------------------------------------------------------------------
 * Handles all Shipmozo API communication and data transformation for the
 * International Rate Calculator.
 *
 * Two Shipmozo endpoints are involved:
 *   - GET  /countries                     → resolve ISO country code/name to
 *                                            Shipmozo's numeric delivery_country_id
 *   - POST /international-rate-calculator → the actual rate quote
 *
 * Country resolution needs a network call, so it can't happen inside the
 * synchronous transformRequest step. transformRequest builds an intermediate
 * ShipmozoRateRequest (canonical country code/name attached); callVendorApi
 * resolves + injects delivery_country_id before hitting the rate-calculator
 * endpoint. A short-lived in-memory cache avoids refetching /countries on
 * every request.
 */

import { BaseVendorAdapter } from "../../core/base.adapter";
import type { CanonicalRateRequest, RateQuote } from "../../core/types";
import type {
  ShipmozoCountriesResponse,
  ShipmozoCountry,
  ShipmozoDimensionBox,
  ShipmozoPackageType,
  ShipmozoRateCalculatorPayload,
  ShipmozoRateCharge,
  ShipmozoRateProduct,
  ShipmozoRateRequest,
  ShipmozoRateResponse,
  ShipmozoShipmentPurpose,
} from "./shipmozo.types";

// --- CONFIG -------------------------------------------------------------------

const SHIPMOZO_BASE_URL =
  process.env.SHIPMOZO_API_URL ?? "https://shipping-api.com/app/api/v1";

const SHIPMOZO_PUBLIC_KEY = process.env.SHIPMOZO_PUBLIC_KEY ?? "";
const SHIPMOZO_PRIVATE_KEY = process.env.SHIPMOZO_PRIVATE_KEY ?? "";

const COUNTRY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // country list rarely changes

// Module-level so it's shared across requests (and would survive across
// adapter instances, though the registry only ever creates one).
let countryCache: { fetchedAt: number; countries: ShipmozoCountry[] } | null =
  null;
let inflightCountryFetch: Promise<ShipmozoCountry[]> | null = null;

// --- ADAPTER -------------------------------------------------------------------

export class ShipmozoAdapter extends BaseVendorAdapter<
  ShipmozoRateRequest,
  ShipmozoRateResponse
> {
  readonly vendorId = "shipmozo";
  readonly vendorName = "Shipmozo";

  // -- Step 1: Canonical → Vendor (intermediate) -----------------------------

  protected transformRequest(input: CanonicalRateRequest): ShipmozoRateRequest {
    if (!input.origin.pincode || !input.destination.pincode) {
      throw new Error(
        "Shipmozo requires both origin and destination pincodes.",
      );
    }

    const declaredValue = this.resolveDeclaredValue(input);
    const { length, width, height } = this.normalizeDimensionsToCm(input);

    const dimensions: ShipmozoDimensionBox[] = [
      {
        no_of_box: input.shipment.quantity || 1,
        length,
        width,
        height,
      },
    ];

    const payload: Omit<ShipmozoRateCalculatorPayload, "delivery_country_id"> =
      {
        pickup_pincode: input.origin.pincode,
        delivery_pincode: input.destination.pincode,
        order_amount: String(declaredValue),
        type_of_package: this.resolvePackageType(input),
        shipment_purpose: this.resolveShipmentPurpose(input),
        // Shipmozo wants weight in GRAM; canonical weight is always KG.
        weight: String(Math.round(input.shipment.weight * 1000)),
        dimensions,
      };

    return {
      deliveryCountryCode: input.destination.countryCode,
      deliveryCountryName: input.destination.country,
      payload,
    };
  }

  // -- Step 2: HTTP call(s) ----------------------------------------------------

  protected async callVendorApi(
    request: ShipmozoRateRequest,
  ): Promise<ShipmozoRateResponse> {
    const countryId = await this.resolveCountryId(
      request.deliveryCountryCode,
      request.deliveryCountryName,
    );

    const finalPayload: ShipmozoRateCalculatorPayload = {
      ...request.payload,
      delivery_country_id: countryId,
    };

    const res = await fetch(
      `${SHIPMOZO_BASE_URL}/international-rate-calculator`,
      {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify(finalPayload),
        cache: "no-store",
      },
    );

    const rawBody = await res.text();

    if (!res.ok) {
      throw new Error(
        `Shipmozo API returned ${res.status} ${res.statusText}: ${rawBody}`,
      );
    }

    let json: ShipmozoRateResponse;
    try {
      json = JSON.parse(rawBody) as ShipmozoRateResponse;
    } catch {
      throw new Error(`Failed to parse Shipmozo response: ${rawBody}`);
    }

    // TODO once verified against a live payload: remove this log and tighten
    // ShipmozoRateProduct in shipmozo.types.ts to match exactly.
    if (process.env.NODE_ENV !== "production") {
      console.debug(
        "[shipmozo] raw international-rate-calculator response:",
        rawBody,
      );
    }

    if (String(json.result) !== "1") {
      throw new Error(`Shipmozo API error: ${json.message || "Unknown error"}`);
    }

    return json;
  }

  // -- Step 3: Vendor → Canonical -----------------------------------------------

  protected transformResponse(response: ShipmozoRateResponse): RateQuote[] {
    const products = Array.isArray(response.data) ? response.data : [];
    return products.map((p) => this.mapProduct(p));
  }

  private mapProduct(product: ShipmozoRateProduct): RateQuote {
    const currency = product.currency ?? "INR";
    const charges = product.charges ?? product.charge_details ?? [];

    const totalWithTax = this.toNumber(
      product.grand_total_with_gst ??
        product.total_with_tax ??
        product.grand_total,
    );
    const totalWithoutTax = this.toNumber(
      product.grand_total_without_gst ??
        product.total_without_tax ??
        product.sub_total ??
        totalWithTax,
    );

    return {
      vendorId: this.vendorId,
      vendorName: this.vendorName,
      productName:
        product.product_name ??
        product.courier_name ??
        product.courier ??
        product.parent_vendor ??
        "Shipmozo International",
      currency,
      totalWithTax,
      totalWithoutTax,
      tatDays: this.toNumber(product.tat_days ?? product.tat ?? product.edd),
      charges: charges
        .filter((c) => this.toNumber(c.charge_amount ?? c.amount) !== 0)
        .map((c) => this.mapCharge(c, currency)),
    };
  }

  private mapCharge(charge: ShipmozoRateCharge, fallbackCurrency: string) {
    return {
      name: charge.charge_name ?? charge.name ?? "CHARGE",
      amount: this.toNumber(charge.charge_amount ?? charge.amount),
      currency: charge.currency ?? fallbackCurrency,
      taxAmount:
        charge.tax_amount !== undefined || charge.igst_amount !== undefined
          ? this.toNumber(charge.tax_amount ?? charge.igst_amount)
          : undefined,
    };
  }

  // -- Country resolution ---------------------------------------------------

  private async resolveCountryId(
    countryCode: string,
    countryName?: string,
  ): Promise<string> {
    const countries = await this.getCountries();

    const normalizedCode = countryCode.trim().toUpperCase();
    const normalizedName = countryName?.trim().toUpperCase();

    const match = countries.find((c) => {
      const iso2 = c.iso2?.toUpperCase();
      const iso3 = c.iso3?.toUpperCase();
      const code = c.code?.toUpperCase();
      const name = c.name?.toUpperCase();

      return (
        iso2 === normalizedCode ||
        iso3 === normalizedCode ||
        code === normalizedCode ||
        (normalizedName !== undefined && name === normalizedName)
      );
    });

    if (!match) {
      throw new Error(
        `Shipmozo: could not resolve delivery_country_id for "${countryCode}"` +
          (countryName ? ` (${countryName})` : "") +
          ". Check GET /countries for the exact supported name/code.",
      );
    }

    return String(match.id);
  }

  private async getCountries(): Promise<ShipmozoCountry[]> {
    const now = Date.now();

    if (countryCache && now - countryCache.fetchedAt < COUNTRY_CACHE_TTL_MS) {
      return countryCache.countries;
    }

    // De-dupe concurrent requests that all race to warm a cold cache.
    if (!inflightCountryFetch) {
      inflightCountryFetch = this.fetchCountries().finally(() => {
        inflightCountryFetch = null;
      });
    }

    const countries = await inflightCountryFetch;
    countryCache = { fetchedAt: now, countries };
    return countries;
  }

  private async fetchCountries(): Promise<ShipmozoCountry[]> {
    const res = await fetch(`${SHIPMOZO_BASE_URL}/countries`, {
      method: "GET",
      headers: this.authHeaders(),
      cache: "no-store",
    });

    const rawBody = await res.text();

    if (!res.ok) {
      throw new Error(
        `Shipmozo /countries returned ${res.status} ${res.statusText}: ${rawBody}`,
      );
    }

    let json: ShipmozoCountriesResponse;
    try {
      json = JSON.parse(rawBody) as ShipmozoCountriesResponse;
    } catch {
      throw new Error(
        `Failed to parse Shipmozo /countries response: ${rawBody}`,
      );
    }

    if (String(json.result) !== "1" || !Array.isArray(json.data)) {
      throw new Error(
        `Shipmozo /countries error: ${json.message || "Unknown error"}`,
      );
    }

    return json.data;
  }

  // -- Small helpers ------------------------------------------------------

  private authHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
      accept: "application/json",
      "public-key": SHIPMOZO_PUBLIC_KEY,
      "private-key": SHIPMOZO_PRIVATE_KEY,
    };
  }

  private toNumber(value: unknown): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  private normalizeDimensionsToCm(input: CanonicalRateRequest) {
    const { length, width, height, unit } = input.shipment.dimensions;
    const factor = unit === "in" ? 2.54 : 1;
    return {
      length: Math.ceil(length * factor),
      width: Math.ceil(width * factor),
      height: Math.ceil(height * factor),
    };
  }

  /**
   * Shipmozo requires order_amount (declared shipment value) for customs /
   * duty calculation on international shipments. The canonical shipment
   * model doesn't carry a monetary value today, so we read the optional
   * declaredValue field added below and fail loudly if it's missing —
   * a clear vendorError beats silently sending a wrong customs value.
   */
  private resolveDeclaredValue(input: CanonicalRateRequest): number {
    const declared = input.shipment.declaredValue;
    if (declared !== undefined && declared !== null && declared > 0) {
      return declared;
    }

    // No declared value supplied by the caller. Falling back keeps Shipmozo
    // in the results set for flows that haven't wired up declaredValue yet,
    // at the cost of a quote that may not reflect real customs value.
    // This is a stopgap — fix the root cause by passing declaredValue from
    // the order/cart total in actions/rates.action.ts.
    const fallback = Number(
      process.env.SHIPMOZO_DEFAULT_DECLARED_VALUE ?? 1000,
    );

    console.warn(
      `[shipmozo] shipment.declaredValue missing/zero — falling back to ${fallback}. ` +
        "Pass it explicitly from the order total for accurate quotes.",
    );

    return fallback;
  }

  private resolvePackageType(input: CanonicalRateRequest): ShipmozoPackageType {
    return input.shipment.packageType ?? "SPS";
  }

  private resolveShipmentPurpose(
    input: CanonicalRateRequest,
  ): ShipmozoShipmentPurpose {
    return input.shipment.shipmentPurpose ?? "SCSB4";
  }
}

/**
 * Non-invasive augmentation of the canonical shipment shape: adds a few
 * OPTIONAL fields that only Shipmozo's international rate calculator needs.
 * Skart and Aramex simply ignore them — nothing about their behavior
 * changes. This keeps the shared core/types.ts file untouched, per the
 * "only touch the vendor folder + index.ts" rule.
 */
declare module "../../core/types" {
  interface CanonicalShipmentDetails {
    /** Declared value of the goods, required by Shipmozo for customs. */
    declaredValue?: number;
    /** Defaults to "SPS" (single package) if omitted. */
    packageType?: "SPS" | "MPS" | "B2B";
    /** Defaults to "SCSB4" if omitted. */
    shipmentPurpose?: "DCSB4" | "SCSB4" | "CSB5";
  }
}
