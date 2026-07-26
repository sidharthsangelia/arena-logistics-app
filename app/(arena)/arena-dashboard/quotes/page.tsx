/**
 * app/(arena)/arena-dashboard/quotes/page.tsx
 *
 * Company-side view across every tenant org. Unlike /quotes (tenant-scoped, see
 * app/(tenant)/quotes/page.tsx), this intentionally shows quotes regardless of
 * which org generated them, so ops can search the whole platform from one place.
 *
 * The page itself fetches nothing. Paging, sorting, search and the status filter
 * all live in the URL but are driven client-side through the History API, so the
 * table refetches through react-query instead of re-rendering this route on every
 * keystroke. The Suspense boundary is what useSearchParams needs, and it doubles
 * as the first paint.
 */

import { Suspense } from "react";

import AdminQuotesTable from "@/components/quotes/AdminQuotesTable";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";

export const metadata = {
  title: "Quotes",
};

export default function ArenaQuotesPage() {
  return (
    <Suspense fallback={<DataTableSkeleton columns={10} rows={10} withToolbar />}>
      <AdminQuotesTable />
    </Suspense>
  );
}
