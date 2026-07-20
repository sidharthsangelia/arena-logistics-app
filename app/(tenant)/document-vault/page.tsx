import { Suspense } from "react";

import type { KycDocType } from "@/generated/prisma";
import { getCurrentOrgContext } from "@/actions/book/getOrgs";
import { getKycDocs } from "@/actions/book/kyc";
import { getVaultDocumentsAction } from "@/actions/documentVault/documentValut.action";
import { OrgDocumentsSection } from "@/components/documents/OrgDocumentsSection";
import VaultTableSkeleton from "@/components/documentVault/VaultTableSkeleton";
import VaultTable from "@/components/documentVault/VaultTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const VALID_DOC_TYPES: KycDocType[] = [
  "PAN_CARD",
  "ADHAR_CARD",
  "GST_CERTIFICATE",
  "IEC_CODE",
  "MSME_CERTIFICATE",
  "INCORPORATION_CERT",
  "CANCELLED_CHEQUE",
  "BANK_STATEMENT",
  "TRADE_LICENSE",
  "AUTHORIZED_SIGNATORY",
  "OTHER",
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toDocType(raw: string | undefined): KycDocType | "" {
  if (!raw) return "";
  const upper = raw.toUpperCase() as KycDocType;
  return VALID_DOC_TYPES.includes(upper) ? upper : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams: Promise<{
    q?: string;
    docType?: string;
    page?: string;
  }>;
};

export default async function VaultPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const query = params.q?.trim() ?? "";
  const docType = toDocType(params.docType);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { org } = await getCurrentOrgContext();
  const orgKyc = await getKycDocs({ partyType: "ORG", orgId: org.id });

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Document Vault
        </h1>
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
          <Suspense fallback={<VaultTableSkeleton />}>
            <ClientDocuments query={query} docType={docType} page={page} />
          </Suspense>
        </section>
      )}
    </div>
  );
}

async function ClientDocuments({
  query,
  docType,
  page,
}: {
  query: string;
  docType: KycDocType | "";
  page: number;
}) {
  const { documents, total } = await getVaultDocumentsAction({
    q: query,
    docType,
    page,
  });

  return (
    <VaultTable
      documents={documents}
      page={page}
      total={total}
      pageSize={PAGE_SIZE}
      query={query}
      docType={docType}
    />
  );
}
