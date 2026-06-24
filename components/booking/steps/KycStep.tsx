"use client";

/**
 * KycStep — Smart KYC document collection for international shipments.
 *
 * Logic:
 * 1. On mount, calls getOrgKycDocs() to check what's already on file.
 * 2. For each doc already on file → shows a "use existing" card with consent checkbox.
 * 3. For docs not on file → shows upload zone.
 * 4. PAN + Aadhaar are always required.
 * 5. IEC is conditionally required: if total declared shipment value > ₹25,000.
 * 6. GST is always optional.
 * 7. User must tick consent for any doc they're reusing from the vault.
 */

import { useState, useEffect, useTransition } from "react";
import {
  Upload,
  X,
  FileCheck2,
  AlertCircle,
  ShieldCheck,
  Clock,
  Loader2,
  Info,
} from "lucide-react";
import { UseFormSetValue, UseFormWatch, FieldErrors } from "react-hook-form";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { BookingFormData, FileMeta } from "@/types/booking.types";
import { getOrgKycDocs, type OrgKycDoc } from "@/actions/book/kyc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KycStepProps {
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
  /** Sum of all package declared values — used to decide if IEC is required */
  totalDeclaredValue: number;
}

type DocKey = keyof BookingFormData["kycDocs"];

interface DocConfig {
  key: DocKey;
  label: string;
  /** Always required regardless of shipment value */
  alwaysRequired: boolean;
  /** Required only when shipment value > ₹25,000 (IEC rule) */
  valueThresholdRequired: boolean;
  hint: string;
  accept: string;
}

// ---------------------------------------------------------------------------
// Document configuration
// ---------------------------------------------------------------------------

const DOC_CONFIGS: DocConfig[] = [
  {
    key: "pan",
    label: "PAN Card",
    alwaysRequired: true,
    valueThresholdRequired: false,
    hint: "Permanent Account Number — required for all exporters as primary identity proof.",
    accept: "image/*,.pdf",
  },
  {
    key: "aadhaar",
    label: "Aadhaar Card",
    alwaysRequired: true,
    valueThresholdRequired: false,
    hint: "Required for all individual and proprietorship exporters.",
    accept: "image/*,.pdf",
  },
  {
    key: "iec",
    label: "IEC Certificate",
    alwaysRequired: false,
    valueThresholdRequired: true,
    hint: "Import Export Code — mandatory when shipment value exceeds ₹25,000.",
    accept: "image/*,.pdf",
  },
  {
    key: "gst",
    label: "GST Certificate",
    alwaysRequired: false,
    valueThresholdRequired: false,
    hint: "Upload if your business is GST registered. Enables GST refund on exports.",
    accept: "image/*,.pdf",
  },
];

const IEC_THRESHOLD = 25_000; // ₹

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Upload stub — replace with your real upload action (UploadThing / S3 etc.)
// ---------------------------------------------------------------------------

async function uploadFile(file: File): Promise<FileMeta> {
  // TODO: replace with real upload
  await new Promise((r) => setTimeout(r, 900));
  return {
    fileUrl: URL.createObjectURL(file),
    fileKey: `kyc/${Date.now()}-${file.name}`,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  };
}

// ---------------------------------------------------------------------------
// ExistingDocCard — shown when the org already has this doc on file
// ---------------------------------------------------------------------------

interface ExistingDocCardProps {
  doc: OrgKycDoc;
  consentGiven: boolean;
  onConsentChange: (v: boolean) => void;
  onReplace: () => void;
  required: boolean;
}

function ExistingDocCard({
  doc,
  consentGiven,
  onConsentChange,
  onReplace,
  required,
}: ExistingDocCardProps) {
  const consentId = `consent-${doc.key}`;

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-4 space-y-3 transition-colors",
        consentGiven ? "border-green-300 bg-green-50" : "border-border bg-card",
      )}
    >
      {/* File row */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
          <FileCheck2 className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{doc.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(doc.fileSize)}
            {doc.verifiedAt && (
              <span className="ml-2 inline-flex items-center gap-0.5 text-green-600">
                <ShieldCheck className="h-3 w-3" />
                Verified by ops
              </span>
            )}
            {!doc.verifiedAt && (
              <span className="ml-2 inline-flex items-center gap-0.5 text-amber-600">
                <Clock className="h-3 w-3" />
                Pending verification
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

      {/* Consent checkbox */}
      <label
        htmlFor={consentId}
        className="flex items-start gap-2.5 cursor-pointer"
      >
        <Checkbox
          id={consentId}
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
// UploadZone — shown when no existing doc is found or user clicks "Replace"
// ---------------------------------------------------------------------------

interface UploadZoneProps {
  docKey: DocKey;
  value: FileMeta | null;
  onChange: (meta: FileMeta | null) => void;
  error?: string;
  disabled?: boolean;
}

function UploadZone({
  docKey,
  value,
  onChange,
  error,
  disabled,
}: UploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const inputId = `upload-${docKey}`;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const meta = await uploadFile(file);
      onChange(meta);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <FileCheck2 className="h-5 w-5 shrink-0 text-green-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-green-900">
            {value.fileName}
          </p>
          <p className="text-xs text-green-700">
            {formatBytes(value.fileSize)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-green-700 hover:text-destructive"
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <label
        htmlFor={inputId}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-colors",
          uploading
            ? "border-primary/40 bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/40",
          error && "border-destructive/60 bg-destructive/5",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : (
          <Upload className="h-6 w-6 text-muted-foreground" />
        )}
        <span className="text-sm text-muted-foreground">
          {uploading ? "Uploading…" : "Click to upload or drag & drop"}
        </span>
        <span className="text-xs text-muted-foreground">
          PDF, JPG, PNG · Max 5 MB
        </span>
        <input
          id={inputId}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          disabled={uploading || disabled}
          onChange={handleFile}
        />
      </label>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// DocSection — wraps one document type (existing card or upload zone)
// ---------------------------------------------------------------------------

interface DocSectionProps {
  config: DocConfig;
  isRequired: boolean;
  existingDoc: OrgKycDoc | null;
  formValue: FileMeta | null;
  consentGiven: boolean;
  isReplacing: boolean;
  onConsentChange: (v: boolean) => void;
  onStartReplace: () => void;
  onFormValueChange: (meta: FileMeta | null) => void;
  error?: string;
}

function DocSection({
  config,
  isRequired,
  existingDoc,
  formValue,
  consentGiven,
  isReplacing,
  onConsentChange,
  onStartReplace,
  onFormValueChange,
  error,
}: DocSectionProps) {
  const showExisting = !!existingDoc && !isReplacing;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 transition-all",
        error && "border-destructive/40",
        existingDoc && !isReplacing && "border-primary/20",
        formValue && "border-green-300 bg-green-50/40",
      )}
    >
      {/* Label row */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold leading-none">{config.label}</h3>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {config.hint}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {isRequired ? (
            <Badge variant="secondary">Required</Badge>
          ) : (
            <Badge variant="outline">Optional</Badge>
          )}

          {existingDoc && !isReplacing && (
            <Badge className="bg-primary/10 text-primary border-0">
              On File
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-auto">
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
            docKey={config.key}
            value={formValue}
            onChange={onFormValueChange}
            error={error}
          />
        )}
      </div>

      {/* Show error even when using existing doc (consent not given) */}
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
  const kycDocs = watch("kycDocs");
  const iecRequired = totalDeclaredValue > IEC_THRESHOLD;

  // Existing docs fetched from the DB
  const [existingDocs, setExistingDocs] = useState<OrgKycDoc[]>([]);
  const [loadingDocs, startLoadingDocs] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);

  // Consent state — tracks which "on file" docs the user has consented to use
  const [consents, setConsents] = useState<Partial<Record<DocKey, boolean>>>(
    {},
  );

  // Replace state — tracks which docs the user has clicked "Replace" on
  const [replacing, setReplacing] = useState<Partial<Record<DocKey, boolean>>>(
    {},
  );

  // Fetch existing docs on mount
  useEffect(() => {
    startLoadingDocs(async () => {
      const result = await getOrgKycDocs();
      if (result.success) {
        setExistingDocs(result.docs);

        // Pre-populate formData with existing doc FileMeta objects so that
        // if the user consents without uploading, the data is already there.
        result.docs.forEach((doc) => {
          setValue(`kycDocs.${doc.key}`, {
            fileUrl: doc.fileUrl,
            fileKey: doc.fileKey,
            fileName: doc.fileName,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
          });
        });
      } else {
        setLoadError(result.error);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const existingByKey = Object.fromEntries(
    existingDocs.map((d) => [d.key, d]),
  ) as Partial<Record<DocKey, OrgKycDoc>>;

  const kycErrors = errors.kycDocs as
    | Record<string, { message?: string }>
    | undefined;

  const handleConsentChange = (key: DocKey) => (given: boolean) => {
    setConsents((prev) => ({ ...prev, [key]: given }));
    // When consent is revoked, also clear the form value so validation fails
    if (!given) {
      setValue(`kycDocs.${key}`, null, { shouldValidate: true });
    } else {
      // Restore the existing doc's FileMeta
      const doc = existingByKey[key];
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

  const handleStartReplace = (key: DocKey) => () => {
    setReplacing((prev) => ({ ...prev, [key]: true }));
    // Clear the pre-populated value so user must upload a fresh file
    setValue(`kycDocs.${key}`, null, { shouldValidate: true });
    setConsents((prev) => ({ ...prev, [key]: false }));
  };

  const handleFormValueChange = (key: DocKey) => (meta: FileMeta | null) => {
    setValue(`kycDocs.${key}`, meta, { shouldValidate: true });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">KYC Documents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Customs requires verified identity and export compliance documents for
          every international shipment from India.
        </p>
      </div>

      {/* IEC threshold notice */}
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
          iecRequired
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-blue-200 bg-blue-50 text-blue-800",
        )}
      >
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          {iecRequired ? (
            <>
              <p className="font-medium">
                IEC required — shipment value{" "}
                {formatCurrency(totalDeclaredValue)} exceeds ₹25,000
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                Indian customs mandates an Import Export Code for commercial
                shipments above this threshold.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">
                IEC optional — shipment value{" "}
                {formatCurrency(totalDeclaredValue)} is within the ₹25,000
                threshold
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                You may still upload it if available. It will be required once
                the total declared value exceeds ₹25,000.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loadingDocs && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking your document vault…
        </div>
      )}

      {/* Load error — non-blocking, user can still upload fresh */}
      {loadError && !loadingDocs && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Could not load saved documents ({loadError}). Please upload below.
        </div>
      )}

      {/* "Docs found" summary */}
      {!loadingDocs && existingDocs.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          {existingDocs.length} document{existingDocs.length > 1 ? "s" : ""}{" "}
          found in your vault. Review and give consent to use them for this
          shipment.
        </div>
      )}

      {!loadingDocs && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Document Progress</p>

              <p className="text-sm text-muted-foreground">
                {
                  DOC_CONFIGS.filter(
                    (c) =>
                      c.alwaysRequired ||
                      (c.valueThresholdRequired && iecRequired),
                  ).filter((c) => !!kycDocs?.[c.key]).length
                }
                {" / "}
                {
                  DOC_CONFIGS.filter(
                    (c) =>
                      c.alwaysRequired ||
                      (c.valueThresholdRequired && iecRequired),
                  ).length
                }{" "}
                required documents completed
              </p>
            </div>

            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
        </div>
      )}

      {/* Required docs */}
      {!loadingDocs && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Required Documents</h3>

              <p className="text-sm text-muted-foreground">
                Documents mandatory for customs clearance and export compliance.
              </p>
            </div>

            {DOC_CONFIGS.filter(
              (c) =>
                c.alwaysRequired || (c.valueThresholdRequired && iecRequired),
            ).map((config) => (
              <DocSection
                key={config.key}
                config={config}
                isRequired={true}
                existingDoc={existingByKey[config.key] ?? null}
                formValue={kycDocs?.[config.key] ?? null}
                consentGiven={consents[config.key] ?? false}
                isReplacing={replacing[config.key] ?? false}
                onConsentChange={handleConsentChange(config.key)}
                onStartReplace={handleStartReplace(config.key)}
                onFormValueChange={handleFormValueChange(config.key)}
                error={kycErrors?.[config.key]?.message}
              />
            ))}
          </div>

          {/* Optional docs — always show IEC here if not already required */}
          {DOC_CONFIGS.filter(
            (c) =>
              !c.alwaysRequired && !(c.valueThresholdRequired && iecRequired),
          ).length > 0 && (
            <>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Optional Documents</h3>

                  <p className="text-sm text-muted-foreground">
                    Additional business documents that may be useful during
                    processing.
                  </p>
                </div>
                {DOC_CONFIGS.filter(
                  (c) =>
                    !c.alwaysRequired &&
                    !(c.valueThresholdRequired && iecRequired),
                ).map((config) => (
                  <DocSection
                    key={config.key}
                    config={config}
                    isRequired={false}
                    existingDoc={existingByKey[config.key] ?? null}
                    formValue={kycDocs?.[config.key] ?? null}
                    consentGiven={consents[config.key] ?? false}
                    isReplacing={replacing[config.key] ?? false}
                    onConsentChange={handleConsentChange(config.key)}
                    onStartReplace={handleStartReplace(config.key)}
                    onFormValueChange={handleFormValueChange(config.key)}
                    error={undefined}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
