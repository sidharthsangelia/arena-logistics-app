"use client";

import { Download, ExternalLink, FileText } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/invoices/config";
import { formatMoney } from "@/utils/format";
import type { InvoiceRow } from "@/lib/invoices/config";

/**
 * A quick look at the invoice PDF without leaving the page. PDFs render inline
 * in every modern browser via an <iframe>; the buttons cover download and a
 * full-tab open for anything that will not embed.
 */
export function InvoicePreviewDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0 overflow-hidden">
        {invoice && (
          <>
            <DialogHeader className="border-b px-5 py-4">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Invoice {invoice.invoiceNumber}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium text-foreground">
                  {formatMoney(invoice.amount, invoice.currency)}
                </span>
                <span aria-hidden>·</span>
                <span>{invoice.orgName}</span>
                {invoice.shipmentNumber && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{invoice.shipmentNumber}</span>
                  </>
                )}
                <span aria-hidden>·</span>
                <span>{formatFileSize(invoice.fileSize)}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="h-[65vh] w-full bg-muted/30">
              <iframe
                key={invoice.id}
                src={`${invoice.fileUrl}#toolbar=0`}
                title={`Invoice ${invoice.invoiceNumber}`}
                className="h-full w-full"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <Button asChild variant="outline" size="sm">
                <a href={invoice.fileUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open in new tab
                </a>
              </Button>
              <Button asChild size="sm">
                <a href={invoice.fileUrl} download={invoice.fileName}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
