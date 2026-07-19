// components/kyc/UploadZone.tsx
"use client";

import { useState } from "react";
import { useUploadThing } from "@/utils/uploadthing";
import { Upload, X, FileCheck2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FileMeta } from "@/types/booking.types";
import type { Party } from "@/types/booking";
import { saveKycDocAction } from "@/actions/book/kyc";
import type { KycDocConfig } from "@/lib/booking/kyc";

export function UploadZone({
  config,
  party,
  value,
  onDone,
  onClear,
  error,
}: {
  config: KycDocConfig;
  party: Party;
  value: FileMeta | null;
  onDone: (meta: FileMeta) => void;
  onClear: () => void;
  error?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const inputId = `upload-${config.key}`;

  const { startUpload } = useUploadThing("bookingDocument", {
    onClientUploadComplete: async (res) => {
      const file = res?.[0];
      if (!file) {
        setUploadErr("Upload completed but no file data returned.");
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
      const saveResult = await saveKycDocAction(party, { key: config.key, label: config.label, ...meta });
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

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <FileCheck2 className="h-5 w-5 shrink-0 text-green-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-green-900">{value.fileName}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-green-700 hover:text-destructive" onClick={onClear}>
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
          uploading ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40",
          displayError && "border-destructive/60 bg-destructive/5",
        )}
      >
        {uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
        <span className="text-sm text-muted-foreground">{uploading ? "Uploading…" : "Click to upload or drag & drop"}</span>
        <span className="text-xs text-muted-foreground">PDF, JPG, PNG · Max 16 MB</span>
        <input id={inputId} type="file" accept="image/*,.pdf" className="hidden" disabled={uploading} onChange={handleFile} />
      </label>
      {displayError && (
        <p className="flex items-center gap-1.5 text-xs text-destructive" aria-live="polite">
          <AlertCircle className="h-3.5 w-3.5" />
          {displayError}
        </p>
      )}
    </div>
  );
}