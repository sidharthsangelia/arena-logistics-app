/**
 * ARAMEX SHIPPING API TYPES
 * -----------------------------------------------------------------------------
 * Exact shapes for the four Shipping/Location endpoints this adapter uses:
 *
 *   CreateShipments      book the export, get the AWB and the label
 *   IsAddressServiced    ask, read-only, whether they fly to this address
 *   HoldShipments        stop a booked consignment (our "cancel")
 *   AddShipmentAttachment   file a document against an existing AWB
 *
 * Shared blocks (ClientInfo, addresses, contacts, money, notifications) come
 * from lib/aramex/types.ts. Source: vendor-api-docs/Aramex.
 */

import type {
  AramexAddress,
  AramexBaseResponse,
  AramexClientInfo,
  AramexDimensions,
  AramexMoney,
  AramexParty,
  AramexTransaction,
  AramexWeight,
} from "@/lib/aramex/types";

// --- CREATE SHIPMENTS: REQUEST ----------------------------------------------

/**
 * Which label to render and how to hand it back.
 *
 * `ReportID` selects a label template from Aramex's report server; 9729 is the
 * one their India integration team ships in their own Postman collection, and
 * it is overridable by env rather than hard-coded because the right template is
 * a property of the printer at the hub, not of this code.
 *
 * `ReportType: "URL"` returns a link instead of inlining megabytes of base64
 * into the booking response. The link is downloaded in `fetchDocuments`.
 */
export interface AramexLabelInfo {
  ReportID: number;
  ReportType: "URL" | "RPT";
}

/** One line inside the boxes, as declared to customs. */
export interface AramexShipmentItem {
  PackageType: string;
  Quantity: string;
  Weight: AramexWeight | null;
  CustomsValue: AramexMoney | null;
  Comments: string;
  GoodsDescription: string;
  Reference: string;
  /** HS code. Aramex's own field name for it. */
  CommodityCode: string;
}

/**
 * Aramex's extension mechanism, and where every customs field actually lives.
 *
 * IEC, GSTIN, IOSS, the commercial invoice number and the bond/LUT status are
 * all key-value pairs under CategoryName "CustomsClearance" rather than typed
 * fields. Appendix G of the Shipping manual enumerates the names.
 */
export interface AramexAdditionalProperty {
  CategoryName: string;
  Name: string;
  Value: string;
}

export interface AramexShipmentDetails {
  /**
   * Null for a multi-box consignment, and that is not laziness.
   *
   * Aramex takes ONE Dimensions block per shipment, so there is no honest value
   * to put here when the boxes differ. Sending one box's dimensions as if they
   * described all of them would understate the volume on the customs paperwork.
   * The volumetric figure Aramex needs is supplied explicitly as
   * ChargeableWeight instead, which is unambiguous.
   */
  Dimensions: AramexDimensions | null;
  ActualWeight: AramexWeight;
  ChargeableWeight: AramexWeight | null;
  DescriptionOfGoods: string;
  GoodsOriginCountry: string;
  NumberOfPieces: number;
  ProductGroup: string;
  ProductType: string;
  PaymentType: string;
  PaymentOptions: string;
  /** Required for a dutiable product type (which PPX is). */
  CustomsValueAmount: AramexMoney | null;
  CashOnDeliveryAmount: AramexMoney | null;
  InsuranceAmount: AramexMoney | null;
  CashAdditionalAmount: AramexMoney | null;
  CashAdditionalAmountDescription: string;
  CollectAmount: AramexMoney | null;
  /** Appendix C service codes, comma-joined. "FRDM" = sender pays duty. */
  Services: string;
  Items: AramexShipmentItem[];
  AdditionalProperties: AramexAdditionalProperty[];
}

export interface AramexShipment {
  Reference1: string;
  Reference2: string;
  Reference3: string;
  Shipper: AramexParty;
  Consignee: AramexParty;
  ThirdParty: AramexParty | null;
  /** WCF date, see lib/aramex/wcfDate.ts. */
  ShippingDateTime: string;
  DueDate: string;
  Comments: string;
  PickupLocation: string;
  OperationsInstructions: string;
  /** Aramex's own spelling. Not a typo on our side. */
  AccountingInstrcutions: string;
  Details: AramexShipmentDetails;
  Attachments: unknown[];
  /**
   * OUR waybill reference, which Aramex requires to be unique across their
   * system — and enforces.
   *
   * That enforcement is the only duplicate protection this integration has.
   * Aramex publishes no "do you already hold a shipment under this reference?"
   * lookup, so a retry after a lost response would otherwise book a second
   * export at full price. Because this field is unique, Aramex refuses the
   * second one instead. See the note on it in the adapter.
   */
  ForeignHAWB: string;
  TransportType: number;
  PickupGUID: string;
  Number: string;
  ScheduledDelivery: null;
}

export interface AramexCreateShipmentsRequest {
  ClientInfo: AramexClientInfo;
  LabelInfo: AramexLabelInfo | null;
  Shipments: AramexShipment[];
  Transaction: AramexTransaction;
}

// --- CREATE SHIPMENTS: RESPONSE ---------------------------------------------

export interface AramexShipmentLabel {
  LabelURL: string | null;
  LabelFileContents: string | null;
}

/** One booked shipment. `ID` is the AWB. */
export interface AramexProcessedShipment extends AramexBaseResponse {
  ID: string | null;
  Reference1?: string | null;
  Reference2?: string | null;
  Reference3?: string | null;
  ForeignHAWB?: string | null;
  ShipmentLabel?: AramexShipmentLabel | null;
  ShipmentAttachments?: unknown[] | null;
}

/**
 * The envelope. `Shipments` is what the live JSON endpoint returns;
 * `ProcessedShipments` matches the WSDL's own element name and is accepted as a
 * fallback so a future change of shape degrades to a clear error rather than a
 * silent "booked but no AWB".
 */
export interface AramexCreateShipmentsResponse extends AramexBaseResponse {
  Shipments?: AramexProcessedShipment[] | null;
  ProcessedShipments?: AramexProcessedShipment[] | null;
}

// --- LOCATION: IsAddressServiced --------------------------------------------

export interface AramexServiceDetails {
  ProductGroup: string;
  ProductType: string;
  ServiceMode: number;
}

export interface AramexAddressValidationRequest {
  ClientInfo: AramexClientInfo;
  Address: AramexAddress;
  ServiceDetails: AramexServiceDetails;
  Transaction: AramexTransaction;
}

/**
 * Carries nothing but the envelope.
 *
 * Aramex answers "is this address serviced?" through HasErrors alone — there is
 * no boolean to read. Which is why this check is advisory in the adapter: a
 * rejection that is really a credential problem looks identical to one that is
 * really an unserviced postcode.
 */
export type AramexAddressValidationResponse = AramexBaseResponse;

// --- SHIPPING: HoldShipments ------------------------------------------------

export interface AramexShipmentHold {
  ShipmentNumber: string;
  Comment: string;
}

export interface AramexHoldShipmentsRequest {
  ClientInfo: AramexClientInfo;
  Transaction: AramexTransaction;
  ShipmentHolds: AramexShipmentHold[];
}

export type AramexHoldShipmentsResponse = AramexBaseResponse;

// --- SHIPPING: AddShipmentAttachment ----------------------------------------

export interface AramexAttachmentInfo {
  /** Aramex's document-type id. "8" is the commercial invoice. */
  FileType: string;
  FileName: string;
  FileExtension: string;
  FileContentsAsBase64String: string;
}

export interface AramexAddAttachmentRequest {
  ClientInfo: AramexClientInfo;
  Transaction: AramexTransaction;
  ShipmentNumber: string;
  ProductGroup: string;
  OriginEntity: string;
  AttachmentInfo: AramexAttachmentInfo;
}

export type AramexAddAttachmentResponse = AramexBaseResponse;
