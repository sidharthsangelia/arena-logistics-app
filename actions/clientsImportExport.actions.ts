"use server";

import * as XLSX from "xlsx";
import { prisma } from "@/utils/db";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";

// ---------------------------------------------------------------------------
// Tenant context
// ---------------------------------------------------------------------------

async function getDbOrgId(): Promise<string> {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) throw new Error("No active organisation in session.");

  const org = await prisma.org.findUnique({
    where: { clerkOrgId },
    select: { id: true },
  });
  if (!org) throw new Error(`Org not found for clerkOrgId: ${clerkOrgId}`);
  return org.id;
}

// ---------------------------------------------------------------------------
// exportClientsAction
// ---------------------------------------------------------------------------

export async function exportClientsAction() {
  const orgId = await getDbOrgId();

  const clients = await prisma.client.findMany({
    where: { orgId, deletedAt: null },
    orderBy: { companyName: "asc" },
  });

  const rows = clients.map((client) => ({
    Company:    client.companyName,
    Contact:    client.contactName  ?? "",
    Email:      client.email        ?? "",
    Phone:      client.phone        ?? "",
    Address:    client.addressLine1 ?? "",
    City:       client.city         ?? "",
    State:      client.state        ?? "",
    Country:    client.country      ?? "",
    PostalCode: client.postalCode   ?? "",
    Notes:      client.notes        ?? "",
  }));

  const workbook  = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Clients");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer.toString("base64");
}

// ---------------------------------------------------------------------------
// importClientsAction
// ---------------------------------------------------------------------------

export async function importClientsAction(
  rows: Array<{
    companyName:  string;
    contactName?: string;
    email?:       string;
    phone?:       string;
    addressLine1?: string;
    city?:        string;
    state?:       string;
    country?:     string;
    postalCode?:  string;
    notes?:       string;
  }>,
) {
  const orgId = await getDbOrgId();

  const validRows = rows
    .filter((row) => row.companyName.trim().length > 0)
    .map((row) => ({ ...row, orgId })); // inject orgId into every row

  if (!validRows.length) {
    return { success: false, message: "No valid clients found in the spreadsheet." };
  }

  await prisma.client.createMany({ data: validRows });

  revalidatePath("/clients");
  return { success: true, count: validRows.length };
}