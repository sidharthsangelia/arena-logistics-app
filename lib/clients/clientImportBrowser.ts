"use client";

import * as XLSX from "xlsx";
import {
  buildInstructionSheetRows,
  matchHeader,
  TEMPLATE_EXAMPLE_ROWS,
  TEMPLATE_HEADERS,
  type ClientImportRow,
} from "@/lib/clients/clientImportSpec";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

export type ParseResult =
  | { ok: true; rows: ClientImportRow[] }
  | { ok: false; error: string };

/**
 * Read a CSV/XLSX File into field-keyed rows using the shared header map.
 * Unrecognised columns are ignored; recognised ones are matched loosely by
 * header name (not position), so a misaligned file surfaces in the preview
 * rather than silently writing data into the wrong field.
 */
export async function parseClientFile(file: File): Promise<ParseResult> {
  const arrayBuffer = await file.arrayBuffer();

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(arrayBuffer, { type: "array" });
  } catch {
    return { ok: false, error: "Couldn't read that file — is it a valid CSV or Excel file?" };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { ok: false, error: "The file doesn't contain any sheets." };

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!rawRows.length) return { ok: false, error: "The file doesn't contain any data rows." };

  const rows: ClientImportRow[] = rawRows.map((raw) => {
    const row: ClientImportRow = {};
    for (const [header, value] of Object.entries(raw)) {
      const field = matchHeader(header);
      if (!field) continue;
      const str = value?.toString().trim();
      if (str) row[field] = str;
    }
    return row;
  });

  const anyRecognised = rows.some((r) => Object.keys(r).length > 0);
  if (!anyRecognised) {
    return {
      ok: false,
      error:
        "None of the columns were recognised. Download the template to see the expected headers.",
    };
  }

  return { ok: true, rows };
}

/** Build and download the .xlsx template (Instructions + Clients sheets). */
export function downloadClientTemplate() {
  const workbook = XLSX.utils.book_new();

  const instructions = XLSX.utils.aoa_to_sheet(buildInstructionSheetRows());
  instructions["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 70 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");

  const clients = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE_ROWS]);
  clients["!cols"] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 4) }));
  XLSX.utils.book_append_sheet(workbook, clients, "Clients");

  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "client-import-template.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}
