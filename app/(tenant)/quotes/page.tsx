/**
 * app/(tenant)/quotes/page.tsx
 *
 * A Business Associate's own quotations. The org scope is enforced twice over:
 * the layout wraps it in BusinessAssociateGate, and the action behind the table
 * resolves the org itself through getDbOrgId() rather than taking it as a param.
 *
 * The page fetches nothing. Paging, sorting, search and the status filter live in
 * the URL but are driven client-side through the History API, so the table
 * refetches through react-query instead of re-rendering this route on every
 * keystroke. The Suspense boundary is what useSearchParams needs, and it doubles
 * as the first paint.
 */

import { Suspense } from "react";

import QuotesTable, { QuotesTableSkeleton } from "@/components/quotes/QuotesTable";

export const metadata = {
  title: "Quotes",
};

export default function QuotesPage() {
  return (
    <Suspense fallback={<QuotesTableSkeleton />}>
      <QuotesTable />
    </Suspense>
  );
}
