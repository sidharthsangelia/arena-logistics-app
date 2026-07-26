/**
 * lib/documentVault/config.ts
 *
 * Pure, shared configuration for both document vault tables: the tenant's own
 * client documents and the Arena-side cross-tenant view. Safe to import from
 * client and server alike: no "server-only", no prisma, no JSX.
 *
 * Document type labels are not redefined here. They already live with the upload
 * schema in lib/validations/clientsDocument.schema.ts, and a second copy is how
 * the arena page ended up filtering against a doc-type list that was missing
 * COMPANY_PAN and LUT.
 */

import type { KycDocType } from "@/generated/prisma";
import {
  KYC_DOC_TYPES,
  KYC_DOC_TYPE_LABELS,
} from "@/lib/validations/clientsDocument.schema";

// ---------------------------------------------------------------------------
// Pagination + sorting
// ---------------------------------------------------------------------------

export const VAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_VAULT_PAGE_SIZE = 25;

/** Columns both views can sort by. */
export type VaultSortField =
  | "uploadedAt"
  | "label"
  | "docType"
  | "fileSize"
  | "clientName";

export const VAULT_SORT_FIELDS: readonly VaultSortField[] = [
  "uploadedAt",
  "label",
  "docType",
  "fileSize",
  "clientName",
];

export const DEFAULT_VAULT_SORT: VaultSortField = "uploadedAt";

export function coerceVaultSortField(value: unknown): VaultSortField {
  return VAULT_SORT_FIELDS.includes(value as VaultSortField)
    ? (value as VaultSortField)
    : DEFAULT_VAULT_SORT;
}

/** The tenant columns plus organisation, which only exists across tenants. */
export type AdminVaultSortField =
  | "uploadedAt"
  | "label"
  | "docType"
  | "fileSize"
  | "orgName"
  | "clientName";

export const ADMIN_VAULT_SORT_FIELDS: readonly AdminVaultSortField[] = [
  "uploadedAt",
  "label",
  "docType",
  "fileSize",
  "orgName",
  "clientName",
];

export const DEFAULT_ADMIN_VAULT_SORT: AdminVaultSortField = "uploadedAt";

export function coerceAdminVaultSortField(value: unknown): AdminVaultSortField {
  return ADMIN_VAULT_SORT_FIELDS.includes(value as AdminVaultSortField)
    ? (value as AdminVaultSortField)
    : DEFAULT_ADMIN_VAULT_SORT;
}

// ---------------------------------------------------------------------------
// Doc type filter
// ---------------------------------------------------------------------------

/** "" means every type. Anything not in the enum is treated as "". */
export type VaultDocTypeFilter = KycDocType | "";

export function coerceVaultDocTypeFilter(value: unknown): VaultDocTypeFilter {
  const upper = typeof value === "string" ? value.toUpperCase() : "";
  return (KYC_DOC_TYPES as readonly string[]).includes(upper)
    ? (upper as KycDocType)
    : "";
}

/** The one-tap chips above the table, for the types ops reaches for most. */
export const VAULT_QUICK_DOC_TYPES: readonly {
  label: string;
  value: KycDocType;
}[] = [
  { label: "GST", value: "GST_CERTIFICATE" },
  { label: "IEC", value: "IEC_CODE" },
  { label: "PAN", value: "PAN_CARD" },
  { label: "Bank", value: "BANK_STATEMENT" },
  { label: "Cheque", value: "CANCELLED_CHEQUE" },
];

/**
 * Doc types whose human label contains the search term, so typing "GST" or
 * "cheque" finds documents by their type and not only by their filename.
 *
 * This started as tenant-only behaviour; both views use it now, because a search
 * box that works differently on two pages showing the same kind of data is just
 * a bug you have not hit yet.
 */
export function matchingDocTypeLabels(search: string): KycDocType[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return [];
  return KYC_DOC_TYPES.filter((type) =>
    KYC_DOC_TYPE_LABELS[type].toLowerCase().includes(needle),
  ) as KycDocType[];
}

// ---------------------------------------------------------------------------
// Row DTOs
// ---------------------------------------------------------------------------

/**
 * One row of the tenant's own client-document table. `uploadedAt` is an ISO
 * string because the tables are client components.
 */
export interface VaultDocumentRow {
  id: string;
  label: string;
  description: string | null;
  docType: KycDocType;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  client: {
    id: string;
    companyName: string;
    contactName: string | null;
  };
}

/**
 * One row of the Arena document vault: the tenant row plus the org the document
 * belongs to.
 */
export interface AdminVaultDocumentRow extends VaultDocumentRow {
  org: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface VaultListParams {
  page?: number;
  pageSize?: number;
  sortField?: VaultSortField;
  sortDir?: "asc" | "desc";
  docType?: VaultDocTypeFilter;
  search?: string;
}

export interface AdminVaultListParams extends Omit<VaultListParams, "sortField"> {
  sortField?: AdminVaultSortField;
}

export interface VaultPage {
  rows: VaultDocumentRow[];
  total: number;
  pageCount: number;
  page: number;
  pageSize: number;
}

export interface AdminVaultPage extends Omit<VaultPage, "rows"> {
  rows: AdminVaultDocumentRow[];
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
