"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2, Mail, MailOpen, MousePointerClick, MailX, AlertTriangle, Send } from "lucide-react";
import { useState, useTransition } from "react";

import type { QuoteStatus, EmailEvent } from "@/generated/prisma";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import QuoteStatusBadge from "./QuotesStatusBadge";
import QuoteActionsMenu from "./QuoteActionsMenu";
import { toast } from "sonner";
import { bulkDeleteQuotesAction } from "@/actions/quotes.action";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  quotes:   QuoteRow[];
  page:     number;
  total:    number;
  pageSize: number;
  query:    string;
  status:   QuoteStatus | "";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: "all",       label: "All statuses" },
  { value: "DRAFT",     label: "Draft"        },
  { value: "SENT",      label: "Sent"         },
  { value: "ACCEPTED",  label: "Accepted"     },
  { value: "EXPIRED",   label: "Expired"      },
  { value: "CANCELLED", label: "Cancelled"    },
] as const;

// Config for each email event badge: icon, label, colours
const EMAIL_EVENT_CONFIG: Record<
  EmailEvent,
  { icon: React.ElementType; label: string; className: string; tooltip: string }
> = {
  SENT: {
    icon:      Send,
    label:     "Sent",
    className: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    tooltip:   "Email delivered to server",
  },
  DELIVERED: {
    icon:      Mail,
    label:     "Delivered",
    className: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    tooltip:   "Email delivered to inbox",
  },
  OPENED: {
    icon:      MailOpen,
    label:     "Opened",
    className: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    tooltip:   "Client opened the email",
  },
  CLICKED: {
    icon:      MousePointerClick,
    label:     "Clicked",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    tooltip:   "Client clicked the PDF link",
  },
  BOUNCED: {
    icon:      MailX,
    label:     "Bounced",
    className: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    tooltip:   "Email bounced — check the address",
  },
  COMPLAINED: {
    icon:      AlertTriangle,
    label:     "Complained",
    className: "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    tooltip:   "Client marked email as spam",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style:              "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-IN", {
    day:   "2-digit",
    month: "short",
    year:  "2-digit",
  });
}

// ---------------------------------------------------------------------------
// EmailEventBadge
// ---------------------------------------------------------------------------

function EmailEventBadge({ event }: { event: EmailEvent | null }) {
  if (!event) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        No Event Yet
      </span>
    );
  }

  const config = EMAIL_EVENT_CONFIG[event];
  const Icon   = config.icon;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex cursor-default items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.className}`}
          >
            <Icon className="h-3 w-3" />
            {config.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// QuotesTable
// ---------------------------------------------------------------------------

export default function QuotesTable({
  quotes,
  page,
  total,
  pageSize,
  query,
  status,
}: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const totalPages   = Math.max(1, Math.ceil(total / pageSize));

  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const allIds      = quotes.map((q) => q.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(allIds));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleBulkDelete = () => {
    startTransition(async () => {
      const ids    = Array.from(selected);
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

      {/* ── Filters / bulk action bar ──────────────────────────────────── */}
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
                  <AlertDialogTitle>
                    Delete {selected.size} quote{selected.size !== 1 ? "s" : ""}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the selected quote
                    {selected.size !== 1 ? "s" : ""}. This action cannot be undone.
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

      {/* ── Table ─────────────────────────────────────────────────────── */}
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
              <TableHead className="text-xs uppercase tracking-wide">Email</TableHead>
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
                  colSpan={11}
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
                  {/* Checkbox */}
                  <TableCell className="pl-4">
                    <Checkbox
                      checked={selected.has(quote.id)}
                      onCheckedChange={() => toggleOne(quote.id)}
                      aria-label={`Select ${quote.quoteNumber}`}
                    />
                  </TableCell>

                  {/* Quote number + PDF link */}
                  <TableCell>
                    {quote.pdfUrl ? (
                      <Link
                        href={quote.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                      >
                        {quote.quoteNumber}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                        {quote.quoteNumber}
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                          No PDF
                        </span>
                      </span>
                    )}
                  </TableCell>

                  {/* Quote status */}
                  <TableCell>
                    <QuoteStatusBadge status={quote.status} />
                  </TableCell>

                  {/* Email event status — the new column */}
                  <TableCell>
                    <EmailEventBadge event={quote.lastEmailEvent} />
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
                    <span className="block text-sm">{fmtDate(quote.validUntil)}</span>
                    {quote.isExpired && (
                      <span className="text-[10px] text-destructive">Expired</span>
                    )}
                  </TableCell>

                  {/* Created */}
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(quote.createdAt)}
                  </TableCell>

                  {/* Actions menu */}
                  <TableCell>
                    <QuoteActionsMenu
                      quote={{
                        ...quote,
                        validUntil: quote.validUntil ? new Date(quote.validUntil) : null,
                      }}
                      client={{
                        companyName: quote.client?.companyName ?? "",
                        contactName: quote.client?.contactName ?? null,
                        email:       null,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────── */}
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