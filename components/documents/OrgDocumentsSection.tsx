"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ShieldCheck, FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { UploadZone } from "@/components/kyc/UploadZone";
import { getKycDocs, type PartyKycDoc } from "@/actions/book/kyc";
import {
  BASELINE_KYC_CONFIGS,
  EXPORT_KYC_CONFIGS,
  requiredForLabel,
  type KycDocConfig,
} from "@/lib/booking/kyc";

/**
 * OrgDocumentsSection — the org's OWN identity + export documents, shared by
 * Profile Settings and the Document Vault so both write to the same KycDocument
 * store (same query key → edits in one surface show in the other).
 *
 * Baseline docs (PAN + Aadhaar) are always visible. The commercial / CSB-V
 * extras (GST, IEC, LUT, Company PAN) live in a collapsed section so a
 * first-time individual shipper isn't confronted with a wall of paperwork.
 */
export function OrgDocumentsSection({
  orgId,
  initialDocs,
  defaultExportOpen = false,
}: {
  orgId: string;
  initialDocs: PartyKycDoc[];
  /** Force the commercial section open (e.g. when the org ships commercially). */
  defaultExportOpen?: boolean;
}) {
  const party = { partyType: "ORG" as const, orgId };
  const qc = useQueryClient();

  const { data: docs = initialDocs } = useQuery({
    queryKey: ["org-kyc-docs", orgId],
    queryFn: async () => {
      const result = await getKycDocs(party);
      return result.success ? result.docs : [];
    },
    initialData: initialDocs,
    staleTime: 30_000,
  });

  const byKey = Object.fromEntries(docs.map((d) => [d.key, d])) as Partial<
    Record<string, PartyKycDoc>
  >;
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["org-kyc-docs", orgId] });

  const exportOnFile = EXPORT_KYC_CONFIGS.filter((c) => byKey[c.key]).length;
  const [exportOpen, setExportOpen] = useState(
    defaultExportOpen || exportOnFile > 0,
  );

  return (
    <div className="space-y-6">
      {/* ── Baseline identity documents ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Identity documents</h3>
          <span className="text-xs text-muted-foreground">
            Reused on every booking
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {BASELINE_KYC_CONFIGS.map((config) => (
            <DocCard
              key={config.key}
              config={config}
              existing={byKey[config.key]}
              party={party}
              onChanged={invalidate}
            />
          ))}
        </div>
      </div>

      {/* ── Commercial / CSB-V export documents (collapsible) ── */}
      <Collapsible
        open={exportOpen}
        onOpenChange={setExportOpen}
        className="rounded-lg border"
      >
        <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Commercial &amp; export documents</p>
            <p className="text-xs text-muted-foreground">
              Only needed for CSB-V or commercial shipments. Add these if you
              export commercially.
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {exportOnFile} of {EXPORT_KYC_CONFIGS.length} added
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              exportOpen && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
            {EXPORT_KYC_CONFIGS.map((config) => (
              <DocCard
                key={config.key}
                config={config}
                existing={byKey[config.key]}
                party={party}
                onChanged={invalidate}
                showRequiredFor
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function DocCard({
  config,
  existing,
  party,
  onChanged,
  showRequiredFor = false,
}: {
  config: KycDocConfig;
  existing: PartyKycDoc | undefined;
  party: { partyType: "ORG"; orgId: string };
  onChanged: () => void;
  showRequiredFor?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{config.label}</p>
            {showRequiredFor && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                For {requiredForLabel(config)}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{config.hint}</p>
        </div>
        {existing && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
            <CheckCircle2 className="h-3 w-3" />
            On file
          </span>
        )}
      </div>
      <UploadZone
        config={config}
        party={party}
        value={null}
        onDone={onChanged}
        onClear={onChanged}
      />
      {existing && (
        <p className="truncate text-xs text-muted-foreground">
          Currently on file: {existing.fileName}
        </p>
      )}
    </div>
  );
}
