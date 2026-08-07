/**
 * lib/labels/awb/sample.ts
 *
 * Label data for the preview route and for eyeballing the design.
 *
 * Deliberately awkward rather than tidy. A sample with a short name and a
 * two-line address proves nothing: the layout has to hold with a long consignee
 * name, a full Indian address, a five-figure COD amount and a service name that
 * runs to a weight tier. If it survives these it survives production.
 */

import type { AwbLabelData } from "./types";

/** COD, long address, long name. The stress case. */
export const SAMPLE_COD_LABEL: AwbLabelData = {
  receiverName: "Priyadarshini Venkataraman",
  receiverAddress:
    "Flat 704, Sai Krupa Residency, 12th Cross, Behind Metro Pillar 218, Rajajinagar",
  receiverCity: "Bengaluru",
  receiverState: "Karnataka",
  receiverPinCode: "560010",
  receiverMobile: "+91 98450 33217",

  courierName: "XpressBees",
  courierWeightTier: "2KG",
  awbNumber: "SP4172908365IN",
  dimensions: "30 x 24 x 18 cm",
  weight: "2.40 kg",

  senderCompanyName: "ARENA CARGO AND LOGISTICS INDIA PRIVATE LIMITED",
  senderContactName: "Adnan Ahmad",
  senderAddress: "Plot 14, Sector 21, Dwarka, New Delhi - 110077",
  senderMobile: "+91 88262 76822",

  orderId: "ARN260130748291",
  refId: "AR-DEL-BLR-9021",
  paymentType: "COD",
  codAmount: 12450,

  // Categories, never product names. See types.ts.
  items: [
    { description: "Apparel", qty: 3 },
    { description: "Electronics accessory", qty: 1 },
  ],
};

/** Prepaid, single line item. The common case. */
export const SAMPLE_PREPAID_LABEL: AwbLabelData = {
  ...SAMPLE_COD_LABEL,
  receiverName: "Rakesh Menon",
  receiverAddress: "22 Nehru Road, Vile Parle East",
  receiverCity: "Mumbai",
  receiverState: "Maharashtra",
  receiverPinCode: "400057",
  receiverMobile: "+91 99201 44580",

  courierName: "Delhivery",
  courierWeightTier: "5KG",
  awbNumber: "SP4172908412IN",
  dimensions: "40 x 30 x 20 cm",
  weight: "4.80 kg",

  orderId: "ARN260130748466",
  refId: "AR-DEL-BOM-9044",
  paymentType: "PREPAID",
  codAmount: undefined,

  items: [{ description: "Household goods", qty: 1 }],
};
