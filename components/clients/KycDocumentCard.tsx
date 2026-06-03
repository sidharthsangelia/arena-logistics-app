"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  ImageIcon,
  ExternalLink,
  Trash2,
  Loader2,
  MoreVertical,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteKycDocumentAction } from "@/actions/clientsDocument.action";
import { KycDocType, KYC_DOC_TYPE_LABELS } from "@/lib/validations/clientsDocument.schema";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type KycDocumentCardProps = {
  id:          string;
  docType:     KycDocType;
  label:       string;
  description: string | null;
  fileUrl:     string;
  fileName:    string;
  fileSize:    number;
  mimeType:    string;
  uploadedAt:  Date;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day:   "numeric",
    month: "short",
    year:  "numeric",
  }).format(d);
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function KycDocumentCard({
  id,
  docType,
  label,
  description,
  fileUrl,
  fileName,
  fileSize,
  mimeType,
  uploadedAt,
}: KycDocumentCardProps) {
  const [deleting, setDeleting]         = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteKycDocumentAction(id);
    if (result.success) {
      toast.success("Document deleted.");
    } else {
      toast.error(result.message);
      setDeleting(false);
    }
    // Revalidation from the server action will update the page.
    // No need to setDeleting(false) on success — card unmounts.
  }

  const typeLabel  = KYC_DOC_TYPE_LABELS[docType];
  const fileIsImage = isImage(mimeType);

  return (
    <>
      <div className="group flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40">

        {/* File type icon */}
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
          {fileIsImage ? (
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-tight">
                {label}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {fileName} · {formatBytes(fileSize)}
              </p>
            </div>

            {/* Actions menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                  <span className="sr-only">Document actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem asChild>
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open file
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setConfirmOpen(true)}
                  disabled={deleting}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Badges row */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
              {typeLabel}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              Added {formatDate(uploadedAt)}
            </span>
          </div>

          {/* Description */}
          {description && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {/* Loading overlay while deleting */}
        {deleting && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{label}</strong> will be permanently deleted from the
              vault and removed from storage. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}