"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";

import type { QuoteStatus } from "@/generated/prisma";
import type { QuoteRow } from "@/actions/quotesList.action";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import QuoteStatusBadge from "./QuotesStatusBadge";
import QuoteActions from "./QuoteAction";

interface Props {
  quotes: QuoteRow[];
  page: number;
  total: number;
  pageSize: number;
  query: string;
  status: QuoteStatus | "";
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export default function QuotesTable({
  quotes,
  page,
  total,
  pageSize,
  query,
  status,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const updateParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) params.delete(key);
      else params.set(key, value);
    });
    params.delete("page");
    router.push(`/quotes?${params.toString()}`);
  };

  const changePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (newPage <= 1) params.delete("page");
    else params.set("page", String(newPage));
    router.push(`/quotes?${params.toString()}`);
  };

  return (
    <div className="space-y-4">

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by quote, client, vendor…"
          defaultValue={query}
          className="h-8 w-[220px] text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateParams({ q: (e.target as HTMLInputElement).value || undefined });
            }
          }}
        />

        <Select
          value={status || "all"}
          onValueChange={(value) =>
            updateParams({ status: value === "all" ? undefined : value })
          }
        >
          <SelectTrigger className="h-8 w-[160px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-xs text-muted-foreground">
          {total.toLocaleString()} quote{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs uppercase tracking-wide">Quote</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Client</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Vendor</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Product</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Total</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Valid until</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {quotes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  No quotes match your filters.
                </TableCell>
              </TableRow>
            ) : (
              quotes.map((quote) => (
                <TableRow key={quote.id}>

                  {/* Quote number + PDF link */}
                  <TableCell>
                    <span className="block text-sm font-medium">
                      {quote.quoteNumber}
                    </span>
                    {quote.pdfUrl && (
                      <Link
                        href={quote.pdfUrl}
                        target="_blank"
                        className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
                      >
                        <FileText className="h-3 w-3" />
                        View PDF
                      </Link>
                    )}
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <QuoteStatusBadge status={quote.status} />
                  </TableCell>

                  {/* Client */}
                  <TableCell>
                    <span className="block truncate text-sm">
                      {quote.client?.companyName ?? "—"}
                    </span>
                    {quote.client?.contactName && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {quote.client.contactName}
                      </span>
                    )}
                  </TableCell>

                  {/* Vendor */}
                  <TableCell className="truncate text-sm text-muted-foreground">
                    {quote.vendorName}
                  </TableCell>

                  {/* Product */}
                  <TableCell className="max-w-[130px] truncate text-sm">
                    {quote.productName}
                  </TableCell>

                  {/* Total */}
                  <TableCell className="text-right text-sm tabular-nums">
                    {fmt(quote.quotedTotal, quote.currency)}
                  </TableCell>

                  {/* Valid until */}
                  <TableCell>
                    <span className="block text-sm">
                      {fmtDate(quote.validUntil)}
                    </span>
                    {quote.isExpired && (
                      <span className="text-[10px] text-destructive">
                        Expired
                      </span>
                    )}
                  </TableCell>

                  {/* Created */}
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(quote.createdAt)}
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <QuoteActions
                      quoteId={quote.id}
                      quoteNumber={quote.quoteNumber}
                      status={quote.status}
                    />
                  </TableCell>

                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => changePage(page - 1)}
          >
            ← Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => changePage(page + 1)}
          >
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}