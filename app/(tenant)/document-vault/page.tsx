/**
 * app/(tenant)/document-vault/page.tsx
 *
 * Two sections, deliberately fetched differently — and each streamed in on its
 * own, so the page shell (title, card chrome, section headings) paints
 * immediately instead of waiting on the slowest of them.
 *
 * "My documents" is the org's own KYC: a short, fixed list with no filtering.
 * Its data comes from getCachedOrgKycDocs, a 10-minute cache that's revalidated
 * the instant a new doc is saved, so this is a cheap read almost every time.
 *
 * "Client documents" is the long, filterable list, and only Business
 * Associates have one. That table fetches nothing here: paging, sorting,
 * search and the doc-type filter live in the URL but are driven client-side
 * through the History API, so filtering refetches through react-query instead
 * of re-rendering this route on every keystroke.
 *
 * Every org-dependent piece below is its own async component in its own
 * Suspense boundary. They all call getCurrentOrgContext(), but that's cheap:
 * it's wrapped in React's cache(), so the auth() + org lookup happens once per
 * request no matter how many boundaries ask for it.
 */

import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import * as Sentry from "@sentry/nextjs";

import { getCurrentOrgContext } from "@/actions/book/getOrgs";
import { getCachedOrgKycDocs } from "@/actions/book/kyc";
import { OrgDocumentsSection } from "@/components/documents/OrgDocumentsSection";
import VaultTable from "@/components/documentVault/VaultTable";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";
import { getTenantVaultPage } from "@/lib/documentVault/tenantQueries";
import {
  DEFAULT_VAULT_PAGE_SIZE,
  VAULT_PAGE_SIZE_OPTIONS,
  coerceVaultDocTypeFilter,
  coerceVaultSortField,
  type VaultListParams,
  type VaultPage,
} from "@/lib/documentVault/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Document Vault",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function readString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/**
 * The URL, read exactly as useVaultQuery reads it, through the same coercion
 * helpers. That agreement is what lets the client hook recognise the prefetch
 * below as the answer to its own question and skip fetching entirely.
 */
function parseVaultParams(sp: RawSearchParams): VaultListParams {
  const pageRaw = Number(readString(sp.page));
  const pageSizeRaw = Number(readString(sp.pageSize));
  const search = readString(sp.q).trim();

  return {
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
    pageSize: (VAULT_PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSizeRaw)
      ? pageSizeRaw
      : DEFAULT_VAULT_PAGE_SIZE,
    sortField: coerceVaultSortField(readString(sp.sort)),
    sortDir: readString(sp.dir) === "asc" ? "asc" : "desc",
    docType: coerceVaultDocTypeFilter(readString(sp.docType)),
    search: search || undefined,
  };
}

export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const vaultParams = parseVaultParams(await searchParams);

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Document Vault</h1>
        <Suspense fallback={<Skeleton className="mt-2 h-4 w-80" />}>
          <VaultSubtitle />
        </Suspense>
      </div>

      {/* ── The org's own documents (everyone) ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My documents</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<OrgDocumentsSkeleton />}>
            <MyDocuments />
          </Suspense>
        </CardContent>
      </Card>

      {/* ── Client documents (Business Associates only) ── */}
      <Suspense fallback={null}>
        <ClientDocumentsSection params={vaultParams} />
      </Suspense>
    </div>
  );
}

async function VaultSubtitle() {
  const { org } = await getCurrentOrgContext();
  return (
    <p className="mt-1 text-sm text-muted-foreground">
      {org.isBusinessAssociate
        ? "Your organisation's documents and every client's KYC, all in one place."
        : "Your identity and export documents, saved once and reused on every booking."}
    </p>
  );
}

async function MyDocuments() {
  const { org } = await getCurrentOrgContext();
  const docs = await getCachedOrgKycDocs(org.id);
  return <OrgDocumentsSection orgId={org.id} initialDocs={docs} />;
}

async function ClientDocumentsSection({ params }: { params: VaultListParams }) {
  const { org } = await getCurrentOrgContext();
  if (!org.isBusinessAssociate) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Client documents
        </h2>
        <p className="text-sm text-muted-foreground">
          KYC uploaded for the clients you book on behalf of.
        </p>
      </div>

      {/* The table used to fetch nothing on the server: the browser got a
          skeleton, hydrated, and only then asked for rows. Its first page is
          rendered here instead, so on a plain visit the table paints with real
          rows and issues no request at all. Everything after that still runs
          client-side against /api/document-vault/tenant. */}
      <Suspense
        key={JSON.stringify(params)}
        fallback={
          <DataTableSkeleton columns={8} rows={params.pageSize} withToolbar />
        }
      >
        <ClientDocumentsTable orgId={org.id} params={params} />
      </Suspense>
    </section>
  );
}

/**
 * The prefetch is an optimisation, not a dependency — see the Arena vault route
 * for the full reasoning. A failure here degrades to the behaviour this screen
 * had before it prefetched anything: the table mounts unseeded, fetches for
 * itself, and shows its own retry. Sentry still hears about it.
 */
async function ClientDocumentsTable({
  orgId,
  params,
}: {
  orgId: string;
  params: VaultListParams;
}) {
  // Only the await is guarded; the JSX is built after. React renders it later,
  // so a render-time error would not be caught here regardless.
  let firstPage: VaultPage | null = null;

  try {
    firstPage = await getTenantVaultPage(orgId, params);
  } catch (error) {
    unstable_rethrow(error);
    Sentry.captureException(error, {
      tags: { location: "TenantDocumentVaultPage.prefetch" },
      extra: { orgId, params },
    });
  }

  return firstPage ? (
    <VaultTable initialData={firstPage} initialParams={params} />
  ) : (
    <VaultTable />
  );
}

/** Mirrors OrgDocumentsSection's shape: two baseline doc cards + the
 *  collapsed commercial-docs trigger bar underneath. */
function OrgDocumentsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
      <Skeleton className="h-14 rounded-lg" />
    </div>
  );
}
