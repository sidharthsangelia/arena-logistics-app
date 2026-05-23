/**
 * ARAMEX ADAPTER
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all Aramex API communication and data transformation.
 *
 * Note how different Aramex's API is from Skart's:
 *   - Full address objects instead of pincodes
 *   - Nested dimensions and weight
 *   - Different auth mechanism (ClientInfo block)
 *   - Single quote back instead of an array of products
 *
 * None of this complexity leaks outside this folder.
 */

import { BaseVendorAdapter } from "../../core/base.adapter";
import type { CanonicalRateRequest, RateQuote } from "../../core/types";
import type {
  AramexRateRequest,
  AramexRateResponse,
} from "./aramex.types";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const ARAMEX_API_URL =
  process.env.ARAMEX_API_URL ??
  "https://ws.aramex.net/ShippingAPI.V2/RateCalculator/Service_1_0.svc/json/CalculateRate";

// ─── ADAPTER ─────────────────────────────────────────────────────────────────

export class AramexAdapter extends BaseVendorAdapter<
  AramexRateRequest,
  AramexRateResponse
> {
  readonly vendorId = "aramex";
  readonly vendorName = "Aramex";

  // ── Step 1: Canonical → Vendor ──────────────────────────────────────────

  protected transformRequest(input: CanonicalRateRequest): AramexRateRequest {
    return {
      ClientInfo: {
        UserName: process.env.ARAMEX_USERNAME ?? "",
        Password: process.env.ARAMEX_PASSWORD ?? "",
        Version: "v1.0",
        AccountNumber: process.env.ARAMEX_ACCOUNT_NUMBER ?? "",
        AccountPin: process.env.ARAMEX_ACCOUNT_PIN ?? "",
        AccountEntity: process.env.ARAMEX_ACCOUNT_ENTITY ?? "BOM",
        AccountCountryCode: input.origin.countryCode,
        Source: 24,
      },
      OriginAddress: {
        Line1: input.origin.line1 ?? "",
        City: input.origin.city,
        PostCode: input.origin.pincode ?? "",
        CountryCode: input.origin.countryCode,
      },
      DestinationAddress: {
        Line1: input.destination.line1 ?? "",
        City: input.destination.city,
        PostCode: input.destination.pincode ?? "",
        CountryCode: input.destination.countryCode,
      },
      ShipmentDetails: {
        Dimensions: {
          Length: input.shipment.dimensions.length,
          Width: input.shipment.dimensions.width,
          Height: input.shipment.dimensions.height,
          Unit: input.shipment.dimensions.unit,
        },
        ActualWeight: {
          Unit: "KG",
          Value: input.shipment.weight,
        },
        ChargeableWeight: null,
        DescriptionOfGoods: input.shipment.description ?? "Goods",
        GoodsOriginCountry: input.shipment.goodsOriginCountry ?? input.origin.countryCode,
        NumberOfPieces: input.shipment.quantity,
        ProductGroup: "EXP",
        ProductType: "PPX",
        PaymentType: "P",
        PaymentOptions: "",
        Services: "",
      },
    };
  }

  // ── Step 2: HTTP call ────────────────────────────────────────────────────

  protected async callVendorApi(
    request: AramexRateRequest
  ): Promise<AramexRateResponse> {
    const res = await fetch(ARAMEX_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Aramex API returned ${res.status} ${res.statusText}`);
    }

    const json = await res.json() as AramexRateResponse;

    if (json.HasErrors) {
      const messages = json.Notifications.map((n) => n.Message).join("; ");
      throw new Error(`Aramex API error: ${messages}`);
    }

    return json;
  }

  // ── Step 3: Vendor → Canonical ──────────────────────────────────────────
  // Aramex returns one rate object, not an array of products.
  // We still return RateQuote[] to keep the contract uniform.

  protected transformResponse(response: AramexRateResponse): RateQuote[] {
    if (!response.RateDetails) return [];

    const { RateDetails: rate } = response;
    const currency = rate.TotalAmount?.CurrencyCode ?? "USD";

    return [
      {
        vendorId: this.vendorId,
        vendorName: this.vendorName,
        productName: rate.ProductName ?? rate.ProductCode,
        currency,
        totalWithTax: response.TotalAmount?.Value ?? rate.TotalAmount?.Value ?? 0,
        totalWithoutTax:
          response.TotalAmountBeforeTax?.Value ??
          rate.TotalAmountBeforeTax?.Value ??
          0,
        tatDays: rate.TransitDays ?? 0,
        charges: [
          // Aramex doesn't give us a breakdown in the basic rate API,
          // so we synthesise a single "Freight" line.
          {
            name: "FREIGHT",
            amount: rate.TotalAmountBeforeTax?.Value ?? 0,
            currency,
          },
        ],
      },
    ];
  }
}