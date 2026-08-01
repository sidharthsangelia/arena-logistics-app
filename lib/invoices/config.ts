/**
 * lib/invoices/config.ts
 *
 * Pure, shared configuration for the invoice feature. Safe to import from both
 * client and server (no "server-only", no prisma). Holds the single source of
 * truth for statuses, badge tones, sortable fields, page sizes and the zod
 * schemas the server actions validate against.
 */

import { z } from "zod";
import { InvoiceStatus } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Pagination + sorting
// ---------------------------------------------------------------------------

export const INVOICE_PAGE_SIZE_OPTIONS = [10, 20, 30, 50] as const;
export const DEFAULT_INVOICE_PAGE_SIZE = 20;

/** Page number, floored to a positive integer. */
export function coerceInvoicePage(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.floor(value as number)
    : 1;
}

/** Page size, restricted to the sizes the picker offers. */
export function coerceInvoicePageSize(value: number | undefined): number {
  return (INVOICE_PAGE_SIZE_OPTIONS as readonly number[]).includes(value as number)
    ? (value as number)
    : DEFAULT_INVOICE_PAGE_SIZE;
}

export type InvoiceSortField =
  | "issueDate"
  | "dueDate"
  | "amount"
  | "invoiceNumber"
  | "status"
  | "createdAt";

export const INVOICE_SORT_FIELDS: readonly InvoiceSortField[] = [
  "issueDate",
  "dueDate",
  "amount",
  "invoiceNumber",
  "status",
  "createdAt",
];

export function coerceInvoiceSortField(value: unknown): InvoiceSortField {
  return INVOICE_SORT_FIELDS.includes(value as InvoiceSortField)
    ? (value as InvoiceSortField)
    : "issueDate";
}

// ---------------------------------------------------------------------------
// Shared DTOs — the shape the UI renders. Defined here (a pure module) so both
// the server-only query layer and client components can reference them without
// pulling "server-only" into the client bundle.
// ---------------------------------------------------------------------------

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string | null;
  notes: string | null;

  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;

  orgId: string;
  orgName: string;

  shipmentId: string | null;
  shipmentNumber: string | null;

  createdByName: string | null;
  paidByName: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface InvoiceSummary {
  total: number;
  outstandingAmount: number;
  outstandingCount: number;
  overdueCount: number;
  paidCount: number;
  paidAmount: number;
  currency: string;
}

export interface InvoicePage {
  rows: InvoiceRow[];
  total: number;
  pageCount: number;
  page: number;
  pageSize: number;
  summary: InvoiceSummary;
}

export interface InvoiceListParams {
  page?: number;
  pageSize?: number;
  sortField?: InvoiceSortField;
  sortDir?: "asc" | "desc";
  statusFilter?: InvoiceStatusFilter;
  search?: string;
  /** Arena only: narrow to a single org. Tenant scope is forced separately. */
  orgId?: string | null;
}

// ---------------------------------------------------------------------------
// The tenant feed — booking invoices and account bills in one list
// ---------------------------------------------------------------------------
//
// A customer has two kinds of document from Arena: a tax invoice raised
// automatically for every shipment, and a bill raised by hand for anything
// else. They live in different tables (ShipmentInvoice / Invoice) with their
// own numbering and lifecycles, but from the customer's side they are one
// question — "what has Arena billed me?" — so /invoices shows one list with the
// kind as a tag, and the two tables are merged at read time.

export type InvoiceKind = "BOOKING" | "ACCOUNT";

export const INVOICE_KIND_FILTERS = ["ALL", "BOOKING", "ACCOUNT"] as const;
export type InvoiceKindFilter = (typeof INVOICE_KIND_FILTERS)[number];

export function coerceInvoiceKindFilter(value: unknown): InvoiceKindFilter {
  return (INVOICE_KIND_FILTERS as readonly string[]).includes(value as string)
    ? (value as InvoiceKindFilter)
    : "ALL";
}

/**
 * Sortable columns in the merged list.
 *
 * Deliberately short. Rows come from two tables and are merged in memory, so a
 * sort is only safe on a field where the JS comparator and the database agree
 * exactly — a date and a number do; a string under a database collation does
 * not, and a row would land on the wrong page. Finding one invoice by number is
 * what the search box is for.
 */
export type InvoiceFeedSortField = "issueDate" | "amount";

export function coerceInvoiceFeedSortField(value: unknown): InvoiceFeedSortField {
  return value === "amount" ? "amount" : "issueDate";
}

export interface InvoiceFeedRow {
  /** Kind-prefixed, because the two source tables number their ids separately. */
  id: string;
  kind: InvoiceKind;
  /** A booking document can be a credit note rather than an invoice. */
  isCreditNote: boolean;

  /** Null on a booking invoice the job has not numbered yet. */
  invoiceNumber: string | null;
  /** Already derived, so OVERDUE is decided once, on the server. */
  status: InvoiceViewStatus;

  amount: number;
  currency: string;
  issueDate: string;
  /** Account bills only. Booking invoices are settled at booking. */
  dueDate: string | null;

  shipmentId: string | null;
  shipmentNumber: string | null;

  fileUrl: string | null;
  fileName: string | null;
  /** Booking invoices only: numbered and rendered, or still being prepared. */
  preparing: boolean;
}

export interface InvoiceFeedPage {
  rows: InvoiceFeedRow[];
  total: number;
  pageCount: number;
  page: number;
  pageSize: number;
  summary: InvoiceSummary;
  /**
   * How many rows each kind holds under the CURRENT status filter and search,
   * so the kind switch can show what you would get before you click it.
   */
  kindCounts: Record<InvoiceKind, number>;
}

/**
 * Where the Download button points.
 *
 * Not the storage URL: the PDFs sit on another origin, where the browser
 * ignores `download` and shows the file instead of saving it. This route
 * streams the same bytes from our origin with an attachment disposition — see
 * app/api/invoices/[kind]/[id]/download/route.ts.
 */
export function invoiceDownloadHref(row: InvoiceFeedRow): string {
  const rawId = row.id.slice(row.id.indexOf(":") + 1);
  const kind = row.kind === "BOOKING" ? "booking" : "account";
  return `/api/invoices/${kind}/${encodeURIComponent(rawId)}/download`;
}

export interface InvoiceFeedParams {
  page?: number;
  pageSize?: number;
  sortField?: InvoiceFeedSortField;
  sortDir?: "asc" | "desc";
  statusFilter?: InvoiceStatusFilter;
  kindFilter?: InvoiceKindFilter;
  search?: string;
}

// ---------------------------------------------------------------------------
// Status — stored vs. displayed
// ---------------------------------------------------------------------------
//
// The DB stores only UNPAID / PAID / CANCELLED. "Overdue" is never stored: it is
// an unpaid invoice whose due date has passed. Deriving it means there is no
// background job to keep a status column honest.

export type InvoiceViewStatus = "UNPAID" | "PAID" | "CANCELLED" | "OVERDUE";

/** The values a filter control can hold, plus "ALL". */
export const INVOICE_STATUS_FILTERS = [
  "ALL",
  "UNPAID",
  "OVERDUE",
  "PAID",
  "CANCELLED",
] as const;
export type InvoiceStatusFilter = (typeof INVOICE_STATUS_FILTERS)[number];

export function coerceInvoiceStatusFilter(value: unknown): InvoiceStatusFilter {
  return (INVOICE_STATUS_FILTERS as readonly string[]).includes(value as string)
    ? (value as InvoiceStatusFilter)
    : "ALL";
}

/**
 * The display status for a row. An unpaid invoice past its due date reads as
 * OVERDUE; everything else maps straight from the stored status.
 */
export function deriveInvoiceStatusView(
  status: InvoiceStatus,
  dueDate: Date | string | null | undefined,
): InvoiceViewStatus {
  if (status === "PAID") return "PAID";
  if (status === "CANCELLED") return "CANCELLED";
  if (dueDate) {
    const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) {
      return "OVERDUE";
    }
  }
  return "UNPAID";
}

export function isOverdue(
  status: InvoiceStatus,
  dueDate: Date | string | null | undefined,
): boolean {
  return deriveInvoiceStatusView(status, dueDate) === "OVERDUE";
}

// ---------------------------------------------------------------------------
// Badge tones — match utils/statusConfigColors.ts conventions (light + dark)
// ---------------------------------------------------------------------------

export const INVOICE_STATUS_CONFIG: Record<
  InvoiceViewStatus,
  { label: string; className: string; description: string }
> = {
  UNPAID: {
    label: "Unpaid",
    description: "Awaiting payment.",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  },
  OVERDUE: {
    label: "Overdue",
    description: "Unpaid and past its due date.",
    className:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  },
  PAID: {
    label: "Paid",
    description: "Settled in full.",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  },
  CANCELLED: {
    label: "Cancelled",
    description: "Voided by Arena. Kept for the record.",
    className: "bg-secondary text-muted-foreground border-border",
  },
};

// ---------------------------------------------------------------------------
// Validation schemas (used by the server actions)
// ---------------------------------------------------------------------------

const isoDate = z
  .string()
  .trim()
  .min(1)
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date");

/**
 * Everything an admin fills in to issue an invoice. The file fields arrive from
 * the completed UploadThing upload (the form uploads first, then submits this).
 */
export const createInvoiceSchema = z
  .object({
    orgId: z.string().min(1, "Choose an organisation."),
    shipmentId: z.string().min(1).nullable().optional(),

    invoiceNumber: z
      .string()
      .trim()
      .min(1, "Invoice number is required.")
      .max(60, "Invoice number is too long."),

    amount: z
      .number({ error: "Enter the invoice amount." })
      .positive("Amount must be greater than zero.")
      .max(1_000_000_000, "Amount is too large."),

    currency: z.string().trim().min(1).max(3).default("INR"),

    issueDate: isoDate,
    dueDate: isoDate.nullable().optional(),

    notes: z.string().trim().max(2000).nullable().optional(),

    // file (from UploadThing)
    fileUrl: z.string().url(),
    fileKey: z.string().min(1),
    fileName: z.string().min(1),
    fileSize: z.number().int().nonnegative(),
    mimeType: z.string().min(1),
  })
  .refine(
    (v) => !v.dueDate || new Date(v.dueDate) >= new Date(v.issueDate),
    { path: ["dueDate"], message: "Due date cannot be before the issue date." },
  );

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/** The editable subset once an invoice exists (the PDF itself is not replaced here). */
export const updateInvoiceSchema = z
  .object({
    invoiceNumber: z.string().trim().min(1).max(60),
    amount: z.number().positive().max(1_000_000_000),
    currency: z.string().trim().min(1).max(3),
    issueDate: isoDate,
    dueDate: isoDate.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (v) => !v.dueDate || new Date(v.dueDate) >= new Date(v.issueDate),
    { path: ["dueDate"], message: "Due date cannot be before the issue date." },
  );

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

/** Admins move an invoice between UNPAID and PAID, or void it to CANCELLED. */
export const invoiceStatusValues = [
  InvoiceStatus.UNPAID,
  InvoiceStatus.PAID,
  InvoiceStatus.CANCELLED,
] as const;

// ---------------------------------------------------------------------------
// Small display helper
// ---------------------------------------------------------------------------

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
