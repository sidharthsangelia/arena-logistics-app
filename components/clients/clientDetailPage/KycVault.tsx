import { ShieldCheck } from "lucide-react";
import KycDocumentCard, {
  type KycDocumentCardProps,
} from "../KycDocumentCard";
import KycUploadButton from "../KycUploadButton";
import { KYC_DOC_TYPE_LABELS, KycDocType } from "@/lib/validations/clientsDocument.schema";
 

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  clientId:  string;
  documents: KycDocumentCardProps[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function KycVault({ clientId, documents }: Props) {
  // Group by docType for a structured view
  const byType = documents.reduce<Record<string, KycDocumentCardProps[]>>(
    (acc, doc) => {
      (acc[doc.docType] ??= []).push(doc);
      return acc;
    },
    {},
  );

  const typeKeys = Object.keys(byType) as KycDocType[];

  return (
    <div className="rounded-lg border">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            KYC Vault
          </p>
          {documents.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {documents.length}
            </span>
          )}
        </div>
        <KycUploadButton clientId={clientId} />
      </div>

      {/* Body */}
      <div className="p-4">
        {documents.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No documents yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Upload KYC documents — PAN, GST, IEC, bank details and more.
              </p>
            </div>
            <KycUploadButton clientId={clientId} />
          </div>
        ) : (
          /* Grouped document list */
          <div className="space-y-5">
            {typeKeys.map((type) => (
              <div key={type}>
                {/* Type group header */}
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {KYC_DOC_TYPE_LABELS[type]}
                  <span className="ml-1.5 font-normal normal-case">
                    ({byType[type].length})
                  </span>
                </p>

                {/* Cards for this type */}
                <div className="space-y-2">
                  {byType[type].map((doc) => (
                    <KycDocumentCard key={doc.id} {...doc} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}