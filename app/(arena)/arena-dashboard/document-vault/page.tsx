import { getAllVaultDocumentsAction } from "@/actions/documentVault/documentVaultAdmin.action";
import AdminVaultTable from "@/components/documentVault/AdminVaultTable";
import type { KycDocType } from "@/generated/prisma";
 

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

export default async function ArenaDocumentVaultPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const query = params.q?.trim() ?? "";
  const docType = toDocType(params.docType);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { documents, total } = await getAllVaultDocumentsAction({
    q: query,
    docType,
    page,
  });

  return (
    <div className="space-y-6">
      {/* <div>
        <h1 className="text-2xl font-semibold tracking-tight">Document Vault</h1>
        <p className="text-sm text-muted-foreground">
          KYC and compliance documents across every business associate.
        </p>
      </div> */}

      <AdminVaultTable
        documents={documents}
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        query={query}
        docType={docType}
      />
    </div>
  );
}