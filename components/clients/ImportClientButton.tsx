"use client";

import * as XLSX from "xlsx";

import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

import { toast } from "sonner";

import { importClientsAction } from "@/actions/clientsImportExport.actions";

export default function ImportClientsButton() {
  async function handleFile(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    const arrayBuffer =
      await file.arrayBuffer();

    const workbook = XLSX.read(
      arrayBuffer,
      {
        type: "array",
      },
    );

    const sheet =
      workbook.Sheets[
        workbook.SheetNames[0]
      ];

    const rows =
      XLSX.utils.sheet_to_json(sheet);

   const parsedRows = rows
  .map((row: any) => ({
    companyName:
      row.Company?.toString().trim() ?? "",

    contactName:
      row.Contact?.toString().trim() || undefined,

    email:
      row.Email?.toString().trim() || undefined,

    phone:
      row.Phone?.toString().trim() || undefined,

    addressLine1:
      row.Address?.toString().trim() || undefined,

    city:
      row.City?.toString().trim() || undefined,

    state:
      row.State?.toString().trim() || undefined,

    country:
      row.Country?.toString().trim() || undefined,

    postalCode:
      row.PostalCode?.toString().trim() || undefined,

    notes:
      row.Notes?.toString().trim() || undefined,
  }))
  .filter((row) => row.companyName.length > 0);

    const result =
      await importClientsAction(
        parsedRows,
      );

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    toast.success(
      `${result.count} clients imported`,
    );
  }

  return (
    <>
      <input
        id="client-import"
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFile}
      />

      <Button
        variant="outline"
        onClick={() =>
          document
            .getElementById(
              "client-import",
            )
            ?.click()
        }
      >
        <Upload className="mr-2 h-4 w-4" />
        Import Excel / CSV
      </Button>
    </>
  );
}