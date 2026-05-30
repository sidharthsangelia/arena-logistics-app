"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exportClientsAction } from "@/actions/clientsImportExport.actions";


export default function ExportClientsButton() {
  async function handleExport() {
    const base64 =
      await exportClientsAction();

    const bytes = Uint8Array.from(
      atob(base64),
      (c) => c.charCodeAt(0),
    );

    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = `clients-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;

    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <Button
      variant="outline"
      onClick={handleExport}
    >
      <Download className="mr-2 h-4 w-4" />
      Export
    </Button>
  );
}