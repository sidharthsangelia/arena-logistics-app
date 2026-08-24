import { Building2, FileText, Link2, UserPlus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { BillingPartyListSummary } from "@/lib/invoices/manual/config";

/**
 * The four tiles above the customer list.
 *
 * Counts, not money. What the customers collectively owe is already the
 * headline of the invoices page, and repeating it here would make two screens
 * that have to agree about a figure neither of them owns. These answer the
 * question this page is for instead: how many customers are on file, how many
 * have ever been billed, and how many came from an account rather than a form.
 *
 * "Never invoiced" is the one worth watching. A party with no invoice is either
 * a customer nobody has billed yet or a duplicate created by a mis-spelling in
 * the picker, and both are only findable by asking for them.
 */
export function BillingPartySummaryCards({
  summary,
  isLoading,
}: {
  summary: BillingPartyListSummary | undefined;
  isLoading: boolean;
}) {
  if (!summary && isLoading) return <BillingPartySummaryCardsSkeleton />;
  if (!summary) return null;

  const tiles = [
    {
      label: "Customers",
      value: String(summary.total),
      sub: "On the billing list",
      icon: Building2,
      accent: "text-muted-foreground",
    },
    {
      label: "Invoiced",
      value: String(summary.billed),
      sub: "Have at least one invoice",
      icon: FileText,
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Never invoiced",
      value: String(summary.neverBilled),
      sub: summary.neverBilled
        ? "Not billed yet, or a duplicate"
        : "Everyone has been billed",
      icon: UserPlus,
      accent: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Have an account",
      value: String(summary.linked),
      sub: "Adopted from an org or client",
      icon: Link2,
      accent: "text-muted-foreground",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t.label}
              </span>
              <t.icon className={`h-4 w-4 ${t.accent}`} />
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

export function BillingPartySummaryCardsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
