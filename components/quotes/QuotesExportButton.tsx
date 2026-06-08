// components/quotes/QuotesExportButton.tsx
"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

import { toast } from "sonner";
import { exportQuotesAction } from "@/actions/quote/quoteExport.action";

export function QuotesExportButton() {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const base64 = await exportQuotesAction();

      // Convert base64 → Blob → download
      const bytes   = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob    = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url     = URL.createObjectURL(blob);
      const anchor  = document.createElement("a");
      const today   = new Date().toISOString().slice(0, 10); // "2026-06-08"

      anchor.href     = url;
      anchor.download = `quotes-${today}.xlsx`;
      anchor.click();

      URL.revokeObjectURL(url);
      toast.success("Quotes exported successfully.");
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to export quotes. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5"
      onClick={handleExport}
      disabled={isExporting}
    >
      {isExporting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {isExporting ? "Exporting…" : "Export"}
    </Button>
  );
}