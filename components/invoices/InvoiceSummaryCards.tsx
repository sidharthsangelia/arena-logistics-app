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
 *
 * A tile is mostly not data. Its label, its icon and (for two of them) its
 * caption are fixed by which tile it is, so all of that paints on the first
 * frame whether or not the figures have arrived; only the number itself, and
 * the caption that counts something, stand in as skeletons. The placeholders
 * are sized to the line box of the text that replaces them — h-8 for the
 * text-2xl figure, h-4 for the text-xs caption — so the tile does not resize
 * when the summary lands.
 */

interface Tile {
  label: string;
  icon: React.ElementType;
  accent: string;
  /** The figure. Absent until the summary arrives. */
  value: (s: InvoiceSummary) => string;
  /** Width of the figure's placeholder, close to the figure it stands in for. */
  valueWidth: string;
  /** Caption. A string here is fixed and never waits on data. */
  sub: string | ((s: InvoiceSummary) => string);
  subWidth: string;
  emphasise?: (s: InvoiceSummary) => boolean;
}

const TILES: Tile[] = [
  {
    label: "Outstanding",
    icon: Wallet,
    accent: "text-amber-600 dark:text-amber-400",
    value: (s) => formatMoney(s.outstandingAmount, s.currency),
    valueWidth: "w-28",
    sub: (s) =>
      `${s.outstandingCount} unpaid ${s.outstandingCount === 1 ? "invoice" : "invoices"}`,
    subWidth: "w-28",
  },
  {
    label: "Overdue",
    icon: AlertTriangle,
    accent: "text-red-600 dark:text-red-400",
    value: (s) => String(s.overdueCount),
    valueWidth: "w-10",
    sub: (s) => (s.overdueCount ? "Past their due date" : "Nothing past due"),
    subWidth: "w-32",
    emphasise: (s) => s.overdueCount > 0,
  },
  {
    label: "Paid",
    icon: CheckCircle2,
    accent: "text-emerald-600 dark:text-emerald-400",
    value: (s) => formatMoney(s.paidAmount, s.currency),
    valueWidth: "w-28",
    sub: (s) => `${s.paidCount} settled`,
    subWidth: "w-20",
  },
  {
    label: "Total invoices",
    icon: FileText,
    accent: "text-muted-foreground",
    value: (s) => String(s.total),
    valueWidth: "w-12",
    sub: "All time",
    subWidth: "w-16",
  },
];

export function InvoiceSummaryCards({
  summary,
  isLoading,
}: {
  summary: InvoiceSummary | undefined;
  isLoading: boolean;
}) {
  // Nothing to show and nothing on its way: the caller has no scope selected.
  if (!summary && !isLoading) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {TILES.map((t) => {
        const Icon = t.icon;
        const staticSub = typeof t.sub === "string" ? t.sub : null;

        return (
          <Card
            key={t.label}
            className={cn(
              "transition-colors",
              summary &&
                t.emphasise?.(summary) &&
                "border-red-200 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20",
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.label}
                </span>
                <Icon className={cn("h-4 w-4", t.accent)} aria-hidden />
              </div>

              {summary ? (
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                  {t.value(summary)}
                </p>
              ) : (
                <Skeleton className={cn("mt-2 h-8", t.valueWidth)} />
              )}

              {summary || staticSub ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {staticSub ?? (t.sub as (s: InvoiceSummary) => string)(summary!)}
                </p>
              ) : (
                <Skeleton className={cn("mt-0.5 h-4", t.subWidth)} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** The same tiles with no figures behind them, for route-level fallbacks. */
export function InvoiceSummaryCardsSkeleton() {
  return <InvoiceSummaryCards summary={undefined} isLoading />;
}
