/**
 * ARAMEX ADAPTER
 * -----------------------------------------------------------------------------
 * Handles all Aramex API communication and data transformation.
 */

import { BaseVendorAdapter } from "../../core/base.adapter";
import type { CanonicalRateRequest, RateQuote } from "../../core/types";
import type {
  AramexRateRequest,
  AramexRateResponse,
} from "./aramex.types";
import {
  computeShipmentWeights,
  normalizePackages,
} from "@/lib/pricing/chargeableWeight";

const ARAMEX_API_URL =
  process.env.ARAMEX_API_URL ??
  "https://ws.aramex.net/ShippingAPI.V2/RateCalculator/Service_1_0.svc/json/CalculateRate";

export class AramexAdapter extends BaseVendorAdapter<
  AramexRateRequest,
  AramexRateResponse
> {
  readonly vendorId = "aramex";
  readonly vendorName = "Aramex";

  /**
   * Canonical → Aramex
   *
   * Aramex's rate calculator has no true multi-piece input — it takes a single
   * Dimensions block + ActualWeight + NumberOfPieces. So we normalise the
   * shipment to ONE chargeable weight (per-package max → sum) and feed it as
   * ActualWeight, with nominal 1×1×1 dimensions so Aramex's own
   * max(actual, volumetric) can never exceed the number we computed. This
   * works regardless of whether a given Aramex account honours an explicit
   * ChargeableWeight, which is why we drive it through ActualWeight instead.
   * NumberOfPieces stays the real piece count so any per-piece minimums still
   * apply correctly.
   */
  protected transformRequest(input: CanonicalRateRequest): AramexRateRequest {
    const packages = normalizePackages({
      packages: input.shipment.packages,
      weight: input.shipment.weight,
      quantity: input.shipment.quantity,
      dimensions: input.shipment.dimensions,
    });
    const weights = computeShipmentWeights(packages);

    return {
      ClientInfo: {
        UserName: process.env.ARAMEX_USERNAME ?? "",
        Password: process.env.ARAMEX_PASSWORD ?? "",
        Version: "v1.0",
        AccountNumber: process.env.ARAMEX_ACCOUNT_NUMBER ?? "",
        AccountPin: process.env.ARAMEX_ACCOUNT_PIN ?? "",
        AccountEntity: process.env.ARAMEX_ACCOUNT_ENTITY ?? "GGN",
        AccountCountryCode:
          process.env.ARAMEX_ACCOUNT_COUNTRY_CODE ?? "IN",
        Source: 24,
      },

      OriginAddress: {
        Line1: input.origin.line1 ?? "",
        Line2: "",
        Line3: "",
        StateOrProvinceCode: "",
        City: input.origin.city,
        PostCode: input.origin.pincode ?? "",
        CountryCode: input.origin.countryCode,
      },

      DestinationAddress: {
        Line1: input.destination.line1 ?? "",
        Line2: "",
        Line3: "",
        StateOrProvinceCode: "",
        City: input.destination.city,
        PostCode: input.destination.pincode ?? "",
        CountryCode: input.destination.countryCode,
      },

      ShipmentDetails: {
        // Nominal 1×1×1 box: volumetric ≈ 0, so Aramex's internal
        // max(actual, volumetric) resolves to the ActualWeight we set below —
        // which is already the normalised total chargeable weight.
        Dimensions: {
          Length: 1,
          Width: 1,
          Height: 1,
          Unit: "cm",
        },

        ActualWeight: {
          Unit: "KG",
          // Normalised total chargeable weight (per-package max → sum)
          Value: weights.totalChargeableKg,
        },

        ChargeableWeight: null,

        DescriptionOfGoods:
          input.shipment.description ?? "Goods",

        GoodsOriginCountry:
          input.shipment.goodsOriginCountry ??
          input.origin.countryCode,

        NumberOfPieces: weights.totalPieces,

        ProductGroup: "EXP",
        ProductType: "PPX",

        PaymentType: "P",
        PaymentOptions: "",
        Services: "",
      },
    };
  }

  /**
   * Call Aramex API
   */
  protected async callVendorApi(
    request: AramexRateRequest
  ): Promise<AramexRateResponse> {
    const res = await fetch(ARAMEX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
      cache: "no-store",
    });

    const rawBody = await res.text();

    if (!res.ok) {
      throw new Error(
        `Aramex API returned ${res.status}: ${rawBody}`
      );
    }

    let json: AramexRateResponse;

    try {
      json = JSON.parse(rawBody) as AramexRateResponse;
    } catch {
      throw new Error(
        `Failed to parse Aramex response: ${rawBody}`
      );
    }

    if (json.HasErrors) {
      const messages =
        json.Notifications?.map((n) => n.Message).join("; ") ??
        "Unknown Aramex error";

      throw new Error(`Aramex API error: ${messages}`);
    }

    return json;
  }

  /**
   * Aramex → Canonical
   */
  protected transformResponse(
    response: AramexRateResponse
  ): RateQuote[] {
    if (!response.RateDetails) {
      return [];
    }

    const currency =
      response.TotalAmount?.CurrencyCode ?? "INR";

    return [
      {
        vendorId: this.vendorId,
        vendorName: this.vendorName,

        productName: "Aramex Express",

        currency,

        totalWithTax:
          response.TotalAmount?.Value ?? 0,

        totalWithoutTax:
          response.RateDetails.TotalAmountBeforeTax ?? 0,

        tatDays: 0,

        charges: [
          {
            name: "FREIGHT",
            amount: response.RateDetails.Amount,
            currency,
          },
          {
            name: "TAX",
            amount: response.RateDetails.TaxAmount,
            currency,
          },
        ],
      },
    ];
  }
}