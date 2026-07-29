import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Quote } from "@/generated/prisma";
import { formatDate } from "@/lib/utils";

// Maps every possible QuoteStatus to a Badge variant.
// Exhaustive so a new status added to the enum doesn't silently fall through.
const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  DRAFT: "outline",
  SENT: "secondary",
  ACCEPTED: "default",
  EXPIRED: "outline",
  CANCELLED: "destructive",
};

// Prisma returns Decimal objects — toNumber() is safe for display,
// but guard for null/undefined coming from optional fields.
function formatAmount(value: { toNumber(): number } | null | undefined, currency: string) {
  if (value == null) return "—";
  return `${currency} ${value.toNumber().toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function RecentQuotesTable({ quotes }: { quotes: Quote[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent quotes</CardTitle>
        <CardDescription>
          The 5 most recently created quotes for this organisation.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {quotes.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No quotes yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Quote #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="pl-6 font-mono text-xs">
                    {quote.quoteNumber}
                  </TableCell>
                  <TableCell>{quote.vendorName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {quote.productName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(quote.quotedTotal, quote.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_VARIANT[quote.status] ?? "outline"}
                      className="capitalize"
                    >
                      {quote.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-6 text-muted-foreground">
                    {formatDate(quote.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}