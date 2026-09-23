/**
 * ARAMEX RATE CALCULATOR TYPES
 * -----------------------------------------------------------------------------
 * Exact shapes of the Aramex Rate Calculator request and response, plus the
 * small fan-out wrappers that let ONE adapter call SEVERAL accounts.
 *
 * The blocks Aramex shares with its Shipping and Tracking services live in
 * lib/aramex/types.ts; only the rate-specific pieces are here.
 */

import type { AramexAccount } from "@/lib/aramex/accounts";
import type { RateErrorKind } from "../../core/errors";
import type {
  AramexAddress,
  AramexBaseResponse,
  AramexClientInfo,
  AramexDimensions,
  AramexMoney,
  AramexWeight,
} from "@/lib/aramex/types";

export type { AramexClientInfo };

// --- REQUEST -----------------------------------------------------------------

export interface AramexRateShipmentDetails {
  Dimensions: AramexDimensions;
  ActualWeight: AramexWeight;
  /**
   * Always null on the rate call.
   *
   * Not every Aramex account honours an explicitly supplied chargeable weight,
   * and one that ignores it would quote on the actual weight instead — under
   * the real price, on the customer's screen. So the rate call drives the
   * number through ActualWeight, where it cannot be ignored. See the note on
   * transformRequest.
   */
  ChargeableWeight: null;
  DescriptionOfGoods: string;
  GoodsOriginCountry: string;
  NumberOfPieces: number;
  ProductGroup: string;
  ProductType: string;
  PaymentType: string;
  PaymentOptions: string;
  Services: string;
}

export interface AramexRateRequest {
  ClientInfo: AramexClientInfo;
  OriginAddress: AramexAddress;
  DestinationAddress: AramexAddress;
  ShipmentDetails: AramexRateShipmentDetails;
}

// --- RESPONSE ----------------------------------------------------------------

export interface AramexRateDetails {
  Amount: number;
  OtherAmount1?: number;
  OtherAmount2?: number;
  OtherAmount3?: number;
  OtherAmount4?: number;
  OtherAmount5?: number;
  TotalAmountBeforeTax: number;
  TaxAmount: number;
}

export interface AramexRateResponse extends AramexBaseResponse {
  RateDetails: AramexRateDetails | null;
  TotalAmount: AramexMoney | null;
}

// --- FAN-OUT -----------------------------------------------------------------
// Arena holds more than one Aramex contract and they quote different prices, so
// one canonical rate request becomes one Aramex call PER ACCOUNT. These two
// types are what BaseVendorAdapter's TVendorRequest and TVendorResponse become
// for this vendor, which is what lets the fan-out live inside the normal
// transformRequest → callVendorApi → transformResponse contract instead of
// overriding fetchRates and losing its error handling.

/** One account's call, with the account it belongs to kept alongside it. */
export interface AramexAccountRateCall {
  account: AramexAccount;
  payload: AramexRateRequest;
}

export interface AramexRateFanout {
  calls: AramexAccountRateCall[];
}

/**
 * What one account answered. Exactly one of `response` / `error` is set.
 *
 * A per-account failure is carried rather than thrown because it is a partial
 * failure: one contract being unserviceable on a lane says nothing about the
 * other, and losing a live quote because its sibling declined would be the
 * worst possible reading of "the vendor errored".
 */
export interface AramexAccountRateResult {
  account: AramexAccount;
  response?: AramexRateResponse;
  error?: AramexAccountRateFailure;
}

/**
 * Why one account produced no price, classified the way the rate sweep acts on
 * it rather than the way Aramex worded it.
 *
 * The `kind` is carried per account rather than re-derived from the combined
 * message because the combination is lossy: two accounts timing out is a
 * retriable outage, two accounts declining the lane is a permanent fact about
 * that lane, and by the time both have been joined into one string they read
 * identically.
 */
export interface AramexAccountRateFailure {
  message: string;
  kind: RateErrorKind;
  status?: number;
  retryAfterSeconds?: number;
}

export interface AramexRateFanoutResult {
  results: AramexAccountRateResult[];
}
