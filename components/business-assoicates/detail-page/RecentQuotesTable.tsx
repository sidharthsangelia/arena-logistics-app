// components/business-assoicates/RecentQuotesTable.tsx
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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline",
  SENT: "secondary",
  ACCEPTED: "default",
  EXPIRED: "outline",
  CANCELLED: "destructive",
};

export default function RecentQuotesTable({ quotes }: { quotes: Quote[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent quotes</CardTitle>
        <CardDescription>
          The 5 most recently created quotes for this organisation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {quotes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No quotes yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="font-mono text-xs">
                    {quote.quoteNumber}
                  </TableCell>
                  <TableCell>{quote.vendorName}</TableCell>
                  <TableCell className="text-right">
                    {quote.currency} {quote.quotedTotal.toNumber().toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[quote.status] ?? "outline"}>
                      {quote.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
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