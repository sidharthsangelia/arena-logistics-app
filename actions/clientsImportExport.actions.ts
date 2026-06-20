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
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Clients");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer.toString("base64");
}

// ---------------------------------------------------------------------------
// importClientsAction
// ---------------------------------------------------------------------------

export type ImportClientRow = {
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
};

export type ImportClientsResult = {
  success: boolean;
  message?: string;
  imported: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  total: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS_PER_IMPORT = 5000; // sanity cap so one bad file can't hammer the DB
const DB_BATCH_SIZE = 500; // chunk createMany calls

export async function importClientsAction(
  rows: ImportClientRow[],
): Promise<ImportClientsResult> {
  // 1. Resolve tenant — never let this throw out to the client uncaught.
  let orgId: string;
  try {
    orgId = await getDbOrgId();
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Could not resolve organisation.",
      imported: 0,
      skippedDuplicates: 0,
      skippedInvalid: 0,
      total: rows?.length ?? 0,
    };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      success: false,
      message: "No rows were found in the uploaded file.",
      imported: 0,
      skippedDuplicates: 0,
      skippedInvalid: 0,
      total: 0,
    };
  }

  if (rows.length > MAX_ROWS_PER_IMPORT) {
    return {
      success: false,
      message: `File has ${rows.length} rows; the maximum supported per import is ${MAX_ROWS_PER_IMPORT}. Split the file and try again.`,
      imported: 0,
      skippedDuplicates: 0,
      skippedInvalid: 0,
      total: rows.length,
    };
  }

  // 2. Per-row validation/cleanup. A bad email shouldn't nuke an otherwise
  //    valid row — just drop that field and keep going.
  let skippedInvalid = 0;
  const cleaned: ImportClientRow[] = [];

  for (const row of rows) {
    const companyName = (row.companyName ?? "").trim();
    if (!companyName) {
      skippedInvalid++;
      continue;
    }

    const email = row.email?.trim();
    const validEmail = email && EMAIL_RE.test(email) ? email : undefined;
    if (email && !validEmail) skippedInvalid++;

    cleaned.push({ ...row, companyName, email: validEmail });
  }

  if (!cleaned.length) {
    return {
      success: false,
      message: "No valid clients found in the spreadsheet.",
      imported: 0,
      skippedDuplicates: 0,
      skippedInvalid,
      total: rows.length,
    };
  }

  // 3. De-duplicate *within the uploaded file itself* (last occurrence wins).
  //    createMany won't do this for you — two identical rows in one file
  //    will both be sent to the DB and can trip a unique constraint.
  const byKey = new Map<string, ImportClientRow>();
  for (const row of cleaned) {
    const key = row.email
      ? `email:${row.email.toLowerCase()}`
      : `name:${row.companyName.toLowerCase()}`;
    byKey.set(key, row);
  }
  const deduped = Array.from(byKey.values());
  const skippedDuplicatesInFile = cleaned.length - deduped.length;

  const dataToInsert = deduped.map((row) => ({
    companyName: row.companyName,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    addressLine1: row.addressLine1,
    city: row.city,
    state: row.state,
    country: row.country,
    postalCode: row.postalCode,
    notes: row.notes,
    orgId,
  }));

  // 4. Insert in chunks. skipDuplicates lets rows that collide with an
  //    *existing* DB record (e.g. same unique email for this org) get
  //    silently skipped instead of failing the whole batch.
  //    NOTE: skipDuplicates is supported on Postgres/MySQL but NOT on
  //    SQLite or SQL Server. If you're on one of those, remove the option
  //    and instead insert rows one at a time inside a try/catch, catching
  //    Prisma error code P2002 per row.
  let imported = 0;
  try {
    for (let i = 0; i < dataToInsert.length; i += DB_BATCH_SIZE) {
      const chunk = dataToInsert.slice(i, i + DB_BATCH_SIZE);
      const result = await prisma.client.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      imported += result.count;
    }
  } catch (err) {
    console.error("importClientsAction: createMany failed", err);
    return {
      success: imported > 0,
      message:
        imported > 0
          ? "Import partially completed before an error occurred. Some rows may not have been saved."
          : "Import failed while writing to the database. No rows were saved.",
      imported,
      skippedDuplicates: skippedDuplicatesInFile + (dataToInsert.length - imported),
      skippedInvalid,
      total: rows.length,
    };
  }

  revalidatePath("/clients");

  const skippedDuplicates = skippedDuplicatesInFile + (dataToInsert.length - imported);

  return {
    success: imported > 0,
    message: imported === 0 ? "All rows were duplicates of existing clients." : undefined,
    imported,
    skippedDuplicates,
    skippedInvalid,
    total: rows.length,
  };
}