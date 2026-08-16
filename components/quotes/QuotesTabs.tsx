"use client";

/**
 * components/quotes/QuotesTabs.tsx
 *
 * Two tables under one route: the shipment quotes every account has raised, and
 * the rate cards Arena has generated.
 *
 * ── WHY TABS AND NOT ONE LIST ───────────────────────────────────────────────
 * A quote is one price for one shipment, with a status a customer can act on.
 * A rate card is a grid across many lanes with no workflow at all. Merged into
 * one table, every row would have half its columns blank and the filters would
 * only ever apply to one kind. Tabs let each keep its own columns, its own
 * search and its own filter, while the salesperson asking "what have we sent
 * this account" still finds both in one place.
 *
 * ── THE TAB LIVES IN THE URL ────────────────────────────────────────────────
 * Both tables already keep their paging and filters in the query string, so a
 * tab kept only in React state would be the one part of the screen a refresh or
 * a shared link silently loses. Written through the History API for the same
 * reason as the filters: switching tabs should not cost a server render.
 *
 * ── THE RATE CARDS TAB IS ADMIN ONLY ────────────────────────────────────────
 * Shipment quotes are every member's work. Rate cards state Arena's markup and
 * are built from its buying price, so they sit behind the same role as wallets
 * and invoices. `canSeeRateCards` comes from the server page; hiding the tab is
 * only the courtesy half, and the action behind the table calls
 * requireArenaAdmin for itself. A member arriving on a shared ?tab=rate-cards
 * link lands on the quotes tab rather than on an error.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";

import AdminQuotesTable from "./AdminQuotesTable";

const RateQuotationsTable = React.lazy(
  () => import("@/components/rate-quotations/RateQuotationsTable"),
);

const TABS = ["quotes", "rate-cards"] as const;
type QuotesTab = (typeof TABS)[number];

function coerceTab(value: string | null): QuotesTab {
  return TABS.includes(value as QuotesTab) ? (value as QuotesTab) : "quotes";
}

export default function QuotesTabs({
  canSeeRateCards,
}: {
  canSeeRateCards: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requested = coerceTab(searchParams.get("tab"));
  const tab = requested === "rate-cards" && !canSeeRateCards ? "quotes" : requested;

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (next === "quotes") params.delete("tab");
    else params.set("tab", next);

    // Each table owns its own paging and filters, and the two do not share a
    // vocabulary — a status filter means nothing to a rate card. Dropping the
    // shared table params on a tab switch stops one tab's leftovers from
    // silently filtering the other into looking empty.
    for (const key of ["page", "pageSize", "sort", "dir", "q", "status", "audience"]) {
      params.delete(key);
    }

    const query = params.toString();
    router.push(query ? `?${query}` : "?", { scroll: false });
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="quotes">Shipment quotes</TabsTrigger>
          {canSeeRateCards ? (
            <TabsTrigger value="rate-cards" className="gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Rate cards
            </TabsTrigger>
          ) : null}
        </TabsList>

        {tab === "rate-cards" ? (
          <Button asChild size="sm">
            <Link href="/arena-dashboard/quotes/new-rate-card">
              <Plus className="h-4 w-4" />
              Build a rate card
            </Link>
          </Button>
        ) : null}
      </div>

      <TabsContent value="quotes" className="mt-0">
        <AdminQuotesTable />
      </TabsContent>

      {canSeeRateCards ? (
        <TabsContent value="rate-cards" className="mt-0">
          <React.Suspense
            fallback={<DataTableSkeleton columns={9} rows={10} withToolbar />}
          >
            <RateQuotationsTable />
          </React.Suspense>
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
