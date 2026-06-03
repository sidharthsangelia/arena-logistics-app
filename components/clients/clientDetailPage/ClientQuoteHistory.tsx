import Link from "next/link";
import type { QuoteStatus } from "@/generated/prisma";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

type QuoteRow = {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  vendorName: string;
  productName: string;
  currency: string;
  quotedTotal: any; // Decimal from Prisma
  pdfUrl: string | null;
  createdAt: Date;
  validUntil: Date;
};

const STATUS_VARIANT: Record<QuoteStatus, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline",
  SENT: "secondary",
  ACCEPTED: "default",
  EXPIRED: "destructive",
  CANCELLED: "outline",
};

const STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(d);
}

export default function ClientQuoteHistory({ quotes }: { quotes: QuoteRow[] }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Quote history
        </p>
        <span className="text-xs text-muted-foreground">
          {quotes.length} quote{quotes.length !== 1 ? "s" : ""}
        </span>
      </div>

      {quotes.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No quotes for this client yet.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wide">Quote</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Vendor</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Product</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Total</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map((q) => (
              <TableRow key={q.id}>
                <TableCell>
                  {q.pdfUrl ? (
                    <Link href={q.pdfUrl} target="_blank" className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
                      <span className="block text-sm font-medium">
                        {q.quoteNumber}
                      </span>
                    </Link>
                  ) : (
                    <span className="block text-sm font-medium text-muted-foreground">
                      {q.quoteNumber}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[q.status]} className="text-[11px]">
                    {STATUS_LABEL[q.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {q.vendorName}
                </TableCell>
                <TableCell className="max-w-[120px] truncate text-sm">
                  {q.productName}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {fmt(Number(q.quotedTotal), q.currency)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {fmtDate(q.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}