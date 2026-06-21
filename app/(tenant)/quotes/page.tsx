/**
 * src/app/quotes/page.tsx
 *
 * Server component. Reads searchParams, fetches quotes, renders the page.
 * Follows the exact same pattern as ClientsPage.
 */

import { Suspense } from "react";

import type { QuoteStatus } from "@/generated/prisma";
import { getQuotesAction } from "@/actions/quote/quotesList.action";
import QuotesToolbar from "@/components/quotes/QuotesToolbar";
import QuotesTableSkeleton from "@/components/quotes/QuotesTableSkeleton";
import QuotesTable from "@/components/quotes/QuotesTable";

type PageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
  }>;
};

const VALID_STATUSES: QuoteStatus[] = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "EXPIRED",
  "CANCELLED",
];

function toStatus(raw: string | undefined): QuoteStatus | "" {
  if (!raw) return "";
  const upper = raw.toUpperCase() as QuoteStatus;
  return VALID_STATUSES.includes(upper) ? upper : "";
}

export default async function QuotesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const query = params.q?.trim() ?? "";
  const status = toStatus(params.status);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { quotes, total } = await getQuotesAction({ q: query, status, page });

  const PAGE_SIZE = 25;

  return (
    <>
      <QuotesTable
        quotes={quotes}
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        query={query}
        status={status}
      />
    </>
  );
}
