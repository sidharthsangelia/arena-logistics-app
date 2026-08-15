/**
 * SKART ADAPTER
 * -----------------------------------------------------------------------------
 * Handles all sKart Express API communication and data transformation.
 *
 * Responsibilities:
 *   - Transform canonical input → Skart request shape
 *   - Call the Skart rate-calculator endpoint
 *   - Transform Skart response → canonical RateQuote[]
 *
 * This is the only file in the entire codebase that knows about Skart's
 * API contract. If Skart changes their API, only this file changes.
 */

import { BaseVendorAdapter } from "../../core/base.adapter";
import { RateAdapterError, errorFromResponse } from "../../core/errors";
import type { CanonicalRateRequest, RateQuote } from "../../core/types";
import type { SkartRateRequest, SkartRateResponse, SkartProduct } from "./skart.types";
import {
  computeShipmentWeights,
  normalizePackages,
} from "@/lib/pricing/chargeableWeight";

// --- CONFIG ------------------------------------------------------------------
// Keep credentials in env vars; never hard-code them.

const SKART_API_URL =
  process.env.SKART_API_URL ??
  "https://apiv2.skart-express.com/api/v1/booking/rate-calculator";
  

const SKART_USERNAME = process.env.SKART_USERNAME ?? "";
const SKART_PASSWORD = process.env.SKART_PASSWORD ?? "";

// --- ADAPTER -----------------------------------------------------------------

export class SkartAdapter extends BaseVendorAdapter<
  SkartRateRequest,
  SkartRateResponse
> {
  readonly vendorId = "skart";
  readonly vendorName = "sKart Express";

  // -- Step 1: Canonical → Vendor ------------------------------------------
  //
  // Skart's international rate calculator has NO multi-piece provision: it
  // accepts only a single `weight`, `quantity` (pieces) and `length` (max
  // length) — no per-box dimensions, no width/height, so it cannot compute
  // volumetric weight itself. Per the agreed rule ("normalise when the vendor
  // can't take multi-piece"), we collapse the shipment to ONE chargeable
  // weight here (per-package max → sum) and send that as `weight`. This is
  // what makes multi-piece pricing correct and stable for Skart — sending raw
  // actual weight would under-charge any volumetric-heavy box.

  protected transformRequest(input: CanonicalRateRequest): SkartRateRequest {
    const packages = normalizePackages({
      packages: input.shipment.packages,
      weight: input.shipment.weight,
      quantity: input.shipment.quantity,
      dimensions: input.shipment.dimensions,
    });
    const weights = computeShipmentWeights(packages);

    return {
      user_name: SKART_USERNAME,
      password: SKART_PASSWORD,
      booking_type: 1,
      origin_pincode: input.origin.pincode ?? "",
      destination_pincode: input.destination.pincode ?? "",
      // Skart needs the full country name in UPPERCASE
      destination_country: (input.destination.country ?? input.destination.countryCode).toUpperCase(),
      shipment_type: 1,
      // Normalised chargeable weight (kg) — the billable figure, not raw actual
      weight: weights.totalChargeableKg,
      quantity: weights.totalPieces,
      // Skart's `length` = max length in cm; use the longest side across boxes
      length: weights.maxLongestSideCm,
    };
  }

  // -- Step 2: HTTP call ----------------------------------------------------

  protected async callVendorApi(
    request: SkartRateRequest
  ): Promise<SkartRateResponse> {
    const res = await fetch(SKART_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "*/*" },
      body: JSON.stringify(request),
      // Next.js 16 fetch options: opt out of caching for live rate data
      cache: "no-store",
    });

    if (!res.ok) {
      throw errorFromResponse(this.vendorId, "Skart API", res);
    }

    const json = await res.json() as SkartRateResponse;

    // A non-200 statusCode inside an HTTP 200 is Skart's soft failure: the API
    // was reached, understood the request, and declined it. Almost always an
    // unserviceable lane or weight. Classified NO_SERVICE so the scheduled
    // sweep records it as a fact and stops retrying a lane Skart does not fly.
    if (json.statusCode !== 200) {
      throw new RateAdapterError(
        this.vendorId,
        `Skart API error: ${json.message}`,
        { kind: "NO_SERVICE", status: json.statusCode },
      );
    }

    return json;
  }

  // -- Step 3: Vendor → Canonical ------------------------------------------

  protected transformResponse(response: SkartRateResponse): RateQuote[] {
    return response.data.map((product) => this.mapProduct(product));
  }

  private mapProduct(product: SkartProduct): RateQuote {
    return {
      vendorId: this.vendorId,
      vendorName: this.vendorName,
      productName: product.product_name,
      currency: "INR",
      totalWithTax: product.grand_total_with_gst,
      totalWithoutTax: parseFloat(product.grand_total_without_gst),
      tatDays: product.tat_days,
      charges: product.charges
        .filter((c) => parseFloat(c.charge_amount) > 0) // strip zero-value charges
        .map((c) => ({
          name: c.charge_name,
          amount: parseFloat(c.charge_amount),
          currency: "INR",
          igst: parseFloat(c.igst),
          cgst: parseFloat(c.cgst),
          sgst: parseFloat(c.sgst),
          taxAmount: parseFloat(c.igst_amount),
        })),
    };
  }
}