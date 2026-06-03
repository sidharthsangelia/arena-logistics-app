import { Suspense } from "react";

import type { KycDocType } from "@/generated/prisma";
import { getVaultDocumentsAction } from "@/actions/documentValut.action";
import VaultToolbar from "@/components/documentVault/VaultToolbar";
import VaultTableSkeleton from "@/components/documentVault/VaultTableSkeleton";
import VaultTable from "@/components/documentVault/VaultTable";

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
    q?:       string;
    docType?: string;
    page?:    string;
  }>;
};

export default async function VaultPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const query   = params.q?.trim() ?? "";
  const docType = toDocType(params.docType);
  const page    = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { documents, total } = await getVaultDocumentsAction({
    q: query,
    docType,
    page,
  });

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <Suspense>
        <VaultToolbar />
      </Suspense>

      <Suspense fallback={<VaultTableSkeleton />}>
        <VaultTable
          documents={documents}
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          query={query}
          docType={docType}
        />
      </Suspense>
    </div>
  );
}