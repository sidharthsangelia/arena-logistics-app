/**
 * app/(arena)/arena-dashboard/quotes/page.tsx
 *
 * Company-side view of everything Arena has priced: the shipment quotes raised
 * by every tenant org, and the rate-card workbooks Arena staff have generated
 * off the international rate sweep.
 *
 * Unlike /quotes (tenant-scoped, see app/(tenant)/quotes/page.tsx), this
 * intentionally shows quotes regardless of which org generated them, so ops can
 * search the whole platform from one place. The rate cards are not org-scoped at
 * all — they are Arena's own documents.
 *
 * The page fetches no rows. Tab, paging, sorting, search and filters all live in
 * the URL but are driven client-side through the History API, so the tables
 * refetch through react-query instead of re-rendering this route on every
 * keystroke. The Suspense boundary is what useSearchParams needs, and it doubles
 * as the first paint.
 *
 * The one thing it does resolve is the caller's role. Shipment quotes are open
 * to every Arena member; rate cards state our markup and are built from our
 * buying price, so that tab is admin only. This decides whether the tab renders
 * at all — the action behind it re-checks, because hiding a tab is presentation,
 * not authorisation.
 */

import { Suspense } from "react";

import QuotesTabs from "@/components/quotes/QuotesTabs";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";
import { getArenaAuth } from "@/utils/arena-auth";

export const metadata = {
  title: "Quotes",
};

export default async function ArenaQuotesPage() {
  const { isArenaAdmin } = await getArenaAuth();

  return (
    <Suspense fallback={<DataTableSkeleton columns={10} rows={10} withToolbar />}>
      <QuotesTabs canSeeRateCards={isArenaAdmin} />
    </Suspense>
  );
}
