// components/settings/OrgKycSection.tsx
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadZone } from "@/components/kyc/UploadZone";
import { getKycDocs, type PartyKycDoc } from "@/actions/book/kyc";
import type { KycDocConfig } from "@/lib/booking/kyc";

export function OrgKycSection({
  orgId,
  configs,
  initialDocs,
}: {
  orgId: string;
  configs: KycDocConfig[];
  initialDocs: PartyKycDoc[];
}) {
  const party = { partyType: "ORG" as const, orgId };
  const qc = useQueryClient();

  // SSR-fetched `initialDocs` avoids a loading flash on first paint;
  // TanStack Query takes over from there and lets the upload callback below
  // just invalidate this key instead of managing local doc-list state by hand.
  const { data: docs = initialDocs } = useQuery({
    queryKey: ["org-kyc-docs", orgId],
    queryFn: async () => {
      const result = await getKycDocs(party);
      return result.success ? result.docs : [];
    },
    initialData: initialDocs,
    staleTime: 30_000,
  });

  const byKey = Object.fromEntries(docs.map((d) => [d.key, d])) as Partial<Record<string, PartyKycDoc>>;
  const completedCount = configs.filter((c) => byKey[c.key]).length;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["org-kyc-docs", orgId] });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Identity documents (KYC)</CardTitle>
        {completedCount === configs.length ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{completedCount} of {configs.length} added</span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload your Aadhaar and PAN once — we'll reuse them automatically on every
          future booking, so you won't need to upload them again.
        </p>
        {configs.map((config) => {
          const existing = byKey[config.key];
          return (
            <div key={config.key} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{config.label}</p>
                  <p className="text-xs text-muted-foreground">{config.hint}</p>
                </div>
                {existing && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    On file
                  </span>
                )}
              </div>
              <UploadZone
                config={config}
                party={party}
                value={null}
                onDone={invalidate}
                onClear={invalidate}
              />
              {existing && (
                <p className="text-xs text-muted-foreground truncate">
                  Currently on file: {existing.fileName}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}