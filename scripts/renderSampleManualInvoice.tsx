/**
 * Renders sample manual invoices to real PDFs, so the template can be looked at
 * without issuing anything.
 *
 *   npx tsx scripts/renderSampleManualInvoice.tsx
 *
 * Writes five files:
 *
 *   sample-manual-invoice-arena.pdf      export, 3 consignments, IGST, recoveries
 *   sample-manual-invoice-grid.pdf       the same content, denser bordered grid
 *   sample-manual-domestic-arena.pdf     domestic, 1 consignment, CGST+SGST
 *   sample-manual-domestic-grid.pdf      the same content, denser bordered grid
 *   sample-manual-individual-preview.pdf a person, no GSTIN, export, as a preview
 *
 * Use ALL THREE content samples whenever the template changes. The export
 * exercises several consignments, IGST and the pure-agent recovery block; the
 * domestic one exercises a single consignment, a CGST/SGST split and an
 * unregistered company; the individual one exercises a buyer with no GSTIN row
 * at all, place of supply 96, and the preview mark. A change that looks right
 * on one is easily wrong on the others.
 *
 * The money is built by the real engine and checked against the real
 * invariants, so a sample that renders is also a sample that adds up.
 */

import "dotenv/config";

import { writeFileSync } from "node:fs";
import { renderToBuffer } from "@react-pdf/renderer";

import { ManualInvoiceDocType, ShipmentMode, TaxMode } from "../generated/prisma";
import {
  buildManualInvoiceMoney,
  verifyManualInvoiceMoney,
  type ManualChargeInput,
} from "../lib/invoices/manual/money";
import {
  ManualInvoiceDocument,
  type ManualInvoiceVariant,
} from "../lib/invoices/manual/pdf/ManualInvoiceDocument";
import { DRAFT_NUMBER_PLACEHOLDER } from "../lib/invoices/manual/config";
import { OUTSIDE_INDIA } from "../lib/invoices/tax/gst";
import { MANUAL_SNAPSHOT_VERSION } from "../lib/invoices/manual/types";
import type {
  ManualConsignmentSnapshot,
  ManualInvoiceDocumentData,
  ManualSellerSnapshot,
} from "../lib/invoices/manual/types";

const SELLER: ManualSellerSnapshot = {
  version: MANUAL_SNAPSHOT_VERSION,
  legalName: "Arena Cargo And Logistics India Private Limited",
  tradeName: "Arena Cargo Logistics",
  addressLines: ["Unit 402, Vipul Trade Centre", "Sector 48, Sohna Road"],
  city: "Gurugram",
  stateName: "Haryana",
  stateCode: "06",
  postalCode: "122018",
  country: "India",
  gstin: "06AABCA1234A1Z5",
  pan: "AABCA1234A",
  email: "info@arenalogistics.co.in",
  phone: "+91 98100 00000",
  website: "arenalogistics.co.in",
  bank: {
    accountName: "Arena Cargo And Logistics India Private Limited",
    accountNumber: "50200012345678",
    ifsc: "HDFC0001234",
    bankName: "HDFC Bank",
    branch: "Sohna Road",
  },
  declaration:
    "We declare that this invoice shows the actual price of the services described and that all particulars are true and correct.",
  jurisdiction: "Delhi and Gurgaon",
  billingEmail: "billing@arenalogistics.co.in",
};

function consignment(
  over: Partial<ManualConsignmentSnapshot>,
): ManualConsignmentSnapshot {
  return {
    sortOrder: 0,
    awbNumber: null,
    mawbNumber: null,
    bookingDate: null,
    origin: null,
    destination: null,
    originPostalCode: null,
    originCity: null,
    originState: null,
    originCountry: null,
    destinationPostalCode: null,
    destinationCity: null,
    destinationState: null,
    destinationCountry: null,
    serviceType: null,
    originPort: null,
    destinationPort: null,
    flightNumber: null,
    airlineName: null,
    forwarderName: null,
    subAgent: null,
    pieces: null,
    grossWeightKg: null,
    chargeableWeightKg: null,
    boxCount: null,
    palletCount: null,
    cartonCount: null,
    goodsDescription: null,
    particulars: null,
    exportInvoiceNo: null,
    referenceNo: null,
    shipperName: null,
    consigneeName: null,
    containerNumber: null,
    jobNumber: null,
    notes: null,
    netAmount: 0,
    charges: [],
    ...over,
  };
}

function charge(
  label: string,
  amount: number,
  over: Partial<ManualChargeInput> = {},
): ManualChargeInput & { notes: string | null } {
  return {
    label,
    sacCode: "996812",
    rate: 0,
    quantity: 1,
    amount,
    discount: 0,
    ratePercent: 18,
    reimbursement: false,
    notes: null,
    ...over,
  };
}

/** Sums a consignment's charges the same way build.ts does. */
function withNet(c: ManualConsignmentSnapshot): ManualConsignmentSnapshot {
  const netAmount = c.charges.reduce(
    (sum, ch) => sum + Math.max(0, ch.amount - ch.discount),
    0,
  );
  return { ...c, netAmount: Math.round(netAmount * 100) / 100 };
}

function assemble(opts: {
  invoiceNumber: string;
  mode: ShipmentMode;
  placeOfSupplyCode: string;
  placeOfSupplyName: string;
  consignments: ManualConsignmentSnapshot[];
  buyer: ManualInvoiceDocumentData["buyer"];
  csbLabel: string | null;
  reference: string | null;
  irn?: string | null;
  draft?: boolean;
}): ManualInvoiceDocumentData {
  const consignments = opts.consignments.map(withNet);

  const money = buildManualInvoiceMoney({
    lines: consignments.flatMap((c) => c.charges),
    taxMode: TaxMode.EXCLUSIVE,
    sellerStateCode: SELLER.stateCode,
    placeOfSupplyCode: opts.placeOfSupplyCode,
  });

  const problems = verifyManualInvoiceMoney(money);
  if (problems.length > 0) {
    throw new Error(`sample ${opts.invoiceNumber} does not add up: ${problems.join("; ")}`);
  }

  return {
    version: MANUAL_SNAPSHOT_VERSION,
    invoiceNumber: opts.invoiceNumber,
    docType: ManualInvoiceDocType.TAX_INVOICE,
    relatedInvoiceNumber: null,
    issueDate: new Date("2026-08-08T06:00:00.000Z").toISOString(),
    dueDate: new Date("2026-09-07T06:00:00.000Z").toISOString(),
    paymentTermsLabel: "Net 30 days",
    reference: opts.reference,
    mode: opts.mode,
    csbLabel: opts.csbLabel,

    seller: SELLER,
    buyer: opts.buyer,
    draft: opts.draft ?? false,

    placeOfSupplyCode: opts.placeOfSupplyCode,
    placeOfSupplyName: opts.placeOfSupplyName,

    currency: "INR",
    taxMode: TaxMode.EXCLUSIVE,
    reverseCharge: false,
    isIntraState: money.isIntraState,

    consignments,
    lineItems: money.lineItems,

    taxableValue: money.taxableValue,
    cgstAmount: money.cgstAmount,
    sgstAmount: money.sgstAmount,
    igstAmount: money.igstAmount,
    totalTax: money.totalTax,
    reimbursements: money.reimbursements,
    total: money.total,
    taxNote: null,

    irn: opts.irn ?? null,
    irnAckNo: opts.irn ? "112410000123456" : null,
    irnAckDate: opts.irn ? new Date("2026-08-08T06:05:00.000Z").toISOString() : null,
    irnQrData: null,

    notes: null,
    terms: [
      "This invoice covers freight and related services only. Duties, taxes and charges levied at destination are payable by the consignee.",
      "Claims relating to this invoice must be raised within 7 days of its date.",
    ],

    cancelled: false,
  };
}

// ---------------------------------------------------------------------------
// Sample 1: export, three consignments, IGST, pure-agent recoveries
// ---------------------------------------------------------------------------

const EXPORT_SAMPLE = assemble({
  invoiceNumber: "ARM/26-27/00042",
  mode: ShipmentMode.INTERNATIONAL,
  placeOfSupplyCode: "07",
  placeOfSupplyName: "Delhi",
  csbLabel: "CSB-5",
  reference: "PO-2026-3391",
  irn: "e10c5f1b72ff4652b109be942e277f55a68ab4187247fcebde2088091d3a6a1c",
  buyer: {
    version: MANUAL_SNAPSHOT_VERSION,
    legalName: "Meridian Textiles Private Limited",
    tradeName: "Meridian Exports",
    customerCode: "MTX-0114",
    contactName: "Priya Raghavan",
    addressLines: ["Plot 22, Okhla Industrial Estate Phase III"],
    city: "New Delhi",
    stateName: "Delhi",
    stateCode: "07",
    postalCode: "110020",
    country: "India",
    gstin: "07AAECM4321K1Z9",
    pan: "AAECM4321K",
    cin: "U17110DL2015PTC281234",
    email: "accounts@meridiantextiles.in",
    phone: "+91 98765 43210",
  },
  consignments: [
    consignment({
      sortOrder: 0,
      awbNumber: "176-51234567",
      mawbNumber: "176-51234567",
      bookingDate: new Date("2026-07-28T04:00:00.000Z").toISOString(),
      origin: "New Delhi",
      destination: "Dubai",
      serviceType: "Air freight, express",
      originPort: "DEL",
      destinationPort: "DXB",
      flightNumber: "EK 511",
      airlineName: "Emirates SkyCargo",
      pieces: 12,
      grossWeightKg: 284.5,
      chargeableWeightKg: 310,
      palletCount: 2,
      cartonCount: 12,
      goodsDescription: "Cotton apparel",
      exportInvoiceNo: "MTX/EXP/2026/0188",
      shipperName: "Meridian Textiles Private Limited",
      consigneeName: "Al Noor Trading LLC",
      jobNumber: "ARN-JOB-4412",
      charges: [
        charge("Freight charges", 148_500, { rate: 479.03, quantity: 310 }),
        charge("Fuel surcharge", 22_275),
        charge("AHS charges", 4_650),
        charge("Documentation charges", 2_500),
        charge("Custom clearance charges", 6_500),
        charge("Destination duty and taxes", 31_400, {
          ratePercent: 0,
          reimbursement: true,
        }),
      ],
    }),
    consignment({
      sortOrder: 1,
      awbNumber: "176-51234578",
      bookingDate: new Date("2026-07-30T04:00:00.000Z").toISOString(),
      origin: "New Delhi",
      destination: "London",
      serviceType: "Air freight, economy",
      originPort: "DEL",
      destinationPort: "LHR",
      flightNumber: "BA 142",
      airlineName: "IAG Cargo",
      pieces: 6,
      grossWeightKg: 96.2,
      chargeableWeightKg: 104,
      cartonCount: 6,
      goodsDescription: "Cotton apparel samples",
      jobNumber: "ARN-JOB-4419",
      charges: [
        charge("Freight charges", 62_400, { rate: 600, quantity: 104 }),
        charge("Fuel surcharge", 9_360),
        charge("TSP charges at origin", 1_850),
        charge("Airline DO charges", 4_200, {
          ratePercent: 0,
          reimbursement: true,
        }),
      ],
    }),
    consignment({
      sortOrder: 2,
      awbNumber: "176-51234589",
      bookingDate: new Date("2026-08-02T04:00:00.000Z").toISOString(),
      origin: "New Delhi",
      destination: "Singapore",
      serviceType: "Air freight, express",
      originPort: "DEL",
      destinationPort: "SIN",
      pieces: 3,
      grossWeightKg: 41,
      chargeableWeightKg: 45,
      cartonCount: 3,
      jobNumber: "ARN-JOB-4427",
      charges: [
        charge("Freight charges", 27_000, { rate: 600, quantity: 45 }),
        charge("Fuel surcharge", 4_050),
        charge("Packing charges", 1_200, { discount: 200 }),
      ],
    }),
  ],
});

// ---------------------------------------------------------------------------
// Sample 2: domestic, one consignment, CGST + SGST, no recoveries
// ---------------------------------------------------------------------------

const DOMESTIC_SAMPLE = assemble({
  invoiceNumber: "ARM/26-27/00043",
  mode: ShipmentMode.DOMESTIC,
  placeOfSupplyCode: "06",
  placeOfSupplyName: "Haryana",
  csbLabel: null,
  reference: null,
  buyer: {
    version: MANUAL_SNAPSHOT_VERSION,
    legalName: "Sandhu Auto Components",
    tradeName: null,
    customerCode: null,
    contactName: "Harjit Sandhu",
    addressLines: ["Plot 47, Sector 37, Pace City II"],
    city: "Gurugram",
    stateName: "Haryana",
    stateCode: "06",
    postalCode: "122001",
    country: "India",
    gstin: null,
    pan: "AFTPS8812J",
    cin: null,
    email: "harjit@sandhuauto.in",
    phone: "+91 99100 11223",
  },
  consignments: [
    consignment({
      sortOrder: 0,
      awbNumber: "SM8841200315",
      bookingDate: new Date("2026-08-04T04:00:00.000Z").toISOString(),
      origin: "Gurugram",
      destination: "Pune",
      serviceType: "Surface express",
      pieces: 4,
      grossWeightKg: 62,
      chargeableWeightKg: 62,
      boxCount: 4,
      goodsDescription: "Machined components",
      charges: [
        charge("Freight charges", 8_400, { rate: 135.48, quantity: 62 }),
        charge("Fuel surcharge", 1_260),
        charge("Pick up charges", 450),
        charge("ODA location charges", 800),
      ],
    }),
  ],
});

// ---------------------------------------------------------------------------
// Sample 3: a person, no GSTIN, export, place of supply 96, shown as a preview
// ---------------------------------------------------------------------------
//
// Two things worth checking on the page here. The BILLED TO panel has no GSTIN
// row at all rather than one reading "Unregistered", because a person has no
// GSTIN to be missing. And the place of supply is 96, Outside India, which is
// what GSTR-1 wants on an export and which is not a state.

const INDIVIDUAL_SAMPLE = assemble({
  invoiceNumber: DRAFT_NUMBER_PLACEHOLDER,
  draft: true,
  mode: ShipmentMode.INTERNATIONAL,
  placeOfSupplyCode: OUTSIDE_INDIA.code,
  placeOfSupplyName: OUTSIDE_INDIA.name,
  csbLabel: "CSB-5",
  reference: null,
  buyer: {
    version: MANUAL_SNAPSHOT_VERSION,
    kind: "INDIVIDUAL",
    legalName: "Priya Raghunathan",
    tradeName: null,
    customerCode: null,
    contactName: null,
    addressLines: ["Flat 3B, Palm Grove Residency", "Bandra West"],
    city: "Mumbai",
    stateName: "Maharashtra",
    stateCode: "27",
    postalCode: "400050",
    country: "India",
    gstin: null,
    pan: null,
    cin: null,
    email: "priya.r@example.com",
    phone: "+91 98200 44556",
  },
  consignments: [
    consignment({
      sortOrder: 0,
      awbNumber: "176-88451209",
      bookingDate: new Date("2026-08-05T04:00:00.000Z").toISOString(),
      origin: "Mumbai, Maharashtra",
      originPostalCode: "400050",
      originCity: "Mumbai",
      originState: "Maharashtra",
      originCountry: "India",
      originPort: "BOM",
      destination: "Toronto, Canada",
      destinationPostalCode: "M5V 2T6",
      destinationCity: "Toronto",
      destinationState: "Ontario",
      destinationCountry: "Canada",
      destinationPort: "YYZ",
      serviceType: "Air freight",
      pieces: 3,
      grossWeightKg: 41.5,
      chargeableWeightKg: 44,
      boxCount: 3,
      goodsDescription: "Used personal effects and household goods",
      shipperName: "Priya Raghunathan",
      consigneeName: "Arjun Raghunathan",
      charges: [
        charge("Freight charges", 52_800, { rate: 1_200, quantity: 44 }),
        charge("Fuel surcharge", 6_336),
        charge("Airline security charge", 1_320),
        charge("Packing charges", 2_500),
        charge("Destination duty and taxes", 9_400, {
          ratePercent: 0,
          reimbursement: true,
        }),
      ],
    }),
  ],
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function write(
  data: ManualInvoiceDocumentData,
  variant: ManualInvoiceVariant,
  path: string,
) {
  const buffer = await renderToBuffer(
    <ManualInvoiceDocument data={data} variant={variant} />,
  );
  writeFileSync(path, buffer);
  console.log(`${path}  ${(buffer.length / 1024).toFixed(0)} kB`);
}

async function main() {
  await write(EXPORT_SAMPLE, "arena", "sample-manual-invoice-arena.pdf");
  await write(EXPORT_SAMPLE, "grid", "sample-manual-invoice-grid.pdf");
  await write(DOMESTIC_SAMPLE, "arena", "sample-manual-domestic-arena.pdf");
  await write(DOMESTIC_SAMPLE, "grid", "sample-manual-domestic-grid.pdf");
  await write(INDIVIDUAL_SAMPLE, "arena", "sample-manual-individual-preview.pdf");

  console.log(
    `\nexport total   ${EXPORT_SAMPLE.total.toFixed(2)} (tax ${EXPORT_SAMPLE.totalTax.toFixed(2)}, recovered ${EXPORT_SAMPLE.reimbursements.toFixed(2)})`,
  );
  console.log(
    `domestic total ${DOMESTIC_SAMPLE.total.toFixed(2)} (tax ${DOMESTIC_SAMPLE.totalTax.toFixed(2)})`,
  );
  console.log(
    `individual     ${INDIVIDUAL_SAMPLE.total.toFixed(2)} (tax ${INDIVIDUAL_SAMPLE.totalTax.toFixed(2)}, recovered ${INDIVIDUAL_SAMPLE.reimbursements.toFixed(2)}), IGST ${INDIVIDUAL_SAMPLE.igstAmount.toFixed(2)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
