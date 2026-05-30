"use server";

import * as XLSX from "xlsx";

import { prisma } from "@/utils/db";
import { revalidatePath } from "next/cache";

export async function exportClientsAction() {
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
    },

    orderBy: {
      companyName: "asc",
    },
  });

  const rows = clients.map((client) => ({
    Company: client.companyName,
    Contact: client.contactName ?? "",
    Email: client.email ?? "",
    Phone: client.phone ?? "",
    Address: client.addressLine1 ?? "",
    City: client.city ?? "",
    State: client.state ?? "",
    Country: client.country ?? "",
    PostalCode: client.postalCode ?? "",
    Notes: client.notes ?? "",
  }));

  const workbook = XLSX.utils.book_new();

  const worksheet =
    XLSX.utils.json_to_sheet(rows);

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Clients",
  );

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  return buffer.toString("base64");
}



export async function importClientsAction(
  rows: Array<{
    companyName: string;
    contactName?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    notes?: string;
  }>,
) {
  const validRows = rows.filter(
    (row) => row.companyName.trim().length > 0,
  );

  if (!validRows.length) {
    return {
      success: false,
      message: "No valid clients found in the spreadsheet",
    };
  }

  await prisma.client.createMany({
    data: validRows,
  });

  revalidatePath("/clients");

  return {
    success: true,
    count: validRows.length,
  };
}