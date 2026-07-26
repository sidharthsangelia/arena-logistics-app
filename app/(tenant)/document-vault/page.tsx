/**
 * app/(tenant)/document-vault/page.tsx
 *
 * Two sections, deliberately fetched differently.
 *
 * "My documents" is the org's own KYC: a short, fixed list with no filtering, so
 * it stays server-rendered and arrives with the page.
 *
 * "Client documents" is the long, filterable list, and only Business Associates
 * have one. That table fetches nothing here: paging, sorting, search and the
 * doc-type filter live in the URL but are driven client-side through the History
 * API, so filtering refetches through react-query instead of re-rendering this
 * route on every keystroke. The Suspense boundary is what useSearchParams needs.
 */

import { Suspense } from "react";

import { getCurrentOrgContext } from "@/actions/book/getOrgs";
import { getKycDocs } from "@/actions/book/kyc";
import { OrgDocumentsSection } from "@/components/documents/OrgDocumentsSection";
import VaultTable from "@/components/documentVault/VaultTable";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Document Vault",
};

export default async function VaultPage() {
  const { org } = await getCurrentOrgContext();
  const orgKyc = await getKycDocs({ partyType: "ORG", orgId: org.id });

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Document Vault</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {org.isBusinessAssociate
            ? "Your organisation's documents and every client's KYC, all in one place."
            : "Your identity and export documents, saved once and reused on every booking."}
        </p>
      </div>

      {/* ── The org's own documents (everyone) ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My documents</CardTitle>
        </CardHeader>
        <CardContent>
          <OrgDocumentsSection
            orgId={org.id}
            initialDocs={orgKyc.success ? orgKyc.docs : []}
          />
        </CardContent>
      </Card>

      {/* ── Client documents (Business Associates only) ── */}
      {org.isBusinessAssociate && (
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
      )}
    </div>
  );
}
