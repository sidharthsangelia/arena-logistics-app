import { Download, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/utils/format";
import type { TaxInvoiceRow } from "@/lib/invoices/tax/queries";

/**
 * The org's own tax invoices, one per booking.
 *
 * Read only, and there is nothing to filter or paginate: the list is short and
 * ordered newest first. The table from the admin invoice feature is not reused
 * here because that one carries a toolbar, status filters, summary cards and a
 * preview dialog, none of which this list has any use for.
 *
 * Server component. There is no interactivity beyond a download link, so there
 * is no reason to ship this to the browser at all.
 */
export function TaxInvoicesTable({ rows }: { rows: TaxInvoiceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-12 text-center">
        <FileText
          className="mx-auto h-8 w-8 text-muted-foreground"
          aria-hidden
        />
        <p className="mt-3 text-sm font-medium">No invoices yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Every shipment you book gets a tax invoice here, usually within a
          minute of booking.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Shipment</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="w-[1%]" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => (
            <TaxInvoiceTableRow key={row.id} row={row} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TaxInvoiceTableRow({ row }: { row: TaxInvoiceRow }) {
  const ready = row.generationStatus === "READY" && !!row.fileUrl;

  return (
    <TableRow>
      <TableCell className="font-medium tabular-nums">
        {row.invoiceNumber ?? (
          <span className="text-muted-foreground">Preparing</span>
        )}
      </TableCell>

      <TableCell className="tabular-nums text-muted-foreground">
        {row.shipmentNumber}
      </TableCell>

      <TableCell className="text-muted-foreground">
        {formatDate(row.issueDate)}
      </TableCell>

      <TableCell className="text-right tabular-nums">
        <div className="font-medium">
          {formatMoney(row.total, row.currency)}
        </div>
        {row.status === "UNPAID" && (
          // Colour used as a functional cue only: this one row differs from the
          // rest in a way that costs the customer money to ignore.
          <Badge variant="outline" className="mt-1 border-destructive/40 text-destructive">
            Unpaid
          </Badge>
        )}
      </TableCell>

      <TableCell>
        {ready ? (
          <Button asChild variant="ghost" size="sm">
            <a
              href={row.fileUrl as string}
              target="_blank"
              rel="noopener noreferrer"
              download={row.fileName ?? undefined}
            >
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              PDF
            </a>
          </Button>
        ) : (
          // A booking whose invoice has not landed yet is the normal state for
          // roughly a minute. Saying so beats an empty cell that reads as a
          // missing document.
          <span className="inline-flex items-center gap-1.5 px-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Preparing
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}
