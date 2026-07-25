import { AlertTriangle, CheckCircle2, FileText, Wallet } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/format";
import type { InvoiceSummary } from "@/lib/invoices/config";

/**
 * The four tiles above an invoice table. They reflect the ORG SCOPE only (the
 * tenant's own org, or the Arena org filter) and deliberately ignore the table's
 * status filter and search box, so they stay a steady overview while the list
 * below is sliced.
 */

interface Tile {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  accent: string;
  emphasise?: boolean;
}

export function InvoiceSummaryCards({
  summary,
  isLoading,
}: {
  summary: InvoiceSummary | undefined;
  isLoading: boolean;
}) {
  if (!summary && isLoading) return <InvoiceSummaryCardsSkeleton />;
  if (!summary) return null;

  const tiles: Tile[] = [
    {
      label: "Outstanding",
      value: formatMoney(summary.outstandingAmount, summary.currency),
      sub: `${summary.outstandingCount} unpaid ${summary.outstandingCount === 1 ? "invoice" : "invoices"}`,
      icon: Wallet,
      accent: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Overdue",
      value: String(summary.overdueCount),
      sub: summary.overdueCount ? "Past their due date" : "Nothing past due",
      icon: AlertTriangle,
      accent: "text-red-600 dark:text-red-400",
      emphasise: summary.overdueCount > 0,
    },
    {
      label: "Paid",
      value: formatMoney(summary.paidAmount, summary.currency),
      sub: `${summary.paidCount} settled`,
      icon: CheckCircle2,
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Total invoices",
      value: String(summary.total),
      sub: "All time",
      icon: FileText,
      accent: "text-muted-foreground",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <Card
          key={t.label}
          className={cn(
            "transition-colors",
            t.emphasise &&
              "border-red-200 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20",
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t.label}
              </span>
              <t.icon className={cn("h-4 w-4", t.accent)} />
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
              {t.value}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function InvoiceSummaryCardsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <Skeleton className="mt-3 h-7 w-24" />
            <Skeleton className="mt-2 h-3 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
