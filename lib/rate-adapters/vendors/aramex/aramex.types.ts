/**
 * ARAMEX VENDOR TYPES
 * -----------------------------------------------------------------------------
 * Exact shapes of the Aramex Shipping API request and response payloads.
 * Scoped entirely to this vendor folder.
 */

// --- REQUEST -----------------------------------------------------------------

export interface AramexClientInfo {
  UserName: string;
  Password: string;
  Version: string;
  AccountNumber: string;
  AccountPin: string;
  AccountEntity: string;
  AccountCountryCode: string;
  Source: number;
}

export interface AramexAddress {
  Line1: string;
  Line2?: string;
  Line3?: string;
  City: string;
  StateOrProvinceCode?: string;
  PostCode?: string;
  CountryCode: string;
}

export interface AramexWeightOrDimUnit {
  Unit: string;
  Value?: number;
}

export interface AramexDimensions {
  Length: number;
  Width: number;
  Height: number;
  Unit: string;
}

export interface AramexShipmentDetails {
  Dimensions: AramexDimensions;
  ActualWeight: AramexWeightOrDimUnit;
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
  ShipmentDetails: AramexShipmentDetails;
}

// --- RESPONSE ----------------------------------------------------------------

export interface AramexMoneyValue {
  CurrencyCode: string;
  Value: number;
}

export interface AramexRateDetails {
  ProductCode: string;
  ProductName: string;
  TotalAmount: AramexMoneyValue;
  TotalAmountBeforeTax: AramexMoneyValue;
  TransitDays: number;
  Weight: AramexMoneyValue;
  WeightUnit: string;
}

export interface AramexNotification {
  Code: string;
  Message: string;
}

export interface AramexRateResponse {
  HasErrors: boolean;
  Notifications: AramexNotification[];
  RateDetails: AramexRateDetails | null;
  TotalAmount: AramexMoneyValue | null;
  TotalAmountBeforeTax: AramexMoneyValue | null;
}