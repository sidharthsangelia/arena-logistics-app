"use client";

/**
 * KycStep
 *
 * Required documents branch by shipment type (CSB4 / CSB5 / COMMERCIAL) using
 * the shared matrix in lib/booking/kyc.ts. Documents are read from and saved
 * to the vault of the relevant PARTY — the org for its own shipments, or the
 * client when a BA books on their behalf (per-client reuse).
 *
 * Upload flow:
 *   1. User picks a file → UploadThing("bookingDocument") uploads it.
 *   2. onClientUploadComplete → saveKycDocAction(party, …) persists it to the
 *      party's KycDocument vault.
 *   3. On success → RHF FileMeta is set so validation passes.
 *
 * "On file" flow (docs already in the vault):
 *   1. On mount → getKycDocs(party) fetches existing rows into local state.
 *   2. Each existing doc shows a consent checkbox instead of an upload zone.
 *   3. Consent ticked → RHF FileMeta is set from the DB row (only then does the
 *      field become valid). Unticked → cleared, so validation blocks Next.
 *
 * Layout: required docs stay visible and collapse to a slim "ready" row once
 * satisfied; every optional doc lives behind a single collapsible so the user
 * never scrolls a long list to reach Next.
 */

import { useState, useEffect, useMemo, useTransition } from "react";
import { useUploadThing } from "@/utils/uploadthing";
import {
  Upload, X, FileCheck2, AlertCircle, CheckCircle2,
  ShieldCheck, Clock, Loader2, ChevronDown, Plus,
} from "lucide-react";
import { UseFormSetValue, UseFormWatch, FieldErrors } from "react-hook-form";

import { Badge }    from "@/components/ui/badge";
import { Button }   from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import type { BookingFormData, FileMeta, ShipmentTypeValue } from "@/types/booking.types";
import type { Party } from "@/types/booking";
import { getKycDocs, saveKycDocAction, type PartyKycDoc } from "@/actions/book/kyc";
import {
  KYC_DOC_CONFIGS,
  requiredKycKeys,
  type KycDocConfig,
  type KycDocKey,
} from "@/lib/booking/kyc";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface KycStepProps {
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
  shipmentType: ShipmentTypeValue;
  /** Whose vault to read/save (org, or the client for BA-for-client bookings). */
  party: Party;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_LABEL: Record<ShipmentTypeValue, string> = {
  CSB4: "CSB-IV",
  CSB5: "CSB-V",
  COMMERCIAL: "Commercial",
};

// ---------------------------------------------------------------------------
// ReadyRow — the slim confirmation shown once a doc is satisfied
// ---------------------------------------------------------------------------

function ReadyRow({
  label,
  fileName,
  onChange,
}: {
  label: string;
  fileName: string;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-card px-3.5 py-2.5">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{fileName}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 text-xs text-muted-foreground"
        onClick={onChange}
      >
        Change
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExistingDocConsent — shown when doc is on file in the vault
// ---------------------------------------------------------------------------

function ExistingDocConsent({
  doc,
  consentGiven,
  onConsentChange,
  onReplace,
}: {
  doc: PartyKycDoc;
  consentGiven: boolean;
  onConsentChange: (v: boolean) => void;
  onReplace: () => void;
}) {
  const id = `consent-${doc.key}`;
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2.5">
        <FileCheck2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{doc.fileName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            {formatBytes(doc.fileSize)}
            {doc.verifiedAt ? (
              <span className="flex items-center gap-1 text-emerald-600">
                · <ShieldCheck className="h-3 w-3" /> Verified
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600">
                · <Clock className="h-3 w-3" /> Pending review
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onReplace}
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Replace
        </button>
      </div>

      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
        <Checkbox
          id={id}
          checked={consentGiven}
          onCheckedChange={(v) => onConsentChange(!!v)}
          className="mt-0.5"
        />
        <span className="text-xs leading-relaxed text-muted-foreground">
          Use this saved document for this shipment.
        </span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UploadZone — UploadThing upload + immediate DB persist to the party vault
// ---------------------------------------------------------------------------

function UploadZone({
  config,
  party,
  onDone,
  error,
}: {
  config: KycDocConfig;
  party: Party;
  onDone: (meta: FileMeta) => void;
  error?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const inputId = `upload-${config.key}`;

  const { startUpload } = useUploadThing("bookingDocument", {
    onClientUploadComplete: async (res) => {
      const file = res?.[0];
      if (!file) {
        setUploadErr("Upload finished but no file came back. Please try again.");
        setUploading(false);
        return;
      }

      const meta: FileMeta = {
        fileUrl: file.ufsUrl ?? file.url,
        fileKey: file.key,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type ?? "application/octet-stream",
      };

      const saveResult = await saveKycDocAction(party, {
        key: config.key,
        label: config.label,
        ...meta,
      });

      if (!saveResult.success) {
        setUploadErr(saveResult.message);
        setUploading(false);
        return;
      }

      onDone(meta);
      setUploading(false);
    },
    onUploadError: (err) => {
      setUploadErr(err.message ?? "Upload failed. Please try again.");
      setUploading(false);
    },
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadErr(null);
    setUploading(true);
    await startUpload([file]);
    e.target.value = "";
  };

  const displayError = error ?? uploadErr;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className={cn(
          "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-4 text-sm transition-colors",
          uploading
            ? "border-primary/40 bg-primary/5 text-primary"
            : "text-muted-foreground hover:border-primary/50 hover:bg-muted/40",
          displayError && "border-destructive/60 bg-destructive/5",
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading and saving…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Click to upload
            <span className="text-xs text-muted-foreground">PDF, JPG or PNG, up to 16 MB</span>
          </>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          disabled={uploading}
          onChange={handleFile}
        />
      </label>

      {displayError && (
        <p className="flex items-center gap-1.5 text-xs text-destructive" aria-live="polite">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {displayError}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocSection — one document (required or optional)
// ---------------------------------------------------------------------------

function DocSection({
  config,
  party,
  isRequired,
  existingDoc,
  formValue,
  consentGiven,
  isReplacing,
  onConsentChange,
  onStartReplace,
  onDone,
  onReset,
  error,
}: {
  config: KycDocConfig;
  party: Party;
  isRequired: boolean;
  existingDoc: PartyKycDoc | null;
  formValue: FileMeta | null;
  consentGiven: boolean;
  isReplacing: boolean;
  onConsentChange: (v: boolean) => void;
  onStartReplace: () => void;
  onDone: (meta: FileMeta) => void;
  onReset: () => void;
  error?: string;
}) {
  // Satisfied → slim ready row (keeps the list short as you progress).
  if (formValue) {
    return <ReadyRow label={config.label} fileName={formValue.fileName} onChange={onReset} />;
  }

  const showExisting = !!existingDoc && !isReplacing;

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border bg-card p-4",
        error && "border-destructive/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{config.label}</h3>
            {showExisting && (
              <Badge variant="secondary" className="h-5 text-[10px] font-normal">
                On file
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{config.hint}</p>
        </div>
        {isRequired && (
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">Required</span>
        )}
      </div>

      {showExisting ? (
        <ExistingDocConsent
          doc={existingDoc}
          consentGiven={consentGiven}
          onConsentChange={onConsentChange}
          onReplace={onStartReplace}
        />
      ) : (
        <UploadZone config={config} party={party} onDone={onDone} error={error} />
      )}

      {showExisting && !consentGiven && isRequired && error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive" aria-live="polite">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KycStep
// ---------------------------------------------------------------------------

export default function KycStep({
  watch,
  setValue,
  errors,
  shipmentType,
  party,
}: KycStepProps) {
  const kycDocs = watch("kycDocs");

  const [existingDocs, setExistingDocs] = useState<PartyKycDoc[]>([]);
  const [loadingDocs, startLoad] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consents, setConsents] = useState<Partial<Record<KycDocKey, boolean>>>({});
  const [replacing, setReplacing] = useState<Partial<Record<KycDocKey, boolean>>>({});
  const [optionalOpen, setOptionalOpen] = useState(false);

  const partyKey = party.partyType === "ORG" ? party.orgId : party.clientId;

  // Fetch existing vault docs for this party — does NOT touch RHF form state.
  // Refetches if the party changes (BA switching which client they book for).
  useEffect(() => {
    startLoad(async () => {
      const result = await getKycDocs(party);
      if (!result.success) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      setExistingDocs(result.docs);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyKey]);

  const byKey = useMemo(
    () =>
      Object.fromEntries(existingDocs.map((d) => [d.key, d])) as Partial<
        Record<KycDocKey, PartyKycDoc>
      >,
    [existingDocs],
  );

  const kycErrors = errors.kycDocs as Record<string, { message?: string }> | undefined;

  const requiredKeys = useMemo(() => new Set(requiredKycKeys(shipmentType)), [shipmentType]);
  const requiredConfigs = KYC_DOC_CONFIGS.filter((c) => requiredKeys.has(c.key));
  const optionalConfigs = KYC_DOC_CONFIGS.filter((c) => !requiredKeys.has(c.key));

  const completedCount = requiredConfigs.filter((c) => !!kycDocs?.[c.key]).length;
  const allDone = requiredConfigs.length > 0 && completedCount === requiredConfigs.length;
  const optionalAdded = optionalConfigs.filter((c) => !!kycDocs?.[c.key]).length;

  const handleConsent = (key: KycDocKey) => (given: boolean) => {
    setConsents((prev) => ({ ...prev, [key]: given }));
    if (!given) {
      setValue(`kycDocs.${key}`, null, { shouldValidate: true });
    } else {
      const doc = byKey[key];
      if (doc) {
        setValue(
          `kycDocs.${key}`,
          {
            fileUrl: doc.fileUrl,
            fileKey: doc.fileKey,
            fileName: doc.fileName,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
          },
          { shouldValidate: true },
        );
      }
    }
  };

  const handleReplace = (key: KycDocKey) => () => {
    setReplacing((prev) => ({ ...prev, [key]: true }));
    setConsents((prev) => ({ ...prev, [key]: false }));
    setValue(`kycDocs.${key}`, null, { shouldValidate: true });
  };

  const handleDone = (key: KycDocKey) => (meta: FileMeta) => {
    setValue(`kycDocs.${key}`, meta, { shouldValidate: true });
  };

  // Back to square one for this doc: clears the form value, consent and any
  // in-progress replace, so it falls back to the "on file" card (if the vault
  // has it) or a fresh upload zone.
  const handleReset = (key: KycDocKey) => () => {
    setValue(`kycDocs.${key}`, null, { shouldValidate: true });
    setConsents((prev) => ({ ...prev, [key]: false }));
    setReplacing((prev) => ({ ...prev, [key]: false }));
  };

  const forClient = party.partyType === "CLIENT";
  const progress = requiredConfigs.length
    ? Math.round((completedCount / requiredConfigs.length) * 100)
    : 100;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Documents for customs</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Indian customs needs a few identity and export documents for every
          international shipment. {forClient
            ? "We read from and save to this client's vault, so you only upload each one once."
            : "We read from and save to your vault, so you only upload each one once."}
        </p>
      </div>

      {/* Progress */}
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {TYPE_LABEL[shipmentType]} shipment
          </span>
          <span className={cn("text-xs", allDone ? "text-emerald-600" : "text-muted-foreground")}>
            {allDone ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> All required documents ready
              </span>
            ) : (
              `${completedCount} of ${requiredConfigs.length} required ready`
            )}
          </span>
        </div>
        <Progress value={progress} className="mt-2.5 h-1.5" />
      </div>

      {loadingDocs && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking your document vault…
        </div>
      )}

      {loadError && !loadingDocs && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Could not load saved documents ({loadError}). You can still upload below.
        </div>
      )}

      {/* Required documents */}
      {!loadingDocs && (
        <div className="space-y-2.5">
          {requiredConfigs.map((config) => (
            <DocSection
              key={config.key}
              config={config}
              party={party}
              isRequired
              existingDoc={byKey[config.key] ?? null}
              formValue={kycDocs?.[config.key] ?? null}
              consentGiven={consents[config.key] ?? false}
              isReplacing={replacing[config.key] ?? false}
              onConsentChange={handleConsent(config.key)}
              onStartReplace={handleReplace(config.key)}
              onDone={handleDone(config.key)}
              onReset={handleReset(config.key)}
              error={kycErrors?.[config.key]?.message}
            />
          ))}
        </div>
      )}

      {/* Optional documents — tucked away so they never block the path to Next */}
      {!loadingDocs && optionalConfigs.length > 0 && (
        <Collapsible open={optionalOpen} onOpenChange={setOptionalOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-dashed px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <span className="flex items-center gap-2 text-sm">
                <Plus className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Add optional documents</span>
                <span className="text-xs text-muted-foreground">
                  Not needed to continue
                  {optionalAdded > 0 && ` · ${optionalAdded} added`}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  optionalOpen && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2.5 pt-2.5">
            {optionalConfigs.map((config) => (
              <DocSection
                key={config.key}
                config={config}
                party={party}
                isRequired={false}
                existingDoc={byKey[config.key] ?? null}
                formValue={kycDocs?.[config.key] ?? null}
                consentGiven={consents[config.key] ?? false}
                isReplacing={replacing[config.key] ?? false}
                onConsentChange={handleConsent(config.key)}
                onStartReplace={handleReplace(config.key)}
                onDone={handleDone(config.key)}
                onReset={handleReset(config.key)}
                error={undefined}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
