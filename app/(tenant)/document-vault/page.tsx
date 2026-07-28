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

import { getCurrentOrgContext } from "@/actions/book/getOrgs";
import { getCachedOrgKycDocs } from "@/actions/book/kyc";
import { OrgDocumentsSection } from "@/components/documents/OrgDocumentsSection";
import VaultTable from "@/components/documentVault/VaultTable";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Document Vault",
};

export default function VaultPage() {
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
        <ClientDocumentsSection />
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

async function ClientDocumentsSection() {
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

      <Suspense fallback={<DataTableSkeleton columns={8} rows={8} withToolbar />}>
        <VaultTable />
      </Suspense>
    </section>
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
