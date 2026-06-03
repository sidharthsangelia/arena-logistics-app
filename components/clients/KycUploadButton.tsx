"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUploadThing } from "@/utils/uploadthing"; // generated hook
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KYC_DOC_TYPE_HINTS,
  KYC_DOC_TYPE_LABELS,
  KYC_DOC_TYPES,
  kycDocumentFormSchema,
  KycDocumentFormValues,
} from "@/lib/validations/clientsDocument.schema";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";

// ─────────────────────────────────────────────────────────────────────────────
// Accepted MIME types (PDF + common image formats)
// ─────────────────────────────────────────────────────────────────────────────

const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
].join(",");

type Props = {
  clientId: string;
};

export default function KycUploadButton({ clientId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const form = useForm<KycDocumentFormValues>({
    resolver: zodResolver(kycDocumentFormSchema),
    defaultValues: { docType: undefined, label: "", description: "" },
  });

  const selectedType = form.watch("docType");

  // ── UploadThing hook ──────────────────────────────────────────────────────
  // We pass the required metadata as custom headers so the server middleware
  // can read them before any bytes are transferred.
  const { startUpload } = useUploadThing("kycDocument", {
    headers: () => ({
      "x-client-id": clientId,
      "x-doc-type": form.getValues("docType"),
      "x-doc-label": form.getValues("label"),
    }),
    onUploadError: (error) => {
      console.error("[KYC upload error]", error);
      toast.error("Upload failed. Please try again.");
      setUploading(false);
    },
    onClientUploadComplete: () => {
      toast.success("Document uploaded successfully.");
      setUploading(false);
      setOpen(false);
      form.reset();
      setFile(null);
      router.refresh();
    },
  });

  // ── Form submit ──────────────────────────────────────────────────────────
  async function onSubmit(values: KycDocumentFormValues) {
    if (!file) {
      toast.error("Please select a file to upload.");
      return;
    }
    setUploading(true);
    await startUpload([file]);
  }

  // ── File input handler ───────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;

    // Size guard (16 MB for PDFs, 8 MB for images)
    const maxBytes =
      picked.type === "application/pdf" ? 16 * 1024 * 1024 : 8 * 1024 * 1024;

    if (picked.size > maxBytes) {
      toast.error(
        `File too large. Max ${picked.type === "application/pdf" ? "16" : "8"} MB.`,
      );
      return;
    }
    setFile(picked);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Upload document
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!uploading) {
            setOpen(v);
            if (!v) {
              form.reset();
              setFile(null);
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload KYC document</DialogTitle>
            <DialogDescription>
              Add a verified document to this client's vault. Accepted formats:
              PDF, JPG, PNG, WebP, TIFF — max 16 MB.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 pt-1"
          >
            {/* Document type */}
            <Controller
              control={form.control}
              name="docType"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Document type</FieldLabel>

                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);

                      const current = form.getValues("label");

                      if (!current) {
                        form.setValue(
                          "label",
                          KYC_DOC_TYPE_LABELS[
                            v as keyof typeof KYC_DOC_TYPE_LABELS
                          ],
                          {
                            shouldValidate: false,
                          },
                        );
                      }
                    }}
                  >
                    <SelectTrigger aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder="Select type…" />
                    </SelectTrigger>

                    <SelectContent>
                      {KYC_DOC_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {KYC_DOC_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedType && (
                    <FieldDescription>
                      {KYC_DOC_TYPE_HINTS[selectedType]}
                    </FieldDescription>
                  )}

                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Label */}
            <Controller
              control={form.control}
              name="label"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Label</FieldLabel>

                  <Input
                    {...field}
                    placeholder="e.g. GST Certificate – FY 2024-25"
                    aria-invalid={fieldState.invalid}
                  />

                  <FieldDescription>
                    A short name to identify this document in the vault.
                  </FieldDescription>

                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Description (optional) */}
            <Controller
              control={form.control}
              name="description"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>
                    Notes
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      optional
                    </span>
                  </FieldLabel>

                  <Textarea
                    {...field}
                    rows={2}
                    className="resize-none text-sm"
                    placeholder="Any additional notes about this document…"
                    aria-invalid={fieldState.invalid}
                  />

                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* File picker */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium leading-none">File</p>
              <label
                htmlFor="kyc-file-input"
                className={`
                    flex cursor-pointer flex-col items-center justify-center gap-2
                    rounded-lg border-2 border-dashed px-4 py-6 text-center
                    transition-colors
                    ${
                      file
                        ? "border-primary/40 bg-primary/5"
                        : "border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/30"
                    }
                  `}
              >
                {file ? (
                  <>
                    <span className="text-sm font-medium text-foreground line-clamp-1">
                      {file.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                      <span
                        className="text-primary underline underline-offset-2"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setFile(null);
                        }}
                      >
                        Remove
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Click to select file
                    </span>
                  </>
                )}
                <input
                  id="kyc-file-input"
                  type="file"
                  accept={ACCEPTED_MIME}
                  className="sr-only"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => {
                  setOpen(false);
                  form.reset();
                  setFile(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={uploading || !file}>
                {uploading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Upload
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
