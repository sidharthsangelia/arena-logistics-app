"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FileText, ImageIcon, Building2 } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  KYC_DOC_TYPE_LABELS,
  KYC_DOC_TYPES,
} from "@/lib/validations/clientsDocument.schema";
import type { AdminVaultDocumentRow } from "@/actions/documentVault/documentVaultAdmin.action";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DOC_TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  ...KYC_DOC_TYPES.map((t) => ({ value: t, label: KYC_DOC_TYPE_LABELS[t] })),
] as const;

const VAULT_BASE_PATH = "/arena-dashboard/document-vault";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(new Date(d));
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  documents: AdminVaultDocumentRow[];
  page: number;
  total: number;
  pageSize: number;
  query: string;
  docType: KycDocType | "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminVaultTable({
  documents,
  page,
  total,
  pageSize,
  query,
  docType,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [searchValue, setSearchValue] = useState(query);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setSearchValue(query);
  }, [query]);

  const searchParamsString = searchParams.toString();

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParamsString);

      if (searchValue.trim()) {
        params.set("q", searchValue.trim());
      } else {
        params.delete("q");
      }

      params.delete("page");

      const nextUrl = `${VAULT_BASE_PATH}?${params.toString()}`;
      const currentUrl = `${VAULT_BASE_PATH}?${searchParamsString}`;

      if (nextUrl === currentUrl) return;

      startTransition(() => {
        router.replace(nextUrl);
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [searchValue, searchParamsString, router]);

  // ── URL param helpers ──────────────────────────────────────────────────────

  const updateParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) params.delete(key);
      else params.set(key, value);
    });
    params.delete("page");
    router.replace(`${VAULT_BASE_PATH}?${params.toString()}`);
  };

  const changePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (newPage <= 1) params.delete("page");
    else params.set("page", String(newPage));
    router.replace(`${VAULT_BASE_PATH}?${params.toString()}`);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search documents, organisations, companies..."
          value={searchValue}
          className="h-8 w-[320px] text-sm"
          onChange={(e) => setSearchValue(e.target.value)}
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
                  docType: docType === chip.value ? undefined : chip.value,
                })
              }
            >
              {chip.label}
            </Button>
          ))}
        </div>

        <span className="ml-auto text-xs text-muted-foreground">
          {total.toLocaleString()} document{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs uppercase tracking-wide">Document</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Type</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Organisation</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Client</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">File</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Size</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Uploaded</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                  No documents match your filters.
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <TableRow key={doc.id}>
                  {/* Label + open link */}
                  <TableCell>
                    <Link
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                    >
                      <span className="block text-sm font-medium leading-tight">
                        {doc.label}
                      </span>
                    </Link>

                    {doc.description && (
                      <span className="mt-0.5 block max-w-[200px] truncate text-[11px] text-muted-foreground">
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

                  {/* Organisation — links to the business associate detail page */}
                  <TableCell>
                    <Link
                      href={`/arena-dashboard/business-associates/${doc.org.id}`}
                      className="group flex items-center gap-1.5"
                    >
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="block text-sm group-hover:underline">
                        {doc.org.name}
                      </span>
                    </Link>
                  </TableCell>

                  {/* Client */}
                  <TableCell>
                    <span className="block text-sm">{doc.client.companyName}</span>
                    {doc.client.contactName && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
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