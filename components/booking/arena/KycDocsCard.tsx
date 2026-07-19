import {
  FileText,
  Image as ImageIcon,
  FileCheck2,
  ExternalLink,
  AlertTriangle,
  BadgeCheck,
} from "lucide-react";
import { KycDocType } from "@/generated/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KYC_DOC_CONFIGS, KYC_KEY_TO_DOC_TYPE } from "@/lib/booking/kyc";
import { cn } from "@/lib/utils";

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

function DocLink({
  doc,
  required,
}: {
  doc: KycDocRow;
  required: boolean;
}) {
  const isImage = doc.mimeType.startsWith("image/");
  const Icon = isImage ? ImageIcon : FileText;
  const expired = doc.expired;

  return (
    <a
      href={doc.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/40"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">
            {doc.label}
          </p>
          {required && (
            <Badge variant="secondary" className="text-[10px] font-normal">
              Required
            </Badge>
          )}
          {doc.verifiedAt ? (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
              <BadgeCheck className="h-3 w-3" />
              Verified
            </span>
          ) : (
            <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-medium text-muted-foreground">
              Unverified
            </span>
          )}
          {expired && (
            <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-px text-[10px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
              Expired
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {doc.docNumber && (
            <span className="font-mono text-foreground/70">
              {doc.docNumber}
            </span>
          )}
          {doc.docNumber && " · "}
          {doc.fileName} · {fmtBytes(doc.fileSize)} · Uploaded{" "}
          {fmtDate(doc.uploadedAt)}
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
        View
        <ExternalLink className="h-3.5 w-3.5" />
      </span>
    </a>
  );
}

function MissingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/20">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-background dark:border-amber-900">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Required but not uploaded to the vault.
        </p>
      </div>
      <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
        Required
      </Badge>
    </div>
  );
}

export function KycDocsCard({
  docs,
  shipmentType,
  partyLabel,
}: {
  docs: KycDocRow[];
  shipmentType: string | null;
  partyLabel: string;
}) {
  // docs arrive newest-per-type already; index by type for lookups.
  const byType = new Map(docs.map((d) => [d.docType, d]));

  const requiredConfigs = shipmentType
    ? KYC_DOC_CONFIGS.filter((c) =>
        c.requiredFor.includes(shipmentType as "CSB4" | "CSB5" | "COMMERCIAL"),
      )
    : [];
  const requiredTypes = new Set(
    requiredConfigs.map((c) => KYC_KEY_TO_DOC_TYPE[c.key]),
  );
  const missing = requiredConfigs.filter(
    (c) => !byType.has(KYC_KEY_TO_DOC_TYPE[c.key]),
  );
  const extras = docs.filter((d) => !requiredTypes.has(d.docType));

  const typeLabel = shipmentType ? (TYPE_LABEL[shipmentType] ?? shipmentType) : null;

  return (
    <Card>
      <CardHeader className="border-b py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">KYC documents</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {missing.length > 0 && (
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-100 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
              >
                {missing.length} required missing
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {docs.length} on file
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <p className="text-xs text-muted-foreground">
          From the vault of{" "}
          <span className="font-medium text-foreground">{partyLabel}</span>.
        </p>

        {/* Required for this shipment type */}
        {requiredConfigs.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Required for {typeLabel}
            </p>
            <div className="space-y-2">
              {requiredConfigs.map((c) => {
                const doc = byType.get(KYC_KEY_TO_DOC_TYPE[c.key]);
                return doc ? (
                  <DocLink key={c.key} doc={doc} required />
                ) : (
                  <MissingRow key={c.key} label={c.label} />
                );
              })}
            </div>
          </div>
        )}

        {/* Anything else on file */}
        {extras.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Also on file
            </p>
            <div className="space-y-2">
              {extras.map((doc) => (
                <DocLink key={doc.id} doc={doc} required={false} />
              ))}
            </div>
          </div>
        )}

        {/* Nothing at all */}
        {docs.length === 0 && requiredConfigs.length === 0 && (
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-8 text-center",
            )}
          >
            <FileCheck2 className="h-6 w-6 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No KYC documents on file for this party.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
