import KycDocumentCard, {
  type KycDocumentCardProps,
} from "../KycDocumentCard";
import KycUploadButton from "../KycUploadButton";
import { SectionHeading } from "@/components/layout/SectionHeading";
import {
  KYC_DOC_TYPE_LABELS,
  KycDocType,
} from "@/lib/validations/clientsDocument.schema";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  clientId: string;
  documents: KycDocumentCardProps[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
//
// Everything on file for this client, grouped by document type. The group name
// is the only label a row needs, so each row carries the file itself and
// nothing else: no card, no type badge repeating the group it sits under.
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
    <section className="space-y-5">
      <SectionHeading right={<KycUploadButton clientId={clientId} />}>
        KYC vault
      </SectionHeading>

      {documents.length === 0 ? (
        <div className="space-y-1">
          <p className="text-sm text-foreground">No documents yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Upload KYC documents — PAN, GST, IEC, bank details and more.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {typeKeys.map((type) => (
            <div key={type}>
              <h3 className="text-sm font-semibold text-foreground">
                {KYC_DOC_TYPE_LABELS[type]}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {byType[type].length}
                </span>
              </h3>
              <div className="mt-2 divide-y divide-border/60">
                {byType[type].map((doc) => (
                  <KycDocumentCard key={doc.id} {...doc} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
