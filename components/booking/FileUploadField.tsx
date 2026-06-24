"use client";

import { useRef, useState } from "react";
import { File, Loader2, Upload, X } from "lucide-react";

import { cn } from "@/lib/utils";
 
 

import type { FileMeta } from "@/types/booking";
import { useUploadThing } from "@/utils/uploadthing";

interface FileUploadFieldProps {
  value: FileMeta | null;
  onChange: (file: FileMeta | null) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}

export const ACCEPTED_DOC_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
 
export const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
 
export function validateDocFile(file: File): string | null {
  if (!ACCEPTED_DOC_MIME_TYPES.includes(file.type as (typeof ACCEPTED_DOC_MIME_TYPES)[number])) {
    return "Upload a PDF, PNG, JPEG, or WEBP file.";
  }
  if (file.size > MAX_DOC_SIZE_BYTES) {
    return "File is larger than 10MB.";
  }
  return null;
}
 

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUploadField({
  value,
  onChange,
  label = "Click to upload or drag and drop",
  hint = "PDF, PNG, JPEG or WEBP — max 10 MB",
  disabled = false,
  className,
}: FileUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const { startUpload } = useUploadThing("bookingDocument");

  const uploadSingleFile = async (file: File) => {
    const validationError = validateDocFile(file);

    if (validationError) {
      throw new Error(validationError);
    }

    const result = await startUpload([file]);

    if (!result?.length) {
      throw new Error("Upload failed.");
    }

    const uploaded = result[0];

    const meta: FileMeta = {
      fileUrl:
        uploaded.serverData.url,

      fileKey:
        uploaded.serverData.key,

      fileName:
        uploaded.serverData.fileName,

      fileSize:
        uploaded.serverData.fileSize,

      mimeType:
        uploaded.serverData.mimeType,
    };

    return meta;
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    setError(null);
    setUploading(true);

    try {
      const meta = await uploadSingleFile(file);

      onChange(meta);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const handleDrop = async (
    e: React.DragEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();

    if (disabled || uploading) return;

    const file = e.dataTransfer.files?.[0];

    if (!file) return;

    setError(null);
    setUploading(true);

    try {
      const meta = await uploadSingleFile(file);

      onChange(meta);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  if (value) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border bg-muted/40 px-3.5 py-3",
          className,
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <File className="h-4 w-4 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {value.fileName}
          </p>

          <p className="text-xs text-muted-foreground">
            {formatBytes(value.fileSize)}
          </p>
        </div>

        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={handleFileChange}
        aria-label={label}
      />

      <div
        role="button"
        tabIndex={disabled || uploading ? -1 : 0}
        onClick={() => {
          if (!disabled && !uploading) {
            inputRef.current?.click();
          }
        }}
        onKeyDown={(e) => {
          if (
            (e.key === "Enter" || e.key === " ") &&
            !disabled &&
            !uploading
          ) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-7",
          "text-center transition-colors select-none",
          disabled || uploading
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:border-primary hover:bg-muted/30",
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Uploading...
            </p>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground" />

            <div>
              <p className="text-sm font-medium">
                {label}
              </p>

              {hint && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {hint}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}