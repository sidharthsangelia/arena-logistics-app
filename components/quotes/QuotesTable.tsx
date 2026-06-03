"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import QuoteStatusBadge from "./QuotesStatusBadge";
import QuoteActions from "./QuoteAction";
import { toast } from "sonner";
import { bulkDeleteQuotesAction } from "@/actions/quotes.action";

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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const allIds = quotes.map((q) => q.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(allIds));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    startTransition(async () => {
      const ids = Array.from(selected);
      const result = await bulkDeleteQuotesAction(ids);
      if (result.success) {
        toast.success(`${ids.length} quote${ids.length !== 1 ? "s" : ""} deleted`);
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

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

      {/* Filters + bulk action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {someSelected ? (
          <>
            <span className="text-sm text-muted-foreground">
              {selected.size} selected
            </span>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  className="h-8"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete {selected.size}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selected.size} quote{selected.size !== 1 ? "s" : ""}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the selected quote{selected.size !== 1 ? "s" : ""}. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleBulkDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
          </>
        ) : (
          <>
            <Input
              placeholder="Search by quote, client, vendor…"
              defaultValue={query}
              className="h-8 w-[220px] text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  updateParams({
                    q: (e.target as HTMLInputElement).value || undefined,
                  });
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
          </>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {total.toLocaleString()} quote{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-10 pl-4">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
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
                  colSpan={10}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  No quotes match your filters.
                </TableCell>
              </TableRow>
            ) : (
              quotes.map((quote) => (
                <TableRow
                  key={quote.id}
                  data-state={selected.has(quote.id) ? "selected" : undefined}
                >
                  <TableCell className="pl-4">
                    <Checkbox
                      checked={selected.has(quote.id)}
                      onCheckedChange={() => toggleOne(quote.id)}
                      aria-label={`Select ${quote.quoteNumber}`}
                    />
                  </TableCell>

                  <TableCell>
                    <Link  href={quote.pdfUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium hover:underline ">
                     <span className="block text-sm font-medium leading-tight">
                      {quote.quoteNumber}
                    </span>
                    </Link>
                   
                  </TableCell>

                  <TableCell>
                    <QuoteStatusBadge status={quote.status} />
                  </TableCell>

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

                  <TableCell className="truncate text-sm text-muted-foreground">
                    {quote.vendorName}
                  </TableCell>

                  <TableCell className="max-w-[130px] truncate text-sm">
                    {quote.productName}
                  </TableCell>

                  <TableCell className="text-right text-sm tabular-nums">
                    {fmt(quote.quotedTotal, quote.currency)}
                  </TableCell>

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

                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(quote.createdAt)}
                  </TableCell>

                  <TableCell data-stop-propagation>
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