/**
 * app/(arena)/arena-dashboard/document-vault/page.tsx
 *
 * Company-side view of every business associate's KYC and compliance paperwork.
 * Unlike /document-vault (tenant-scoped) this intentionally spans every org.
 *
 * ── WHY THE ROUTE FETCHES AT ALL ────────────────────────────────────────────
 * It used to fetch nothing. The table was entirely client-driven: the browser
 * received HTML with a skeleton in it, downloaded and ran the JavaScript,
 * mounted the table, and only then asked the server for rows. Three sequential
 * waits — response, hydration, fetch — before the first document appeared, for a
 * table that holds a handful of rows and one round trip of actual work. That is
 * why this screen felt slow while the query behind it took 159ms.
 *
 * So the first page is rendered here and handed to react-query as its initial
 * data. On a plain visit the table paints with real rows and issues no request
 * at all. Paging, sorting, searching and filtering still happen client-side
 * through the History API and the GET at /api/document-vault/admin, so none of
 * them re-render this route.
 *
 * The prefetch reads the same search params the client hook does, so a shared
 * link carrying a filter is prefetched as that filter rather than being fetched
 * twice — once wrongly here and once correctly in the browser.
 */

import { Suspense } from "react";
import { redirect } from "next/navigation";

import AdminVaultTable from "@/components/documentVault/AdminVaultTable";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";
import { getAdminVaultPage } from "@/lib/documentVault/adminQueries";
import { getArenaAuth } from "@/utils/arena-auth";
import {
  DEFAULT_VAULT_PAGE_SIZE,
  VAULT_PAGE_SIZE_OPTIONS,
  coerceAdminVaultSortField,
  coerceVaultDocTypeFilter,
  type AdminVaultListParams,
} from "@/lib/documentVault/config";

export const metadata = {
  title: "Document Vault",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function readString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/**
 * The URL, read exactly as useAdminVaultQuery reads it. Both sides coerce
 * through the same helpers in lib/documentVault/config, which is what lets the
 * hook recognise this prefetch as the answer to its own question.
 */
function parseVaultParams(sp: RawSearchParams): AdminVaultListParams {
  const pageRaw = Number(readString(sp.page));
  const pageSizeRaw = Number(readString(sp.pageSize));
  const search = readString(sp.q).trim();

  return {
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
    pageSize: (VAULT_PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSizeRaw)
      ? pageSizeRaw
      : DEFAULT_VAULT_PAGE_SIZE,
    sortField: coerceAdminVaultSortField(readString(sp.sort)),
    sortDir: readString(sp.dir) === "asc" ? "asc" : "desc",
    docType: coerceVaultDocTypeFilter(readString(sp.docType)),
    search: search || undefined,
  };
}

export default async function ArenaDocumentVaultPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  // This query spans every tenant's KYC paperwork, so the route has to establish
  // for itself that the caller is Arena staff. The check is not redundant with
  // the one in the group layout: Next.js renders a layout and its page
  // concurrently, so the layout's redirect stops the response but does not stop
  // this component from having run. Nor is it redundant with proxy.ts, which the
  // Next.js docs are explicit is an optimistic check rather than authorisation.
  // Costs no round trip — Clerk has already resolved the session for the request.
  const { isArenaMember } = await getArenaAuth();
  if (!isArenaMember) redirect("/dashboard");

  const params = parseVaultParams(await searchParams);

  return (
    // The boundary is what useSearchParams needs inside the table, and it
    // doubles as the first paint while the prefetch below is in flight.
    <Suspense
      key={JSON.stringify(params)}
      fallback={
        <DataTableSkeleton columns={7} rows={params.pageSize} withToolbar />
      }
    >
      <VaultSection params={params} />
    </Suspense>
  );
}

async function VaultSection({ params }: { params: AdminVaultListParams }) {
  const firstPage = await getAdminVaultPage(params);
  return <AdminVaultTable initialData={firstPage} initialParams={params} />;
}
