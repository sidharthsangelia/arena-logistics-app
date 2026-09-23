/**
 * ARAMEX SHARED WIRE TYPES
 * -----------------------------------------------------------------------------
 * The blocks Aramex reuses across the Rate Calculator, Shipping, Location and
 * Tracking services. They are byte-identical in all four, so they live here
 * rather than being written out three times with three chances to drift.
 *
 * Vendor-specific request and response envelopes stay in their own adapter
 * folders; this file holds only the pieces that genuinely are shared.
 */

/** The auth block on every Aramex request. Built by `aramexClientInfo`. */
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

/**
 * Echoed back verbatim in the response, validated by nothing.
 *
 * Aramex's own documentation is explicit that this block is for the caller's
 * identification and is never checked, which makes it the right place to carry
 * our shipment reference through a call whose response we might otherwise not
 * be able to match up.
 */
export interface AramexTransaction {
  Reference1?: string;
  Reference2?: string;
  Reference3?: string;
  Reference4?: string;
  Reference5?: string;
}

/**
 * How Aramex reports EVERYTHING that went wrong, at HTTP 200.
 *
 * There is no status code and no typed error field: an unserviceable lane, a
 * rejected weight and an expired account PIN all arrive as `HasErrors: true`
 * with free text in here. See ./notifications.ts for what we do about that.
 */
export interface AramexNotification {
  Code: string;
  Message: string;
}

/** Everything Aramex returns carries these two. */
export interface AramexBaseResponse {
  HasErrors: boolean;
  Notifications: AramexNotification[] | null;
  Transaction?: AramexTransaction | null;
}

export interface AramexMoney {
  CurrencyCode: string;
  Value: number;
}

export interface AramexWeight {
  Unit: string;
  Value: number;
}

export interface AramexDimensions {
  Length: number;
  Width: number;
  Height: number;
  Unit: string;
}

export interface AramexAddress {
  Line1: string;
  Line2?: string;
  Line3?: string;
  City: string;
  StateOrProvinceCode?: string;
  PostCode?: string;
  CountryCode: string;
  Longitude?: number;
  Latitude?: number;
  BuildingNumber?: string | null;
  BuildingName?: string | null;
  Floor?: string | null;
  Apartment?: string | null;
  POBox?: string | null;
  Description?: string | null;
}

export interface AramexContact {
  Department?: string;
  PersonName: string;
  Title?: string;
  CompanyName: string;
  PhoneNumber1: string;
  PhoneNumber1Ext?: string;
  PhoneNumber2?: string;
  PhoneNumber2Ext?: string;
  FaxNumber?: string;
  CellPhone: string;
  EmailAddress: string;
  Type?: string;
}

export interface AramexParty {
  Reference1?: string;
  Reference2?: string;
  /**
   * WHICH ARAMEX CONTRACT THIS SHIPMENT IS BILLED TO.
   *
   * On the Shipper this is not decoration — it is the account the consignment
   * is invoiced against. It must be the account whose tariff produced the price
   * the customer paid. See lib/aramex/accounts.ts.
   */
  AccountNumber?: string;
  PartyAddress: AramexAddress;
  Contact: AramexContact;
}
