"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  FileText,
  ImageIcon,
  ExternalLink,
  Trash2,
  Building2,
} from "lucide-react";
import { toast } from "sonner";

import type { KycDocType } from "@/generated/prisma";


import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { KYC_DOC_TYPE_LABELS, KYC_DOC_TYPES } from "@/lib/validations/clientsDocument.schema";
import { VaultDocumentRow } from "@/actions/documentVault/documentValut.action";
import { deleteKycDocumentAction } from "@/actions/documentVault/clientsDocument.action";



// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DOC_TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  ...KYC_DOC_TYPES.map((t) => ({ value: t, label: KYC_DOC_TYPE_LABELS[t] })),
] as const;

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
    day:   "2-digit",
    month: "short",
    year:  "2-digit",
  }).format(new Date(d));
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  documents: VaultDocumentRow[];
  page:      number;
  total:     number;
  pageSize:  number;
  query:     string;
  docType:   KycDocType | "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function VaultTable({
  documents,
  page,
  total,
  pageSize,
  query,
  docType,
}: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const totalPages   = Math.max(1, Math.ceil(total / pageSize));

  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const allIds      = documents.map((d) => d.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  // ── Selection handlers ─────────────────────────────────────────────────────

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(allIds));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── Bulk delete ────────────────────────────────────────────────────────────

  const handleBulkDelete = () => {
    startTransition(async () => {
      const ids    = Array.from(selected);
      const errors: string[] = [];

      // deleteKycDocumentAction handles one doc at a time (also deletes from UT)
      await Promise.all(
        ids.map(async (id) => {
          const result = await deleteKycDocumentAction(id);
          if (!result.success) errors.push(id);
        }),
      );

      if (errors.length === 0) {
        toast.success(
          `${ids.length} document${ids.length !== 1 ? "s" : ""} deleted`,
        );
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(
          `${errors.length} deletion${errors.length !== 1 ? "s" : ""} failed. Please try again.`,
        );
      }
    });
  };

  // ── URL param helpers ──────────────────────────────────────────────────────

  const updateParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) params.delete(key);
      else params.set(key, value);
    });
    params.delete("page");
    router.push(`/document-vault?${params.toString()}`);
  };

  const changePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (newPage <= 1) params.delete("page");
    else params.set("page", String(newPage));
    router.push(`/document-vault?${params.toString()}`);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Filter bar / bulk action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {someSelected ? (
          /* ── Bulk action mode ── */
          <>
            <span className="text-sm text-muted-foreground">
              {selected.size} selected
            </span>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  className="h-8"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete {selected.size}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {selected.size} document{selected.size !== 1 ? "s" : ""}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Selected document{selected.size !== 1 ? "s" : ""} will be
                    permanently removed from the vault and storage. This cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleBulkDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
          </>
        ) : (
          /* ── Filter mode ── */
          <>
           <Input
  placeholder="Search documents, clients, GST, IEC, PAN..."
  defaultValue={query}
  className="h-8 w-[320px] text-sm"
  onChange={(e) => {
    const params = new URLSearchParams(
      searchParams.toString()
    );

    const value = e.target.value;

    if (value) {
      params.set("q", value);
    } else {
      params.delete("q");
    }

    params.delete("page");

    router.replace(`/document-vault?${params.toString()}`);
  }}
/>

            <Select
              value={docType || "all"}
              onValueChange={(value) =>
                updateParams({ docType: value === "all" ? undefined : value })
              }
            >
              <SelectTrigger className="h-8 w-[180px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap gap-2">
  {[
    { label: "GST", value: "GST_CERTIFICATE" },
    { label: "IEC", value: "IEC_CODE" },
    { label: "PAN", value: "PAN_CARD" },
    { label: "Bank", value: "BANK_STATEMENT" },
    { label: "Cheque", value: "CANCELLED_CHEQUE" },
  ].map((chip) => (
    <Button
      key={chip.value}
      variant={docType === chip.value ? "default" : "outline"}
      size="sm"
      className="h-7"
      onClick={() =>
        updateParams({
          docType:
            docType === chip.value
              ? undefined
              : chip.value,
        })
      }
    >
      {chip.label}
    </Button>
  ))}
</div>
          </>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {total.toLocaleString()} document{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-10 pl-4">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Document</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Type</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Client</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">File</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Size</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Uploaded</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {documents.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  No documents match your filters.
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <TableRow
                  key={doc.id}
                  data-state={selected.has(doc.id) ? "selected" : undefined}
                >
                  {/* Checkbox */}
                  <TableCell className="pl-4">
                    <Checkbox
                      checked={selected.has(doc.id)}
                      onCheckedChange={() => toggleOne(doc.id)}
                      aria-label={`Select ${doc.label}`}
                    />
                  </TableCell>

                  {/* Label + open link */}
                  <TableCell>
                    <Link    href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium hover:underline ">
                     <span className="block text-sm font-medium leading-tight">
                      {doc.label}
                    </span>
                    </Link>
                   
                    {doc.description && (
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground max-w-[200px]">
                        {doc.description}
                      </span>
                    )}
                 
                  </TableCell>

                  {/* Doc type badge */}
                  <TableCell>
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {KYC_DOC_TYPE_LABELS[doc.docType]}
                    </Badge>
                  </TableCell>

                  {/* Client */}
                  <TableCell>
                    <Link
                      href={`/clients/${doc.client.id}`}
                      className="group flex items-center gap-1.5"
                    >
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="block text-sm group-hover:underline">
                        {doc.client.companyName}
                      </span>
                    </Link>
                    {doc.client.contactName && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground pl-5">
                        {doc.client.contactName}
                      </span>
                    )}
                  </TableCell>

                  {/* File name + icon */}
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      {isImage(doc.mimeType) ? (
                        <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="max-w-[140px] truncate">{doc.fileName}</span>
                    </span>
                  </TableCell>

                  {/* Size */}
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {formatBytes(doc.fileSize)}
                  </TableCell>

                  {/* Uploaded date */}
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(doc.uploadedAt)}
                  </TableCell>

                  {/* Single-row delete */}
                  <TableCell>
                    <SingleDeleteButton
                      id={doc.id}
                      label={doc.label}
                      onDeleted={() => router.refresh()}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => changePage(page - 1)}
          >
            ← Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => changePage(page + 1)}
          >
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SingleDeleteButton
//
// Inline delete with confirmation — avoids polluting VaultTable state.
// ─────────────────────────────────────────────────────────────────────────────

function SingleDeleteButton({
  id,
  label,
  onDeleted,
}: {
  id:        string;
  label:     string;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteKycDocumentAction(id);
      if (result.success) {
        toast.success("Document deleted.");
        onDeleted();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          disabled={isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Delete {label}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete document?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{label}</strong> will be permanently deleted from the vault
            and storage. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}