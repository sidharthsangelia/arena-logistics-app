import Link from "next/link";
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/utils/format";
import {
  MANUAL_STATUS_TONE,
  formatMoney,
  type ManualInvoiceRow,
} from "@/lib/invoices/manual/config";

/**
 * Every invoice raised to one customer, newest first.
 *
 * Manual invoices only. A booking invoice belongs to an Org and is raised by
 * the platform against a shipment, so it is reported as a count elsewhere on
 * the page and linked to rather than mixed in here: the two are settled by
 * different mechanisms and a single list would imply one ledger.
 *
 * A draft is included and marked as such. It is the only place a draft naming
 * this customer can be found, and an invoice somebody started and forgot is
 * exactly what a customer page should surface.
 */
export function BillingPartyInvoices({ rows }: { rows: ManualInvoiceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border py-10 text-center">
        <FileText className="mx-auto h-7 w-7 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">No invoices yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing has been raised to this customer.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead>Number</TableHead>
            <TableHead>Issued</TableHead>
            <TableHead>Consignment</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const tone = MANUAL_STATUS_TONE[row.view];
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    href={
                      // A draft has no number and no PDF, so its page redirects
                      // to the builder. Linking straight there saves the bounce.
                      row.view === "DRAFT"
                        ? `/arena-dashboard/invoices/manual/${row.id}/edit`
                        : `/arena-dashboard/invoices/manual/${row.id}`
                    }
                    className="font-mono text-xs font-medium tabular-nums hover:underline"
                  >
                    {row.invoiceNumber ?? "Draft"}
                  </Link>
                  {row.docType === "CREDIT_NOTE" ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Credit note
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(row.issueDate)}
                </TableCell>
                <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                  {row.primaryAwb ?? "—"}
                  {row.consignmentCount > 1 ? (
                    <span className="ml-1.5 text-[10px]">
                      and {row.consignmentCount - 1} more
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-[11px] font-medium ${tone.className}`}
                  >
                    {tone.label}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                  {formatMoney(row.total, row.currency)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Placeholder for the history while it is fetched.
 *
 * The section heading above it is the page's own copy and renders immediately;
 * only the rows wait. Same column count and row height as the real table, so
 * nothing on the page moves when they arrive.
 */
export function BillingPartyInvoicesSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            {["Number", "Issued", "Consignment", "Status", "Amount"].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, r) => (
            <TableRow key={r}>
              {Array.from({ length: 5 }).map((_, c) => (
                <TableCell key={c}>
                  <Skeleton
                    className="h-4"
                    style={{ width: `${50 + ((r + c) % 4) * 12}%` }}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
