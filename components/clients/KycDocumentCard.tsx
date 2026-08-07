"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileText, ImageIcon, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { deleteKycDocumentAction } from "@/actions/documentVault/clientsDocument.action";
import { KycDocType } from "@/lib/validations/clientsDocument.schema";
import Link from "next/link";

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

  const fileIsImage = isImage(mimeType);

  // One row per file. The type label lives on the group heading above, so it is
  // not repeated here; what is left is the document's own name, its file, and a
  // delete that appears on hover.
  return (
    <>
      <Link
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative -mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted/50"
      >
        {fileIsImage ? (
          <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {label}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {fileName} · {formatBytes(fileSize)} · Added{" "}
            {formatDate(uploadedAt)}
          </p>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Delete document</span>
        </Button>

        {deleting && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/70">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </Link>

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