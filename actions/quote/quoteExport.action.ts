// actions/quotesExport.action.ts
"use server";

import * as XLSX from "xlsx";
import { prisma } from "@/utils/db";
import { getDbOrgId } from "@/utils/tenant";
import { isArenaOrg } from "@/lib/branding/isArenaOrg.server";
import { displayServiceName } from "@/lib/branding/serviceName";

export async function exportQuotesAction() {
  const orgId = await getDbOrgId();
  const showVendor = await isArenaOrg();

  const quotes = await prisma.quote.findMany({
    where:   { orgId },
    orderBy: { createdAt: "desc" },
    select: {
      quoteNumber:   true,
      status:        true,
      vendorName:    true,
      productName:   true,
      currency:      true,
      subtotal:      true,
      tax:           true,
      total:         true,
      markupPercent: true,
      quotedTotal:   true,
      tatDays:       true,
      validUntil:    true,
      createdAt:     true,
      client: {
        select: {
          companyName: true,
          contactName: true,
          email:       true,
        },
      },
      // Latest email event for the "Email Status" column
      emailEvents: {
        orderBy: { createdAt: "desc" },
        take:    1,
        select:  { event: true },
      },
    },
  });

  const rows = quotes.map((q) => ({
    "Quote #":        q.quoteNumber,
    "Status":         q.status,
    "Email Status":   q.emailEvents[0]?.event ?? "NOT SENT",
    "Client Company": q.client?.companyName  ?? "",
    "Client Contact": q.client?.contactName  ?? "",
    "Client Email":   q.client?.email        ?? "",
    "Vendor":         q.vendorName,
    "Product":        displayServiceName(q.productName, showVendor),
    "Currency":       q.currency,
    "Subtotal":       Number(q.subtotal),
    "Tax":            Number(q.tax),
    "Carrier Total":  Number(q.total),
    "Markup %":       Number(q.markupPercent),
    "Quoted Total":   Number(q.quotedTotal),
    "TAT (days)":     q.tatDays ?? "TBA",
    "Valid Until":    q.validUntil.toLocaleDateString("en-IN"),
    "Created":        q.createdAt.toLocaleDateString("en-IN"),
  }));

  const workbook  = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Auto-size columns
  const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.max(
      key.length,
      ...rows.map((r) => String(r[key as keyof typeof r] ?? "").length)
    ) + 2,
  }));
  worksheet["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(workbook, worksheet, "Quotes");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer.toString("base64");
}