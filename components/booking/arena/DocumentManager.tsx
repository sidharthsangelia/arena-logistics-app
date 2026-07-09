"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useUploadThing } from "@/utils/uploadthing";
import {
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Upload,
  X,
  Inbox,
  AlertCircle,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toggleDocumentVisibility } from "@/actions/book/carrierTrackingDetails.action";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const DOC_TYPES = [
  "INVOICE",
  "AIRWAY_BILL",
  "PACKING_LIST",
  "CUSTOMS_DECLARATION",
  "CERTIFICATE_OF_ORIGIN",
  "INSURANCE_CERT",
  "POD",
  "OTHER",
] as const;

// Keep in sync with the shipmentDocument route in app/api/uploadthing/core.ts
const MAX_PDF_SIZE = 16 * 1024 * 1024;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const LABEL_MAX_LENGTH = 120;

type Doc = {
  id: string;
  docType: string;
  label: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType?: string | null;
  uploadedAt: Date;
  visibleToClient: boolean;
};

function validateFile(file: File): string | null {
  const isPdf = file.type === "application/pdf";
  const isImage = file.type.startsWith("image/");

  if (!isPdf && !isImage) {
    return "Only PDF or image files are supported.";
  }

  const limit = isPdf ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;
  if (file.size > limit) {
    return `File is too large. Max size is ${(limit / 1024 / 1024).toFixed(0)}MB.`;
  }

  return null;
}

function getLabelError(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed) return "Label is required.";
  if (trimmed.length > LABEL_MAX_LENGTH) {
    return `Label must be ${LABEL_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(date: Date): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DocumentManager({
  shipmentId,
  documents,
}: {
  shipmentId: string;
  documents: Doc[];
}) {
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]>("AIRWAY_BILL");
  const [label, setLabel] = useState("");
  const [visibleToClient, setVisibleToClient] = useState(true);
  const [pendingDocId, setPendingDocId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [inputKey, setInputKey] = useState(0); // bump to remount the <input>, allowing re-selecting the same file
  const dragCounter = useRef(0);

  // Validation only surfaces once the person has interacted with a field,
  // or after a submit attempt — never on first render.
  const [labelTouched, setLabelTouched] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);

  const labelError = getLabelError(label);
  const showLabelError = (labelTouched || attemptedSubmit) && !!labelError;
  const showFileRequiredError = attemptedSubmit && !file && !fileError;

  const { startUpload } = useUploadThing("shipmentDocument", {
    headers: () => ({
      "x-shipment-id": shipmentId,
      "x-doc-type": docType,
      "x-doc-label": label.trim(),
      "x-visible-to-client": String(visibleToClient),
    }),
    onUploadProgress: (p) => setProgress(p),
    onUploadError: (error) => {
      const message = error.message || "Upload failed. Please try again.";
      setUploadErrorMessage(message);
      toast.error(message);
      setUploading(false);
      setProgress(0);
    },
    onClientUploadComplete: () => {
      // The document row is already created server-side in onUploadComplete —
      // we just need to refresh the page's data.
      toast.success("Document uploaded");
      setLabel("");
      setFile(null);
      setFileError(null);
      setInputKey((k) => k + 1);
      setUploading(false);
      setProgress(0);
      setAttemptedSubmit(false);
      setLabelTouched(false);
      setUploadErrorMessage(null);
      router.refresh();
    },
  });

  const sortedDocuments = useMemo(
    () =>
      [...documents].sort(
        (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      ),
    [documents],
  );

  function applyPickedFile(picked: File | null) {
    if (!picked) return;
    setUploadErrorMessage(null);
    const validationError = validateFile(picked);
    if (validationError) {
      setFile(null);
      setFileError(validationError);
      return;
    }
    setFile(picked);
    setFileError(null);
  }

  function handleRemoveFile() {
    setFile(null);
    setFileError(null);
    setInputKey((k) => k + 1);
  }

  async function handleUpload() {
    setAttemptedSubmit(true);
    setLabelTouched(true);
    setUploadErrorMessage(null);

    if (!file) {
      // No toast here — the dropzone itself shows the "file required" state.
      return;
    }
    const validationError = validateFile(file);
    if (validationError) {
      setFileError(validationError);
      return;
    }
    if (labelError) {
      // No toast here — the label field itself shows the error state.
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      await startUpload([file]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed. Please try again.";
      setUploadErrorMessage(message);
      toast.error(message);
      setUploading(false);
      setProgress(0);
    }
  }

  function handleToggleVisibility(doc: Doc) {
    setPendingDocId(doc.id);
    startTransition(async () => {
      try {
        await toggleDocumentVisibility(doc.id, !doc.visibleToClient);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update visibility.");
      } finally {
        setPendingDocId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Upload card */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-[11px] text-muted-foreground">
            <span className="text-destructive">*</span> Required
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-type" className="text-xs text-muted-foreground">
                Document type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={docType}
                onValueChange={(v) => setDocType(v as typeof docType)}
                disabled={uploading}
              >
                <SelectTrigger id="doc-type" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="doc-label" className="text-xs text-muted-foreground">
                  Label <span className="text-destructive">*</span>
                </Label>
                {label.length > 0 && (
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      label.trim().length > LABEL_MAX_LENGTH
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {label.trim().length}/{LABEL_MAX_LENGTH}
                  </span>
                )}
              </div>
              <Input
                id="doc-label"
                value={label}
                placeholder="e.g. AWB - Aramex"
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => setLabelTouched(true)}
                disabled={uploading}
                aria-required="true"
                aria-invalid={showLabelError}
                aria-describedby={showLabelError ? "doc-label-error" : undefined}
                className={cn(
                  "h-9",
                  showLabelError && "border-destructive focus-visible:ring-destructive",
                )}
              />
              {showLabelError && (
                <p id="doc-label-error" className="flex items-center gap-1 text-[11px] text-destructive">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {labelError}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              {visibleToClient ? (
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div className="space-y-0.5">
                <Label htmlFor="visible-toggle" className="text-xs font-medium">
                  {visibleToClient ? "Visible to client" : "Internal only"}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {visibleToClient
                    ? "The client will see this document."
                    : "Hidden from the client portal."}
                </p>
              </div>
            </div>
            <Switch
              id="visible-toggle"
              checked={visibleToClient}
              onCheckedChange={setVisibleToClient}
              disabled={uploading}
            />
          </div>

          {/* Dropzone */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              File <span className="text-destructive">*</span>
            </Label>
            <div
              className={cn(
                "rounded-lg border-2 border-dashed p-6 text-center transition-colors",
                fileError || showFileRequiredError
                  ? "border-destructive bg-destructive/5"
                  : file
                    ? "border-primary bg-primary/5"
                    : isDraggingOver
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/20 hover:border-primary/40",
              )}
              aria-invalid={!!fileError || showFileRequiredError}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDragEnter={(e) => {
                if (uploading) return;
                e.preventDefault();
                dragCounter.current += 1;
                setIsDraggingOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                dragCounter.current -= 1;
                if (dragCounter.current <= 0) {
                  dragCounter.current = 0;
                  setIsDraggingOver(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                dragCounter.current = 0;
                setIsDraggingOver(false);
                if (uploading) return;
                const dropped = e.dataTransfer.files?.[0] ?? null;
                applyPickedFile(dropped);
              }}
            >
              {file ? (
                <div className="space-y-2">
                  {file.type === "application/pdf" ? (
                    <FileText className="mx-auto h-8 w-8 text-primary" />
                  ) : (
                    <ImageIcon className="mx-auto h-8 w-8 text-primary" />
                  )}
                  <p className="break-all text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  {!uploading && (
                    <Button variant="ghost" size="sm" onClick={handleRemoveFile}>
                      <X className="mr-1 h-4 w-4" />
                      Remove
                    </Button>
                  )}
                </div>
              ) : (
                <label htmlFor="shipment-doc-upload" className="cursor-pointer">
                  <Upload
                    className={cn(
                      "mx-auto mb-3 h-8 w-8",
                      showFileRequiredError ? "text-destructive" : "text-muted-foreground",
                    )}
                  />
                  <p className="font-medium">Click to upload or drag a file here</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF up to {MAX_PDF_SIZE / 1024 / 1024}MB, images up to{" "}
                    {MAX_IMAGE_SIZE / 1024 / 1024}MB
                  </p>
                  <input
                    key={inputKey}
                    id="shipment-doc-upload"
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      applyPickedFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            {fileError && (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {fileError}
              </p>
            )}
            {showFileRequiredError && (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircle className="h-3 w-3 shrink-0" />
                Select a file to upload.
              </p>
            )}
          </div>

          {uploadErrorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-2">
                <span>{uploadErrorMessage}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1 text-xs"
                  disabled={uploading || !file}
                  onClick={handleUpload}
                >
                  <RotateCw className="h-3 w-3" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {uploading && (
            <div className="space-y-1.5">
              <Progress value={progress} className="h-1.5" />
              <p className="text-right text-[11px] text-muted-foreground">
                Uploading… {progress}%
              </p>
            </div>
          )}

          <Button disabled={uploading} className="w-full" onClick={handleUpload}>
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload document
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Existing docs */}
      {sortedDocuments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center">
          <Inbox className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        </div>
      ) : (
        <TooltipProvider delayDuration={200}>
          <div className="space-y-2">
            {sortedDocuments.map((doc, i) => {
              const isImage = doc.mimeType?.startsWith?.("image/") ?? false;
              const rowPending = isPending && pendingDocId === doc.id;
              return (
                <div key={doc.id}>
                  {i > 0 && <Separator className="my-2 md:hidden" />}
                  <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {isImage ? (
                        <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-medium text-foreground">
                            {doc.label}
                          </p>
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                            {doc.docType.replaceAll("_", " ")}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {doc.fileName} · {formatBytes(doc.fileSize)} · {formatDate(doc.uploadedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={rowPending}
                            onClick={() => handleToggleVisibility(doc)}
                          >
                            {rowPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : doc.visibleToClient ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {doc.visibleToClient
                            ? "Visible to client — click to hide"
                            : "Hidden from client — click to show"}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open in new tab</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}