"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { getKycStatus, uploadKycDocument, DOC_LABELS, type KycStatus } from "@/actions/book/kyc";
import { CompanyKind, KycDocType } from "@/generated/prisma";
import type { Party, FileMeta } from "@/types/booking";
import { FileUploadField } from "./FileUploadField";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepKycProps {
  party: Party;
  onComplete: () => void;
}

interface DocUploadState {
  docType: KycDocType;
  docNumber: string;
  file: FileMeta | null;
  uploading: boolean;
  uploaded: boolean;
  error: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StepKyc({ party, onComplete }: StepKycProps) {
  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // For ORG parties — Org model has no companyKind column, so we ask the user.
  // For CLIENT parties, companyKind comes from the DB row (ignored here).
  const [orgKindHint, setOrgKindHint] = useState<CompanyKind>(CompanyKind.COMPANY);

  // Per-doc upload state, keyed by KycDocType
  const [docStates, setDocStates] = useState<Record<string, DocUploadState>>({});

  const loadKyc = useCallback(
    async (hint: CompanyKind = orgKindHint) => {
      setLoading(true);
      setLoadError(null);
      const result = await getKycStatus(party, hint);
      if (result.ok) {
        setKycStatus(result.data);
        // Initialise upload state for each missing doc type
        setDocStates(
          Object.fromEntries(
            result.data.missing.map((dt) => [
              dt,
              {
                docType: dt,
                docNumber: "",
                file: null,
                uploading: false,
                uploaded: false,
                error: null,
              } satisfies DocUploadState,
            ]),
          ),
        );
      } else {
        setLoadError(result.error);
      }
      setLoading(false);
    },
    [party],
  );

  useEffect(() => {
    loadKyc();
  }, [loadKyc]);

  const handleOrgKindChange = (kind: CompanyKind) => {
    setOrgKindHint(kind);
    loadKyc(kind);
  };

  const setDocField = (docType: KycDocType, patch: Partial<DocUploadState>) => {
    setDocStates((prev) => ({
      ...prev,
      [docType]: { ...prev[docType], ...patch },
    }));
  };

  const handleUpload = async (docType: KycDocType) => {
    const state = docStates[docType];
    if (!state?.file) {
      toast.error("Select a file first.");
      return;
    }

    setDocField(docType, { uploading: true, error: null });
    const result = await uploadKycDocument(party, {
      docType,
      docNumber: state.docNumber || undefined,
      file: state.file,
    });

    if (result.ok) {
      setDocField(docType, { uploading: false, uploaded: true, error: null });
      toast.success(`${DOC_LABELS[docType]} uploaded.`);
    } else {
      setDocField(docType, { uploading: false, error: result.error });
      toast.error(result.error);
    }
  };

  const allUploaded =
    kycStatus !== null &&
    (kycStatus.isComplete ||
      kycStatus.missing.every((dt) => docStates[dt]?.uploaded));

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load KYC status</AlertTitle>
        <AlertDescription>
          {loadError}
          <Button
            variant="link"
            size="sm"
            className="ml-2 h-auto p-0"
            onClick={() => loadKyc()}
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">KYC Verification</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Required identity documents for the shipper.
        </p>
      </div>

      {/* Org kind selector — only shown for ORG parties (Org has no companyKind column) */}
      {party.partyType === "ORG" && (
        <div className="rounded-lg border bg-amber-50/60 p-3.5 dark:bg-amber-950/20">
          <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-300">
            What type of entity is your organisation?
          </p>
          <Select value={orgKindHint} onValueChange={handleOrgKindChange}>
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CompanyKind.INDIVIDUAL}>
                Individual / Sole proprietor
              </SelectItem>
              <SelectItem value={CompanyKind.COMPANY}>
                Company / Partnership / LLP
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            This determines which documents are required. Not saved to your profile.
          </p>
        </div>
      )}

      {/* ── KYC complete ──────────────────────────────────────── */}
      {kycStatus?.isComplete && kycStatus.missing.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              All KYC documents are on file
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              {kycStatus.onFile.length} document{kycStatus.onFile.length !== 1 ? "s" : ""} verified.
              You can proceed.
            </p>
          </div>
        </div>
      )}

      {/* ── Docs on file ──────────────────────────────────────── */}
      {kycStatus && kycStatus.onFile.length > 0 && kycStatus.missing.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Already on file
          </p>
          <div className="flex flex-wrap gap-1.5">
            {kycStatus.onFile.map((doc) => (
              <Badge
                key={doc.id}
                variant="outline"
                className="gap-1.5 border-emerald-200 text-emerald-700"
              >
                <CheckCircle2 className="h-3 w-3" />
                {DOC_LABELS[doc.docType]}
                {doc.verifiedAt && (
                  <span className="text-emerald-500">✓</span>
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ── Missing docs upload area ──────────────────────────── */}
      {kycStatus && kycStatus.missing.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Documents required — {kycStatus.missing.length} remaining
          </p>

          {kycStatus.missing.map((docType) => {
            const state = docStates[docType];
            if (!state) return null;

            return (
              <DocUploadCard
                key={docType}
                docType={docType}
                state={state}
                onFileChange={(file) => setDocField(docType, { file })}
                onDocNumberChange={(docNumber) => setDocField(docType, { docNumber })}
                onUpload={() => handleUpload(docType)}
              />
            );
          })}
        </div>
      )}

      <Button
        className="w-full"
        disabled={!allUploaded}
        onClick={onComplete}
      >
        {allUploaded ? (
          <>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        ) : (
          "Upload all required documents to continue"
        )}
      </Button>
    </div>
  );
}

// ─── Individual doc upload card ───────────────────────────────────────────────

interface DocUploadCardProps {
  docType: KycDocType;
  state: DocUploadState;
  onFileChange: (file: FileMeta | null) => void;
  onDocNumberChange: (value: string) => void;
  onUpload: () => void;
}

function DocUploadCard({
  docType,
  state,
  onFileChange,
  onDocNumberChange,
  onUpload,
}: DocUploadCardProps) {
  const label = DOC_LABELS[docType];
  const needsNumber = [
    KycDocType.PAN_CARD,
    KycDocType.ADHAR_CARD,
    KycDocType.GST_CERTIFICATE,
    KycDocType.IEC_CODE,
  ].includes(docType);

  if (state.uploaded) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
            {label}
          </p>
          <p className="text-xs text-emerald-600">Uploaded successfully</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          <Upload className="h-3 w-3" />
        </div>
        <p className="text-sm font-medium">{label}</p>
        <Badge variant="secondary" className="ml-auto text-[10px]">Required</Badge>
      </div>

      {needsNumber && (
        <div>
          <Label className="mb-1.5 block text-xs">
            {docType === KycDocType.PAN_CARD
              ? "PAN number (optional)"
              : docType === KycDocType.ADHAR_CARD
              ? "Aadhaar number (optional)"
              : "Document number (optional)"}
          </Label>
          <Input
            value={state.docNumber}
            onChange={(e) => onDocNumberChange(e.target.value)}
            placeholder={
              docType === KycDocType.PAN_CARD
                ? "ABCDE1234F"
                : docType === KycDocType.ADHAR_CARD
                ? "XXXX XXXX XXXX"
                : "Enter document number"
            }
            className="h-9 text-sm uppercase"
            disabled={state.uploading}
          />
        </div>
      )}

      <FileUploadField
        value={state.file}
        onChange={onFileChange}
        label={`Upload ${label}`}
        disabled={state.uploading}
      />

      {state.error && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}

      <Button
        type="button"
        className="w-full"
        size="sm"
        disabled={!state.file || state.uploading}
        onClick={onUpload}
      >
        {state.uploading ? (
          <>
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Saving…
          </>
        ) : (
          `Save ${label}`
        )}
      </Button>
    </div>
  );
}