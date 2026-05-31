"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

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

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

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
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    params.delete("page");

    router.push(`/quotes?${params.toString()}`);
  };

  const changePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);

    if (newPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(newPage));
    }

    router.push(`/quotes?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input
          placeholder="Search quotes..."
          defaultValue={query}
          className="max-w-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateParams({
                q: (e.target as HTMLInputElement).value,
              });
            }
          }}
        />

        <Select
          value={status || "all"}
          onValueChange={(value) =>
            updateParams({
              status: value === "all" ? undefined : value,
            })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            {STATUS_OPTIONS.map((item) => (
              <SelectItem
                key={item.value || "all"}
                value={item.value || "all"}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Validity</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {quotes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-24 text-center text-muted-foreground"
                >
                  No quotes found.
                </TableCell>
              </TableRow>
            ) : (
              quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">
                        {quote.quoteNumber}
                      </div>

                      {quote.pdfUrl && (
                        <Link
                          href={quote.pdfUrl}
                          target="_blank"
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          View PDF
                        </Link>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <QuoteStatusBadge status={quote.status} />
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      <div>
                        {quote.client?.companyName ?? "—"}
                      </div>

                      {quote.client?.contactName && (
                        <div className="text-xs text-muted-foreground">
                          {quote.client.contactName}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>{quote.vendorName}</TableCell>

                  <TableCell>{quote.productName}</TableCell>

                  <TableCell>
                    {quote.currency}{" "}
                    {quote.quotedTotal.toLocaleString()}
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      <div>
                        {new Date(
                          quote.validUntil,
                        ).toLocaleDateString()}
                      </div>

                      {quote.isExpired && (
                        <div className="text-xs text-destructive">
                          Expired
                        </div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    {new Date(
                      quote.createdAt,
                    ).toLocaleDateString()}
                  </TableCell>

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
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString()} quotes
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => changePage(page - 1)}
          >
            Previous
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => changePage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}