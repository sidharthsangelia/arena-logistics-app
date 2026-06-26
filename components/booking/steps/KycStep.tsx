"use client";

/**
 * KycStep
 *
 * Upload flow for each document:
 *   1. User picks a file → useUploadThing("bookingDocument") sends it to UploadThing.
 *   2. onClientUploadComplete fires → calls saveOrgKycDocAction to persist
 *      the URL + metadata to KycDocument (partyType=ORG) in the DB.
 *   3. On success → updates RHF form state with the FileMeta so validation passes.
 *   4. assertKycComplete in create-shipment.action now finds the rows in the DB.
 *
 * "On file" flow (docs already in the vault):
 *   1. On mount → getOrgKycDocs() fetches existing rows.
 *   2. Each existing doc shows a consent checkbox instead of an upload zone.
 *   3. Consent ticked → RHF FileMeta is set (from the existing DB row).
 *   4. Consent unticked → RHF FileMeta is cleared (so validation blocks Next).
 */

import { useState, useEffect, useTransition } from "react";
import { useUploadThing } from "@/utils/uploadthing"; // your generated hook
import {
  Upload, X, FileCheck2, AlertCircle,
  ShieldCheck, Clock, Loader2, Info,
} from "lucide-react";
import { UseFormSetValue, UseFormWatch, FieldErrors } from "react-hook-form";

import { Badge }     from "@/components/ui/badge";
import { Button }    from "@/components/ui/button";
import { Checkbox }  from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn }        from "@/lib/utils";

import type { BookingFormData, FileMeta } from "@/types/booking.types";
import { getOrgKycDocs, saveOrgKycDocAction, type OrgKycDoc }  from "@/actions/book/kyc";
 
import { KycDocType }                     from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KycStepProps {
  watch:              UseFormWatch<BookingFormData>;
  setValue:           UseFormSetValue<BookingFormData>;
  errors:             FieldErrors<BookingFormData>;
  totalDeclaredValue: number;
}

type DocKey = keyof BookingFormData["kycDocs"];

interface DocConfig {
  key:                    DocKey;
  label:                  string;
  dbDocType:              KycDocType;
  alwaysRequired:         boolean;
  valueThresholdRequired: boolean;
  hint:                   string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DOC_CONFIGS: DocConfig[] = [
  {
    key:                    "pan",
    label:                  "PAN Card",
    dbDocType:              KycDocType.PAN_CARD,
    alwaysRequired:         true,
    valueThresholdRequired: false,
    hint: "Permanent Account Number — required for all exporters.",
  },
  {
    key:                    "aadhaar",
    label:                  "Aadhaar Card",
    dbDocType:              KycDocType.ADHAR_CARD,
    alwaysRequired:         true,
    valueThresholdRequired: false,
    hint: "Required for all individual and proprietorship exporters.",
  },
  {
    key:                    "iec",
    label:                  "IEC Certificate",
    dbDocType:              KycDocType.IEC_CODE,
    alwaysRequired:         false,
    valueThresholdRequired: true,
    hint: "Import Export Code — mandatory when shipment value exceeds ₹25,000.",
  },
  {
    key:                    "gst",
    label:                  "GST Certificate",
    dbDocType:              KycDocType.GST_CERTIFICATE,
    alwaysRequired:         false,
    valueThresholdRequired: false,
    hint: "Upload if your business is GST registered.",
  },
];

const IEC_THRESHOLD = 25_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n < 1024)       return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style:                 "currency",
    currency:              "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

// ---------------------------------------------------------------------------
// ExistingDocCard — shown when doc is already in the vault
// ---------------------------------------------------------------------------

function ExistingDocCard({
  doc,
  consentGiven,
  onConsentChange,
  onReplace,
  required,
}: {
  doc:             OrgKycDoc;
  consentGiven:    boolean;
  onConsentChange: (v: boolean) => void;
  onReplace:       () => void;
  required:        boolean;
}) {
  const id = `consent-${doc.key}`;
  return (
    <div className={cn(
      "rounded-lg border-2 p-4 space-y-3 transition-colors",
      consentGiven ? "border-green-300 bg-green-50" : "border-border bg-card",
    )}>
      {/* File row */}
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 mt-0.5">
          <FileCheck2 className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{doc.fileName}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
            {formatBytes(doc.fileSize)}
            {doc.verifiedAt ? (
              <span className="flex items-center gap-1 text-green-600">
                <ShieldCheck className="h-3 w-3" />Verified
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600">
                <Clock className="h-3 w-3" />Pending verification
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onReplace}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
        >
          Replace
        </button>
      </div>

      {/* Consent */}
      <label htmlFor={id} className="flex items-start gap-2.5 cursor-pointer">
        <Checkbox
          id={id}
          checked={consentGiven}
          onCheckedChange={(v) => onConsentChange(!!v)}
          className="mt-0.5"
        />
        <span className="text-xs text-muted-foreground leading-relaxed">
          I consent to using this document for this shipment's customs and
          compliance processing.
          {required && (
            <span className="ml-1 text-destructive font-medium">
              (Required to proceed)
            </span>
          )}
        </span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UploadZone — real UploadThing upload + immediate DB persist
// ---------------------------------------------------------------------------

function UploadZone({
  config,
  value,
  onDone,
  onClear,
  error,
}: {
  config:  DocConfig;
  value:   FileMeta | null;
  /** Called after the file is uploaded AND saved to the DB */
  onDone:  (meta: FileMeta) => void;
  onClear: () => void;
  error?:  string;
}) {
  const [uploading, setUploading]   = useState(false);
  const [uploadErr, setUploadErr]   = useState<string | null>(null);
  const inputId = `upload-${config.key}`;

  const { startUpload } = useUploadThing("bookingDocument", {
    onClientUploadComplete: async (res) => {
      const file = res?.[0];
      if (!file) {
        setUploadErr("Upload completed but no file data returned.");
        setUploading(false);
        return;
      }

      // Persist to KycDocument table immediately
      const saveResult = await saveOrgKycDocAction({
        docType:  config.dbDocType,
        label:    config.label,
        fileUrl:  file.ufsUrl ?? file.url,
        fileKey:  file.key,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type ?? "application/octet-stream",
      });

      if (!saveResult.success) {
        setUploadErr(saveResult.message);
        setUploading(false);
        return;
      }

      // Update RHF form state — validation will now pass
      onDone({
        fileUrl:  file.ufsUrl ?? file.url,
        fileKey:  file.key,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type ?? "application/octet-stream",
      });
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

  // Uploaded state
  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <FileCheck2 className="h-5 w-5 shrink-0 text-green-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-green-900">{value.fileName}</p>
          <p className="text-xs text-green-700">{formatBytes(value.fileSize)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-green-700 hover:text-destructive"
          onClick={onClear}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const displayError = error ?? uploadErr;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-colors",
          uploading
            ? "border-primary/40 bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/40",
          displayError && "border-destructive/60 bg-destructive/5",
        )}
      >
        {uploading
          ? <Loader2 className="h-6 w-6 animate-spin text-primary" />
          : <Upload className="h-6 w-6 text-muted-foreground" />
        }
        <span className="text-sm text-muted-foreground">
          {uploading ? "Uploading & saving…" : "Click to upload or drag & drop"}
        </span>
        <span className="text-xs text-muted-foreground">PDF, JPG, PNG · Max 16 MB</span>
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
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {displayError}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocSection
// ---------------------------------------------------------------------------

function DocSection({
  config,
  isRequired,
  existingDoc,
  formValue,
  consentGiven,
  isReplacing,
  onConsentChange,
  onStartReplace,
  onDone,
  onClear,
  error,
}: {
  config:          DocConfig;
  isRequired:      boolean;
  existingDoc:     OrgKycDoc | null;
  formValue:       FileMeta | null;
  consentGiven:    boolean;
  isReplacing:     boolean;
  onConsentChange: (v: boolean) => void;
  onStartReplace:  () => void;
  onDone:          (meta: FileMeta) => void;
  onClear:         () => void;
  error?:          string;
}) {
  const showExisting = !!existingDoc && !isReplacing;

  return (
    <div className={cn(
      "rounded-xl border bg-card p-5 space-y-4 transition-all",
      error              && "border-destructive/40",
      showExisting       && "border-primary/20",
      formValue          && "border-green-300 bg-green-50/30",
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{config.label}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{config.hint}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {isRequired
            ? <Badge variant="secondary" className="text-xs">Required</Badge>
            : <Badge variant="outline"   className="text-xs">Optional</Badge>
          }
          {showExisting && (
            <Badge className="text-xs bg-primary/10 text-primary border-0">On file</Badge>
          )}
        </div>
      </div>

      {/* Body */}
      {showExisting ? (
        <ExistingDocCard
          doc={existingDoc}
          consentGiven={consentGiven}
          onConsentChange={onConsentChange}
          onReplace={onStartReplace}
          required={isRequired}
        />
      ) : (
        <UploadZone
          config={config}
          value={formValue}
          onDone={onDone}
          onClear={onClear}
          error={error}
        />
      )}

      {/* Consent-not-given error for existing docs */}
      {showExisting && !consentGiven && isRequired && error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
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
  totalDeclaredValue,
}: KycStepProps) {
  const kycDocs    = watch("kycDocs");
  const iecRequired = totalDeclaredValue > IEC_THRESHOLD;

  const [existingDocs, setExistingDocs] = useState<OrgKycDoc[]>([]);
  const [loadingDocs, startLoad]        = useTransition();
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [consents,  setConsents]        = useState<Partial<Record<DocKey, boolean>>>({});
  const [replacing, setReplacing]       = useState<Partial<Record<DocKey, boolean>>>({});

  // Fetch existing vault docs on mount
  useEffect(() => {
    startLoad(async () => {
      const result = await getOrgKycDocs();
      if (!result.success) {
        setLoadError(result.error);
        return;
      }
      setExistingDocs(result.docs);

      // Pre-populate RHF with existing FileMeta so validation passes
      // (user still needs to tick consent before Next works)
      result.docs.forEach((doc) => {
        setValue(`kycDocs.${doc.key}`, {
          fileUrl:  doc.fileUrl,
          fileKey:  doc.fileKey,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
        });
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byKey = Object.fromEntries(
    existingDocs.map((d) => [d.key, d]),
  ) as Partial<Record<DocKey, OrgKycDoc>>;

  const kycErrors = errors.kycDocs as Record<string, { message?: string }> | undefined;

  const requiredConfigs = DOC_CONFIGS.filter(
    (c) => c.alwaysRequired || (c.valueThresholdRequired && iecRequired),
  );
  const optionalConfigs = DOC_CONFIGS.filter(
    (c) => !c.alwaysRequired && !(c.valueThresholdRequired && iecRequired),
  );
  const completedCount = requiredConfigs.filter((c) => !!kycDocs?.[c.key]).length;

  const handleConsent = (key: DocKey) => (given: boolean) => {
    setConsents((prev) => ({ ...prev, [key]: given }));
    if (!given) {
      // Revoke consent → clear value so schema validation blocks Next
      setValue(`kycDocs.${key}`, null, { shouldValidate: true });
    } else {
      const doc = byKey[key];
      if (doc) {
        setValue(`kycDocs.${key}`, {
          fileUrl:  doc.fileUrl,
          fileKey:  doc.fileKey,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
        }, { shouldValidate: true });
      }
    }
  };

  const handleReplace = (key: DocKey) => () => {
    setReplacing((prev) => ({ ...prev, [key]: true }));
    setConsents((prev) => ({ ...prev, [key]: false }));
    setValue(`kycDocs.${key}`, null, { shouldValidate: true });
  };

  // Called after UploadThing upload + DB save both succeed
  const handleDone = (key: DocKey) => (meta: FileMeta) => {
    setValue(`kycDocs.${key}`, meta, { shouldValidate: true });
  };

  const handleClear = (key: DocKey) => () => {
    setValue(`kycDocs.${key}`, null, { shouldValidate: true });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold">KYC Documents</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Customs requires verified identity and export compliance documents for
          every international shipment from India.
        </p>
      </div>

      {/* IEC threshold notice */}
      <div className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        iecRequired
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-blue-200 bg-blue-50 text-blue-800",
      )}>
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">
            {iecRequired
              ? `IEC required — value ${formatCurrency(totalDeclaredValue)} exceeds ₹25,000`
              : `IEC optional — value ${formatCurrency(totalDeclaredValue)} is within ₹25,000`
            }
          </p>
          <p className="mt-0.5 text-xs opacity-80">
            {iecRequired
              ? "Indian customs mandates an Import Export Code for commercial shipments above this threshold."
              : "You may still upload it if available — it becomes mandatory above ₹25,000."
            }
          </p>
        </div>
      </div>

      {/* Loading vault */}
      {loadingDocs && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking your document vault…
        </div>
      )}

      {/* Vault load error */}
      {loadError && !loadingDocs && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Could not load saved documents ({loadError}). Please upload below.
        </div>
      )}

      {/* Vault found banner */}
      {!loadingDocs && existingDocs.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          {existingDocs.length} document{existingDocs.length !== 1 ? "s" : ""} found
          in your vault — tick consent on each to reuse them for this shipment.
        </div>
      )}

      {/* Progress */}
      {!loadingDocs && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Required documents</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedCount} of {requiredConfigs.length} completed
            </p>
          </div>
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-colors",
            completedCount === requiredConfigs.length
              ? "bg-green-100 text-green-700"
              : "bg-muted text-muted-foreground",
          )}>
            {completedCount}/{requiredConfigs.length}
          </div>
        </div>
      )}

      {/* Required docs */}
      {!loadingDocs && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Required
          </p>
          {requiredConfigs.map((config) => (
            <DocSection
              key={config.key}
              config={config}
              isRequired
              existingDoc={byKey[config.key] ?? null}
              formValue={kycDocs?.[config.key] ?? null}
              consentGiven={consents[config.key] ?? false}
              isReplacing={replacing[config.key] ?? false}
              onConsentChange={handleConsent(config.key)}
              onStartReplace={handleReplace(config.key)}
              onDone={handleDone(config.key)}
              onClear={handleClear(config.key)}
              error={kycErrors?.[config.key]?.message}
            />
          ))}
        </div>
      )}

      {/* Optional docs */}
      {!loadingDocs && optionalConfigs.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Optional
            </p>
            {optionalConfigs.map((config) => (
              <DocSection
                key={config.key}
                config={config}
                isRequired={false}
                existingDoc={byKey[config.key] ?? null}
                formValue={kycDocs?.[config.key] ?? null}
                consentGiven={consents[config.key] ?? false}
                isReplacing={replacing[config.key] ?? false}
                onConsentChange={handleConsent(config.key)}
                onStartReplace={handleReplace(config.key)}
                onDone={handleDone(config.key)}
                onClear={handleClear(config.key)}
                error={undefined}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}