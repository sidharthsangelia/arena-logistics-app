"use server";

import * as XLSX from "xlsx";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/utils/db";
import { revalidatePath } from "next/cache";
import { getDbOrgId } from "@/utils/tenant";
import { CompanyKind } from "@/generated/prisma";
import {
  COLUMN_SPECS,
  EMAIL_RE,
  MAX_ROWS_PER_IMPORT,
  PREVIEW_CAP,
  parseCompanyKind,
  type ClientImportRow,
  type ImportAnalysis,
  type PreviewRow,
  type RowIssue,
} from "@/lib/clients/clientImportSpec";

const DB_BATCH_SIZE = 500; // chunk createMany calls

// ---------------------------------------------------------------------------
// exportClientsAction — download the org's clients as an .xlsx (base64).
// Columns mirror the import template so an export can be re-imported cleanly.
// ---------------------------------------------------------------------------

export async function exportClientsAction(): Promise<string> {
  const orgId = await getDbOrgId();

  const clients = await prisma.client.findMany({
    where: { orgId, deletedAt: null },
    orderBy: { companyName: "asc" },
  });

  const rows = clients.map((client) => ({
    "Company Name": client.companyName ?? "",
    "Contact Name": client.contactName ?? "",
    Email: client.email ?? "",
    Phone: client.phone ?? "",
    Type: client.companyKind === CompanyKind.COMPANY ? "Company" : "Individual",
    Address: client.addressLine1 ?? "",
    City: client.city ?? "",
    State: client.state ?? "",
    Country: client.country ?? "",
    "Postal Code": client.postalCode ?? "",
    Notes: client.notes ?? "",
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: COLUMN_SPECS.map((c) => c.header),
  });
  XLSX.utils.book_append_sheet(workbook, worksheet, "Clients");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer.toString("base64");
}

// ---------------------------------------------------------------------------
// importClientsAction — analyse (and optionally commit) a bulk import.
//
// The client calls this twice with the SAME rows:
//   1. dryRun: true  -> validate everything, detect duplicates, write nothing,
//                       return a categorised breakdown for the preview UI.
//   2. dryRun: false -> re-run the exact same deterministic pipeline and write
//                       the surviving rows.
//
// Running one code path for both guarantees the preview matches what is saved.
// Every DB read/write is scoped to the caller's org, so no row can ever land
// in — or be matched against — another tenant's data.
// ---------------------------------------------------------------------------

function emptyAnalysis(dryRun: boolean, total: number, message: string): ImportAnalysis {
  return {
    success: false,
    dryRun,
    message,
    total,
    readyCount: 0,
    invalidRows: [],
    duplicateInFileRows: [],
    duplicateExistingRows: [],
    preview: [],
    truncated: false,
  };
}

type CleanRow = {
  companyName: string;
  contactName: string;
  email: string | null;
  phone: string;
  companyKind: CompanyKind;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  notes: string | null;
  orgId: string;
};

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function nullable(value: string | undefined): string | null {
  const v = clean(value);
  return v.length ? v : null;
}

export async function importClientsAction(
  rows: ClientImportRow[],
  options?: { dryRun?: boolean },
): Promise<ImportAnalysis> {
  const dryRun = options?.dryRun ?? false;
  const total = Array.isArray(rows) ? rows.length : 0;

  // 1. Tenant — resolve first, and never let it throw out to the client.
  let orgId: string;
  try {
    orgId = await getDbOrgId();
  } catch (err) {
    Sentry.captureException(err, { tags: { location: "importClientsAction.getDbOrgId" } });
    return emptyAnalysis(dryRun, total, err instanceof Error ? err.message : "Could not resolve organisation.");
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return emptyAnalysis(dryRun, total, "No rows were found in the uploaded file.");
  }

  if (rows.length > MAX_ROWS_PER_IMPORT) {
    return emptyAnalysis(
      dryRun,
      total,
      `File has ${rows.length} rows; the maximum per import is ${MAX_ROWS_PER_IMPORT}. Split the file and try again.`,
    );
  }

  // 2. Pull existing clients for this org so we can skip (never overwrite)
  //    ones that already exist. Scoped to orgId — cross-tenant matching is
  //    impossible by construction.
  let existingEmails: Set<string>;
  let existingNames: Set<string>;
  try {
    const existing = await prisma.client.findMany({
      where: { orgId, deletedAt: null },
      select: { email: true, companyName: true },
    });
    existingEmails = new Set(
      existing.map((c) => c.email?.toLowerCase().trim()).filter((v): v is string => Boolean(v)),
    );
    existingNames = new Set(
      existing.map((c) => c.companyName?.toLowerCase().trim()).filter((v): v is string => Boolean(v)),
    );
  } catch (err) {
    Sentry.captureException(err, { tags: { location: "importClientsAction.loadExisting" }, extra: { orgId } });
    return emptyAnalysis(dryRun, total, "Could not read your existing clients to check for duplicates. Please try again.");
  }

  // 3. Validate + categorise every row deterministically.
  const invalidRows: RowIssue[] = [];
  const duplicateInFileRows: RowIssue[] = [];
  const duplicateExistingRows: RowIssue[] = [];
  const preview: PreviewRow[] = [];
  const toInsert: CleanRow[] = [];

  const seenInFile = new Set<string>(); // in-file dedup keys

  rows.forEach((raw, i) => {
    const sheetRow = i + 2; // +1 for 0-index, +1 for the header row
    const contactName = clean(raw.contactName);
    const phone = clean(raw.phone);
    let companyName = clean(raw.companyName);

    // --- hard requirements ---
    const reasons: string[] = [];
    if (!contactName) reasons.push("Missing Contact Name");
    if (!phone) reasons.push("Missing Phone");

    const label = companyName || contactName || `Row ${sheetRow}`;
    if (reasons.length) {
      invalidRows.push({ row: sheetRow, label, reasons });
      return;
    }

    // --- soft cleanups (warnings, not rejections) ---
    const warnings: string[] = [];

    const rawEmail = clean(raw.email);
    let email: string | null = null;
    if (rawEmail) {
      if (EMAIL_RE.test(rawEmail)) {
        email = rawEmail.toLowerCase();
      } else {
        warnings.push(`Email "${rawEmail}" is invalid — imported without an email`);
      }
    }

    let companyKind = parseCompanyKind(raw.companyKind);
    if (!companyName) {
      companyName = contactName;
      companyKind = CompanyKind.INDIVIDUAL;
      warnings.push("Company Name was blank — using Contact Name (Individual)");
    }

    // --- de-dupe within this file (last write wins is not needed; first wins) ---
    const dedupeKey = email ? `email:${email}` : `name:${companyName.toLowerCase()}`;
    if (seenInFile.has(dedupeKey)) {
      duplicateInFileRows.push({ row: sheetRow, label, reasons: ["Duplicate of an earlier row in this file"] });
      return;
    }

    // --- de-dupe against existing clients (skip, do not overwrite) ---
    const existsByEmail = email ? existingEmails.has(email) : false;
    const existsByName = !email && existingNames.has(companyName.toLowerCase());
    if (existsByEmail || existsByName) {
      duplicateExistingRows.push({
        row: sheetRow,
        label,
        reasons: [existsByEmail ? "A client with this email already exists" : "A client with this name already exists"],
      });
      return;
    }

    seenInFile.add(dedupeKey);

    toInsert.push({
      companyName,
      contactName,
      email,
      phone,
      companyKind,
      addressLine1: nullable(raw.addressLine1),
      city: nullable(raw.city),
      state: nullable(raw.state),
      country: nullable(raw.country),
      postalCode: nullable(raw.postalCode),
      notes: nullable(raw.notes),
      orgId,
    });

    if (preview.length < PREVIEW_CAP) {
      preview.push({
        row: sheetRow,
        companyName,
        contactName,
        email: email ?? "",
        phone,
        type: companyKind === CompanyKind.COMPANY ? "Company" : "Individual",
        warnings,
      });
    }
  });

  const truncated =
    preview.length >= PREVIEW_CAP ||
    invalidRows.length > PREVIEW_CAP ||
    duplicateInFileRows.length > PREVIEW_CAP ||
    duplicateExistingRows.length > PREVIEW_CAP;

  const cap = (arr: RowIssue[]) => arr.slice(0, PREVIEW_CAP);

  const baseResult: ImportAnalysis = {
    success: true,
    dryRun,
    total,
    readyCount: toInsert.length,
    invalidRows: cap(invalidRows),
    duplicateInFileRows: cap(duplicateInFileRows),
    duplicateExistingRows: cap(duplicateExistingRows),
    preview,
    truncated,
  };

  // 4a. Dry run — return the analysis, write nothing.
  if (dryRun) {
    return {
      ...baseResult,
      message:
        toInsert.length === 0
          ? "No rows are ready to import. Review the issues below."
          : undefined,
    };
  }

  // 4b. Commit — write the surviving rows in chunks.
  if (toInsert.length === 0) {
    return { ...baseResult, committed: false, importedCount: 0, message: "No rows were ready to import." };
  }

  let importedCount = 0;
  try {
    for (let i = 0; i < toInsert.length; i += DB_BATCH_SIZE) {
      const chunk = toInsert.slice(i, i + DB_BATCH_SIZE);
      const result = await prisma.client.createMany({ data: chunk, skipDuplicates: true });
      importedCount += result.count;
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { location: "importClientsAction.createMany" },
      extra: { orgId, attempted: toInsert.length, importedCount },
    });
    return {
      ...baseResult,
      success: importedCount > 0,
      committed: importedCount > 0,
      importedCount,
      message:
        importedCount > 0
          ? "Import partially completed before an error occurred. Some rows may not have been saved."
          : "Import failed while saving. No rows were saved.",
    };
  }

  revalidatePath("/clients");

  return { ...baseResult, committed: true, importedCount };
}
