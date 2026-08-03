/**
 * Renders sample invoices to real PDFs, so the template can be looked at
 * without booking a shipment. Throwaway verification script.
 *
 * Two samples, because the two modes exercise different halves of the page: an
 * export with HSN codes, declared values and a customs category, and a domestic
 * courier booking with none of those and a cash-on-delivery instruction. A
 * template change that looks right on one can easily be wrong on the other.
 *
 *   npx tsx scripts/renderSampleInvoice.tsx
 */

import { writeFileSync } from "node:fs";

import { ShipmentMode, ShipmentType } from "@/generated/prisma";
import { makeChargeDescriber } from "@/lib/invoices/tax/chargeNames";
import { buildInvoiceMoney, verifyInvoiceMoney } from "@/lib/invoices/tax/money";
import { INVOICE_SNAPSHOT_VERSION } from "@/lib/invoices/tax/types";
import type {
  InvoiceDocumentData,
  SellerSnapshot,
} from "@/lib/invoices/tax/types";

const SELLER: SellerSnapshot = {
  version: INVOICE_SNAPSHOT_VERSION,
  legalName: "Arena Cargo And Logistics India Private Limited",
  tradeName: "Arena Cargo Logistics",
  addressLines: ["Unit 402, Vipul Trade Centre", "Sector 48, Sohna Road"],
  city: "Gurugram",
  stateName: "Haryana",
  stateCode: "07",
  postalCode: "122018",
  country: "India",
  gstin: "07AABCA1234A1Z5",
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
  billingEmail: "info@arenalogistics.co.in",
};

function report(
  label: string,
  money: ReturnType<typeof buildInvoiceMoney>,
  expected: number,
) {
  console.log(`\n-- ${label} --`);
  console.log("verify:", verifyInvoiceMoney(money, expected));
  for (const l of money.lineItems) {
    console.log(
      `  ${l.description.padEnd(46)} ${l.taxableValue.toFixed(2).padStart(12)}`,
    );
  }
  console.log(`  ${"taxable".padEnd(46)} ${money.taxableValue.toFixed(2).padStart(12)}`);
  console.log(`  ${"tax".padEnd(46)} ${money.totalTax.toFixed(2).padStart(12)}`);
  console.log(`  ${"total".padEnd(46)} ${money.total.toFixed(2).padStart(12)}`);
}

// ---------------------------------------------------------------------------
// International export: three boxes, HSN codes, declared values, IGST
// ---------------------------------------------------------------------------

function internationalSample(): InvoiceDocumentData {
  const describe = makeChargeDescriber({
    mode: ShipmentMode.INTERNATIONAL,
    originCity: "New Delhi",
    destinationCity: "Dubai",
  });

  const money = buildInvoiceMoney(
    {
      totalCharged: 23200,
      charges: [
        // Vendor-shaped names, as they actually arrive in chargesSnapshot.
        { name: "FREIGHT", amount: 19_500.37 },
        { name: "FUEL_SURCHARGE", amount: 1_940.12 },
        { name: "Overhead charges", amount: 742.5 },
        { name: "Peak Surcharge", amount: 310.25 },
        { name: "War risk surcharge", amount: 118 },
        { name: "GST", amount: 3_100 },
        { name: "SHIPMOZO_HANDLING_2", amount: 220 },
      ],
      firstMileCharge: 1017,
      firstMileLabel: "Dwarka, New Delhi",
      mode: ShipmentMode.INTERNATIONAL,
      sellerStateCode: "07",
      placeOfSupplyCode: "29",
    },
    describe,
  );

  report("international", money, 23200);

  return {
    invoiceNumber: "ARN/26-27/00042",
    docType: "TAX_INVOICE",
    issueDate: new Date("2026-07-31T06:30:00Z").toISOString(),
    financialYear: "26-27",
    status: "PAID",
    seller: SELLER,
    buyer: {
      version: INVOICE_SNAPSHOT_VERSION,
      legalName: "Acme Exports Private Limited",
      contactName: "Adnan Khan",
      addressLines: ["44 MG Road, Indiranagar"],
      city: "Bengaluru",
      stateName: "Karnataka",
      stateCode: "29",
      postalCode: "560038",
      country: "India",
      gstin: "29AACCA9876B1ZQ",
      email: "accounts@acme.example",
      phone: "+91 98450 00000",
    },
    shipment: {
      version: INVOICE_SNAPSHOT_VERSION,
      shipmentNumber: "ARN260731748291",
      mode: ShipmentMode.INTERNATIONAL,
      bookedAt: new Date("2026-07-31T06:30:00Z").toISOString(),
      origin: {
        name: "Adnan Khan",
        companyName: "Acme Exports",
        city: "New Delhi",
        state: "Delhi",
        country: "India",
        postalCode: "110075",
      },
      destination: {
        name: "Sara Al Mansouri",
        companyName: null,
        city: "Dubai",
        state: null,
        country: "United Arab Emirates",
        postalCode: "00000",
      },
      packageCount: 3,
      actualWeightKg: 24.5,
      chargeableWeightKg: 26.2,
      packages: [
        {
          description: "Cotton shirts, Denim jeans",
          quantity: 2,
          lengthCm: 45,
          widthCm: 35,
          heightCm: 30,
          weightKg: 9.5,
          declaredValue: 24000,
          declaredCurrency: "INR",
          contents: [
            {
              description: "Cotton shirts, mens, printed",
              hsCode: "610510",
              quantity: 20,
              unitValue: 450,
              currency: "INR",
            },
            {
              description: "Denim jeans, womens",
              hsCode: "620462",
              quantity: 10,
              unitValue: 1500,
              currency: "INR",
            },
          ],
        },
        {
          description: "Leather belts",
          quantity: 1,
          lengthCm: 30,
          widthCm: 25,
          heightCm: 20,
          weightKg: 5.5,
          declaredValue: 8400,
          declaredCurrency: "INR",
          contents: [
            {
              description: "Leather belts, assorted sizes",
              hsCode: "420330",
              quantity: 12,
              unitValue: 700,
              currency: "INR",
            },
          ],
        },
      ],
      shipmentType: ShipmentType.CSB5,
      declaredCargoType: "Readymade garments",
      awbNumber: "1Z9992K7845201",
      pickupIncluded: true,
      firstMileHubLabel: "Dwarka, New Delhi",
      serviceName: "Arena Drift Express",
      consignor: {
        name: "Ravi Menon",
        companyName: "Menon Textiles",
        city: "Tiruppur",
        state: "Tamil Nadu",
        country: "India",
        postalCode: "641604",
      },
      bookedOnBehalfOfClient: true,
      codAmount: null,
    },
    lineItems: money.lineItems,
    taxableValue: money.taxableValue,
    cgstAmount: money.cgstAmount,
    sgstAmount: money.sgstAmount,
    igstAmount: money.igstAmount,
    totalTax: money.totalTax,
    total: money.total,
    taxRatePercent: money.taxRatePercent,
    currency: "INR",
    isIntraState: money.isIntraState,
    taxNote: null,
    placeOfSupplyCode: "29",
    placeOfSupplyName: "Karnataka",
    paymentNote: "Paid from wallet on 31 July 2026.",
  };
}

// ---------------------------------------------------------------------------
// Domestic courier: one box, no HSN, no declared values, COD, CGST plus SGST
// ---------------------------------------------------------------------------

function domesticSample(): InvoiceDocumentData {
  const describe = makeChargeDescriber({
    mode: ShipmentMode.DOMESTIC,
    originCity: "Gurugram",
    destinationCity: "Jaipur",
  });

  const money = buildInvoiceMoney(
    {
      totalCharged: 742.5,
      charges: [
        { name: "FREIGHT", amount: 560 },
        { name: "FUEL_SURCHARGE", amount: 84.5 },
        { name: "COD charges", amount: 45 },
        { name: "GST", amount: 53 },
      ],
      firstMileCharge: 0,
      firstMileLabel: null,
      mode: ShipmentMode.DOMESTIC,
      sellerStateCode: "07",
      placeOfSupplyCode: "07",
    },
    describe,
  );

  report("domestic", money, 742.5);

  return {
    invoiceNumber: "ARN/26-27/00043",
    docType: "TAX_INVOICE",
    issueDate: new Date("2026-08-01T09:10:00Z").toISOString(),
    financialYear: "26-27",
    status: "UNPAID",
    seller: SELLER,
    buyer: {
      version: INVOICE_SNAPSHOT_VERSION,
      legalName: "Kalra Handlooms",
      contactName: "Nisha Kalra",
      addressLines: ["Shop 12, Sadar Bazaar"],
      city: "Gurugram",
      stateName: "Haryana",
      stateCode: "07",
      postalCode: "122001",
      country: "India",
      gstin: null,
      email: "nisha@kalra.example",
      phone: "+91 99100 00000",
    },
    shipment: {
      version: INVOICE_SNAPSHOT_VERSION,
      shipmentNumber: "ARN260801552104",
      mode: ShipmentMode.DOMESTIC,
      bookedAt: new Date("2026-08-01T09:10:00Z").toISOString(),
      origin: {
        name: "Nisha Kalra",
        companyName: "Kalra Handlooms",
        city: "Gurugram",
        state: "Haryana",
        country: "India",
        postalCode: "122001",
      },
      destination: {
        name: "Pooja Sharma",
        companyName: null,
        city: "Jaipur",
        state: "Rajasthan",
        country: "India",
        postalCode: "302001",
      },
      packageCount: 1,
      actualWeightKg: 3.2,
      chargeableWeightKg: 3.5,
      packages: [
        {
          description: "Handloom bedsheets",
          quantity: 1,
          lengthCm: 40,
          widthCm: 30,
          heightCm: 18,
          weightKg: 3.2,
          declaredValue: null,
          declaredCurrency: "INR",
          contents: [
            {
              description: "Handloom bedsheets, double",
              hsCode: null,
              quantity: 4,
              unitValue: 0,
              currency: "INR",
            },
          ],
        },
      ],
      shipmentType: null,
      declaredCargoType: "Home furnishings",
      awbNumber: null,
      pickupIncluded: false,
      firstMileHubLabel: null,
      serviceName: "Arena Surface Standard",
      consignor: null,
      bookedOnBehalfOfClient: false,
      codAmount: 5400,
    },
    lineItems: money.lineItems,
    taxableValue: money.taxableValue,
    cgstAmount: money.cgstAmount,
    sgstAmount: money.sgstAmount,
    igstAmount: money.igstAmount,
    totalTax: money.totalTax,
    total: money.total,
    taxRatePercent: money.taxRatePercent,
    currency: "INR",
    isIntraState: money.isIntraState,
    taxNote: null,
    placeOfSupplyCode: "07",
    placeOfSupplyName: "Haryana",
    paymentNote: "Payable on collection. This amount has not been settled.",
  };
}

// ---------------------------------------------------------------------------

async function main() {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { TaxInvoiceDocument } = await import(
    "@/lib/invoices/tax/pdf/TaxInvoiceDocument"
  );

  const samples: Array<[string, InvoiceDocumentData]> = [
    ["./sample-invoice.pdf", internationalSample()],
    ["./sample-invoice-domestic.pdf", domesticSample()],
  ];

  for (const [out, data] of samples) {
    const buffer = await renderToBuffer(<TaxInvoiceDocument data={data} />);
    writeFileSync(out, buffer);
    console.log(`\nwrote ${out} (${buffer.length} bytes)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
