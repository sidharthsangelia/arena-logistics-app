/**
 * Renders a sample invoice to a real PDF, so the template can be looked at
 * without booking a shipment. Throwaway verification script.
 */

import { writeFileSync } from "node:fs";

import { ShipmentMode } from "@/generated/prisma";
import { makeChargeDescriber } from "@/lib/invoices/tax/chargeNames";
import { buildInvoiceMoney, verifyInvoiceMoney } from "@/lib/invoices/tax/money";
import { INVOICE_SNAPSHOT_VERSION } from "@/lib/invoices/tax/types";
import type { InvoiceDocumentData } from "@/lib/invoices/tax/types";

async function main() {
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

  console.log("verify:", verifyInvoiceMoney(money, 23200));
  console.log("lines:");
  for (const l of money.lineItems) {
    console.log(`  ${l.description.padEnd(46)} ${l.taxableValue.toFixed(2).padStart(12)}`);
  }
  console.log(`  ${"taxable".padEnd(46)} ${money.taxableValue.toFixed(2).padStart(12)}`);
  console.log(`  ${"igst".padEnd(46)} ${money.igstAmount.toFixed(2).padStart(12)}`);
  console.log(`  ${"total".padEnd(46)} ${money.total.toFixed(2).padStart(12)}`);

  const data: InvoiceDocumentData = {
    invoiceNumber: "ARN/26-27/00042",
    docType: "TAX_INVOICE",
    issueDate: new Date("2026-07-31T06:30:00Z").toISOString(),
    financialYear: "26-27",
    status: "PAID",
    seller: {
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
    },
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
      origin: { name: "Adnan Khan", companyName: "Acme Exports", city: "New Delhi", state: "Delhi", country: "India", postalCode: "110075" },
      destination: { name: "Sara Al Mansouri", companyName: null, city: "Dubai", state: null, country: "United Arab Emirates", postalCode: "00000" },
      packageCount: 3,
      actualWeightKg: 24.5,
      chargeableWeightKg: 26.2,
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

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { TaxInvoiceDocument } = await import(
    "@/lib/invoices/tax/pdf/TaxInvoiceDocument"
  );

  const buffer = await renderToBuffer(<TaxInvoiceDocument data={data} />);
  const out = `./sample-invoice.pdf`;
  writeFileSync(out, buffer);
  console.log(`\nwrote ${out} (${buffer.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
