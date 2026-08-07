import {
  FileText,
  Image as ImageIcon,
  FileCheck2,
  ExternalLink,
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
} from "lucide-react";
import { KycDocType } from "@/generated/prisma";
import {
  KYC_DOC_CONFIGS,
  KYC_KEY_TO_DOC_TYPE,
  WAIVED_REQUIRED_KYC_KEYS,
} from "@/lib/booking/kyc";

// ---------------------------------------------------------------------------
// KYC documents for a shipment's party, rendered right on the booking detail
// page so ops can view / download them without digging through the vault.
//
// KYC docs are a per-party vault (the shipment's client, or the org when there
// is no client), not per-shipment. We show the newest doc per type, mark which
// are required for this shipment type, and flag any required doc that is not on
// file. Server component — the rows are plain links, no client JS needed.
// ---------------------------------------------------------------------------

export interface KycDocRow {
  id: string;
  docType: KycDocType;
  label: string;
  docNumber: string | null;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  verifiedAt: Date | null;
  expired: boolean;
  uploadedAt: Date;
}

const TYPE_LABEL: Record<string, string> = {
  CSB4: "CSB-IV",
  CSB5: "CSB-V",
  COMMERCIAL: "Commercial",
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DocLink({ doc }: { doc: KycDocRow }) {
  const isImage = doc.mimeType.startsWith("image/");
  const Icon = isImage ? ImageIcon : FileText;
  const expired = doc.expired;

  return (
    <a
      href={doc.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group -mx-2 flex items-center gap-2.5 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/50"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">
            {doc.label}
          </span>
          {doc.verifiedAt ? (
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : null}
          {/* An expired document is a hold waiting to happen, so it keeps its
              colour — as text, which is all the emphasis it needed. */}
          {expired && (
            <span className="shrink-0 text-xs font-medium text-red-600 dark:text-red-400">
              Expired
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {doc.docNumber && (
            <span className="font-mono">{doc.docNumber} · </span>
          )}
          {fmtBytes(doc.fileSize)} · {fmtDate(doc.uploadedAt)}
        </p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
    </a>
  );
}

/** A required document nobody has uploaded. Keeps its tint: this is the row
 *  ops is here to find. */
function MissingRow({ label }: { label: string }) {
  return (
    <div className="-mx-2 flex items-center gap-2.5 rounded-md bg-amber-50/70 px-2 py-2.5 dark:bg-amber-950/20">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {label}
      </p>
      <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-400">
        Not on file
      </span>
    </div>
  );
}

export function KycDocsCard({
  docs,
  shipmentType,
  partyLabel,
  kycWaived = false,
  requiredKeys,
}: {
  docs: KycDocRow[];
  shipmentType: string | null;
  partyLabel: string;
  /**
   * Shipment.kycWaivedAtBooking — this booking cleared KYC on an admin waiver
   * rather than a full document set. Read from the shipment, not from the
   * party's waiver today, so it still reads correctly once that has expired.
   */
  kycWaived?: boolean;
  /**
   * Overrides what this card judges the vault against. Passed by the DOMESTIC
   * booking page, where the export matrix does not apply at all and the answer
   * comes from whether the sender was an individual. Without it a domestic
   * booking has a null shipmentType and every document on file would be listed
   * as an unasked-for extra.
   */
  requiredKeys?: readonly string[];
}) {
  // docs arrive newest-per-type already; index by type for lookups.
  const byType = new Map(docs.map((d) => [d.docType, d]));

  // Under a waiver the booking was only ever asked for Aadhaar, so judging it
  // against the full matrix would light the card up with "missing" documents
  // ops deliberately let through. It still lists what came in.
  const requiredConfigs = requiredKeys
    ? KYC_DOC_CONFIGS.filter((c) => requiredKeys.includes(c.key))
    : kycWaived
      ? KYC_DOC_CONFIGS.filter((c) =>
          (WAIVED_REQUIRED_KYC_KEYS as readonly string[]).includes(c.key),
        )
      : shipmentType
        ? KYC_DOC_CONFIGS.filter((c) =>
            c.requiredFor.includes(
              shipmentType as "CSB4" | "CSB5" | "COMMERCIAL",
            ),
          )
        : [];
  const requiredTypes = new Set(
    requiredConfigs.map((c) => KYC_KEY_TO_DOC_TYPE[c.key]),
  );
  const missing = requiredConfigs.filter(
    (c) => !byType.has(KYC_KEY_TO_DOC_TYPE[c.key]),
  );
  const extras = docs.filter((d) => !requiredTypes.has(d.docType));

  const typeLabel = shipmentType
    ? (TYPE_LABEL[shipmentType] ?? shipmentType)
    : null;
  // Keep the card open only while it needs ops' eyes — a required doc is
  // missing. When the vault is complete it collapses to a one-line reference.
  const needsAttention = missing.length > 0;

  return (
    <section>
      <details open={needsAttention || undefined} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 border-b pb-2.5 [&::-webkit-details-marker]:hidden">
          <h2 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <FileCheck2 className="h-3.5 w-3.5 shrink-0" />
            KYC documents
            <span className="hidden truncate font-normal normal-case tracking-normal sm:inline">
              · {partyLabel}
            </span>
          </h2>
          <span className="ml-auto flex items-center gap-2.5">
            {kycWaived && (
              <span className="text-xs text-muted-foreground">KYC waived</span>
            )}
            {missing.length > 0 ? (
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {missing.length} missing
              </span>
            ) : (
              <span className="text-xs text-muted-foreground group-open:hidden">
                {docs.length} on file
              </span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </span>
        </summary>

        <div className="space-y-5 pt-4">
          {kycWaived && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              An Arena admin waived KYC for this party when the booking was
              placed, so only an Aadhaar card was required. Anything else below
              was supplied voluntarily.
            </p>
          )}

          {/* Required for this shipment type */}
          {requiredConfigs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {kycWaived ? "Required" : `Required for ${typeLabel}`}
              </h3>
              <div className="mt-2 divide-y divide-border/60">
                {requiredConfigs.map((c) => {
                  const doc = byType.get(KYC_KEY_TO_DOC_TYPE[c.key]);
                  return doc ? (
                    <DocLink key={c.key} doc={doc} />
                  ) : (
                    <MissingRow key={c.key} label={c.label} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Anything else on file */}
          {extras.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Also on file
              </h3>
              <div className="mt-2 divide-y divide-border/60">
                {extras.map((doc) => (
                  <DocLink key={doc.id} doc={doc} />
                ))}
              </div>
            </div>
          )}

          {/* Nothing at all */}
          {docs.length === 0 && requiredConfigs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No KYC documents on file for this party.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
