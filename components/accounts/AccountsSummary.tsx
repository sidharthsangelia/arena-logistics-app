// components/accounts/AccountsSummary.tsx
//
// The counts above the table. Its own Suspense boundary in the page, because a
// groupBy across every organisation has no business delaying the rows people
// came to read.
//
// The breakdown deliberately ignores the type filter, so it reads as "your
// search found 40 accounts, 12 of them associates" rather than restating the
// filter you just set. See getAccountsSummary.

import type { AccountsSummary as AccountsSummaryData } from "@/queries/accounts";
import type { AccountFilters } from "@/lib/accounts/filters";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-sm font-medium tabular-nums">
        {value.toLocaleString("en-IN")}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export default function AccountsSummary({
  summary,
  filters,
}: {
  summary: AccountsSummaryData;
  filters: AccountFilters;
}) {
  const matching = filters.query.length > 0 || filters.health !== "all";

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <Stat
        value={summary.total}
        label={matching ? "matching accounts" : "accounts"}
      />
      <Stat value={summary.businessAssociates} label="business associates" />
      <Stat value={summary.standard} label="standard" />
    </div>
  );
}
