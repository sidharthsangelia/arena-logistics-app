/**
 * src/app/arena-dashboard/quotes/page.tsx
 *
 * Company-side view across every tenant org. Unlike /quotes (tenant-scoped,
 * see src/app/quotes/page.tsx), this intentionally shows quotes regardless
 * of which org generated them, so ops can search the whole platform from
 * one place.
 */

import { getAllQuotesAction } from "@/actions/quote/quotesListAdmin.action";
import AdminQuotesTable from "@/components/quotes/AdminQuotesTable";
import type { QuoteStatus } from "@/generated/prisma";


const PAGE_SIZE = 25;

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

export default async function ArenaQuotesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const query = params.q?.trim() ?? "";
  const status = toStatus(params.status);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { quotes, total } = await getAllQuotesAction({ q: query, status, page });

  return (
    <div className="space-y-6">
   

      <AdminQuotesTable
        quotes={quotes}
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        query={query}
        status={status}
      />
    </div>
  );
}