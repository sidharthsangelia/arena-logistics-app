"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";

import { Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

import { toast } from "sonner";

import {
  importClientsAction,
  type ImportClientRow,
} from "@/actions/clientsImportExport.actions";

// Accepted header variants -> the field they populate. Keys are normalized
// (lowercased, spaces/underscores/dashes stripped) so "Company", "company name",
// "Company_Name" etc. all resolve to the same field. This makes the importer
// tolerant of real-world spreadsheets that don't match the export format
// byte-for-byte.
const HEADER_MAP: Record<string, keyof ImportClientRow> = {
  company: "companyName",
  companyname: "companyName",
  contact: "contactName",
  contactname: "contactName",
  contactperson: "contactName",
  email: "email",
  emailaddress: "email",
  phone: "phone",
  phonenumber: "phone",
  mobile: "phone",
  address: "addressLine1",
  addressline1: "addressLine1",
  street: "addressLine1",
  city: "city",
  state: "state",
  province: "state",
  country: "country",
  postalcode: "postalCode",
  zip: "postalCode",
  zipcode: "postalCode",
  notes: "notes",
  remarks: "notes",
};

function normalizeHeader(header: string): keyof ImportClientRow | null {
  const key = header.toLowerCase().trim().replace(/[\s_-]+/g, "");
  return HEADER_MAP[key] ?? null;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

export default function ImportClientsButton() {
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    // Reset immediately so re-selecting the *same* file later still fires
    // onChange (browsers don't fire change events for an unchanged value).
    if (inputRef.current) inputRef.current.value = "";

    if (!file) return;

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      toast.error("Unsupported file type. Please upload a .csv, .xlsx, or .xls file.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File is too large. Maximum size is 5MB.");
      return;
    }

    setIsLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();

      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(arrayBuffer, { type: "array" });
      } catch {
        toast.error("Couldn't read that file — is it a valid CSV or Excel file?");
        return;
      }

      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        toast.error("The file doesn't contain any sheets.");
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      if (!rawRows.length) {
        toast.error("The file doesn't contain any data rows.");
        return;
      }

      const parsedRows: ImportClientRow[] = rawRows
        .map((raw) => {
          const row: Partial<ImportClientRow> = {};
          for (const [header, value] of Object.entries(raw)) {
            const field = normalizeHeader(header);
            if (!field) continue;
            const str = value?.toString().trim();
            if (str) row[field] = str;
          }
          return row;
        })
        .filter((row): row is ImportClientRow => Boolean(row.companyName?.length));

      if (!parsedRows.length) {
        toast.error(
          "No usable rows found. Make sure the file has a 'Company' column with values in it.",
        );
        return;
      }

      const result = await importClientsAction(parsedRows);

      if (!result.success) {
        toast.error(result.message ?? "Import failed.");
        return;
      }

      const parts = [
        `${result.imported} client${result.imported === 1 ? "" : "s"} imported`,
      ];
      if (result.skippedDuplicates) {
        parts.push(`${result.skippedDuplicates} duplicate${result.skippedDuplicates === 1 ? "" : "s"} skipped`);
      }
      if (result.skippedInvalid) {
        parts.push(`${result.skippedInvalid} invalid row${result.skippedInvalid === 1 ? "" : "s"} skipped`);
      }
      toast.success(parts.join(", "));
    } catch (err) {
      console.error("Client import failed:", err);
      toast.error("Something went wrong while importing. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        id="client-import"
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFile}
        disabled={isLoading}
      />

      <Button
        variant="outline"
        disabled={isLoading}
        onClick={() => inputRef.current?.click()}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {isLoading ? "Importing..." : "Import Excel / CSV"}
      </Button>
    </>
  );
}