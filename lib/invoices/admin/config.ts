/**
 * lib/invoices/admin/config.ts
 *
 * Pure, shared configuration for the ARENA-side invoice list: the one table on
 * /arena-dashboard/invoices that shows all three kinds of document Arena has
 * raised.
 *
 * PURE MODULE. Imported by server actions and by client components, so no
 * "server-only", no prisma client, no env. The DTOs live here rather than beside
 * the query for exactly that reason.
 *
 * ── WHY ONE TABLE AND NOT THREE ─────────────────────────────────────────────
 * There are three tables in the database that each hold a document with Arena's
 * name and a customer's money on it:
 *
 *   ShipmentInvoice  a GST invoice raised automatically for every booking
 *   ManualInvoice    raised by hand here, for work arranged off the platform
 *   Invoice          a PDF from an outside accounting system, uploaded
 *
 * Their lifecycles genuinely differ, which is why they are three tables. But the
 * question an admin arrives with is the same for all three: who owes what, is it
 * paid, where is the PDF, and is anything broken. Splitting that across a panel
 * and two tabs meant knowing which of the three a document was BEFORE you could
 * look for it, which is exactly backwards. So the difference shows as a tag, a
 * filter and a status badge rather than as a place you have to be standing in.
 *
 * The tenant side reached the same conclusion first; see ../config.ts.
 */

import {
  InvoiceGenerationStatus,
  ManualInvoiceStatus,
  ShipmentInvoiceStatus,
  type InvoiceStatus,
} from "@/generated/prisma";

import {
  DEFAULT_INVOICE_PAGE_SIZE,
  type InvoiceRow,
  type InvoiceSummary,
} from "../config";

export { DEFAULT_INVOICE_PAGE_SIZE };

// ---------------------------------------------------------------------------
// Kind
// ---------------------------------------------------------------------------

export type AdminInvoiceKind = "BOOKING" | "MANUAL" | "ACCOUNT";

export const ADMIN_INVOICE_KIND_FILTERS = [
  "ALL",
  "BOOKING",
  "MANUAL",
  "ACCOUNT",
] as const;
export type AdminInvoiceKindFilter =
  (typeof ADMIN_INVOICE_KIND_FILTERS)[number];

export function coerceAdminInvoiceKindFilter(
  value: unknown,
): AdminInvoiceKindFilter {
  return (ADMIN_INVOICE_KIND_FILTERS as readonly string[]).includes(
    value as string,
  )
    ? (value as AdminInvoiceKindFilter)
    : "ALL";
}

/**
 * What each tag means, in the admin's vocabulary rather than the customer's.
 * The tenant list calls a manual invoice "Services" because "manual" describes
 * how Arena made it and means nothing to the person being billed. Here it is
 * the admin's own word and the honest one.
 */
export const ADMIN_INVOICE_KIND_TAG: Record<
  AdminInvoiceKind,
  { label: string; hint: string }
> = {
  BOOKING: {
    label: "Booking",
    hint: "Raised automatically when a shipment was booked.",
  },
  MANUAL: {
    label: "Manual",
    hint: "Raised here by hand, for work arranged off the platform.",
  },
  ACCOUNT: {
    label: "Uploaded",
    hint: "A PDF from an outside accounting system, attached to an organisation.",
  },
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
//
// One vocabulary across three tables that each store their own. Nothing here is
// a stored column: DRAFT, OVERDUE, PREPARING and ATTENTION are all derived, so
// there is no background job keeping a status column honest and no way for the
// badge, the filter and the count to disagree.

export type AdminInvoiceViewStatus =
  /** ManualInvoice only. No number, no PDF, nothing claimed yet. */
  | "DRAFT"
  /** ShipmentInvoice only. Booked moments ago; the job has not rendered it. */
  | "PREPARING"
  /** ShipmentInvoice only. Generation failed, or stalled long enough to count. */
  | "ATTENTION"
  | "UNPAID"
  | "OVERDUE"
  | "PAID"
  | "CANCELLED";

/**
 * PREPARING is deliberately absent. It lasts seconds, resolves itself, and a
 * filter for it would be a filter nobody could ever usefully land on. Everything
 * that needs a human is under ATTENTION.
 */
export const ADMIN_INVOICE_STATUS_FILTERS = [
  "ALL",
  "ATTENTION",
  "DRAFT",
  "UNPAID",
  "OVERDUE",
  "PAID",
  "CANCELLED",
] as const;
export type AdminInvoiceStatusFilter =
  (typeof ADMIN_INVOICE_STATUS_FILTERS)[number];

export function coerceAdminInvoiceStatusFilter(
  value: unknown,
): AdminInvoiceStatusFilter {
  return (ADMIN_INVOICE_STATUS_FILTERS as readonly string[]).includes(
    value as string,
  )
    ? (value as AdminInvoiceStatusFilter)
    : "ALL";
}

export const ADMIN_INVOICE_STATUS_LABELS: Record<
  AdminInvoiceStatusFilter,
  string
> = {
  ALL: "All statuses",
  ATTENTION: "Needs attention",
  DRAFT: "Drafts",
  UNPAID: "Unpaid",
  OVERDUE: "Overdue",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

/**
 * Badge tone per status. Colour is the only functional cue on the row, so it is
 * spent on the payment state and on breakage, and nowhere else: the kind tag
 * beside it is deliberately colourless.
 */
export const ADMIN_INVOICE_STATUS_TONE: Record<
  AdminInvoiceViewStatus,
  { label: string; className: string; description: string }
> = {
  DRAFT: {
    label: "Draft",
    description: "Not issued. It has no number and no PDF yet.",
    className: "bg-muted text-muted-foreground border-transparent",
  },
  PREPARING: {
    label: "Preparing",
    description: "The invoice for this booking is still being generated.",
    className: "bg-muted text-muted-foreground border-transparent",
  },
  ATTENTION: {
    label: "Needs attention",
    description: "Generation failed or stalled. Nobody has this invoice yet.",
    className:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  },
  UNPAID: {
    label: "Unpaid",
    description: "Issued and awaiting payment.",
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
    description: "Voided. The number and the PDF survive for the record.",
    className: "bg-secondary text-muted-foreground border-border",
  },
};

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * How long a booking invoice may sit unrendered before it counts as broken
 * rather than busy. Matches getStuckTaxInvoices' default, and it has to: the
 * table and the missing-shipment strip above it must agree on what "stalled"
 * means or one would report a problem the other says does not exist.
 */
export const INVOICE_STALE_AFTER_MINUTES = 15;

export function invoiceStaleBefore(now: Date = new Date()): Date {
  return new Date(now.getTime() - INVOICE_STALE_AFTER_MINUTES * 60_000);
}

/**
 * A booking invoice's display status.
 *
 * Precedence matters and is mirrored exactly by the `where` builders in
 * ./feed.ts. Cancelled wins over everything, because a voided booking's failed
 * render is not a problem anybody needs to fix. Generation state wins over the
 * payment state, because an invoice that does not exist as a document cannot
 * usefully be described as paid.
 */
export function deriveBookingViewStatus(opts: {
  status: ShipmentInvoiceStatus;
  generationStatus: InvoiceGenerationStatus;
  createdAt: Date;
  staleBefore: Date;
}): AdminInvoiceViewStatus {
  if (opts.status === ShipmentInvoiceStatus.CANCELLED) return "CANCELLED";

  if (opts.generationStatus === InvoiceGenerationStatus.FAILED) {
    return "ATTENTION";
  }
  if (opts.generationStatus === InvoiceGenerationStatus.PENDING) {
    return opts.createdAt < opts.staleBefore ? "ATTENTION" : "PREPARING";
  }

  return opts.status === ShipmentInvoiceStatus.PAID ? "PAID" : "UNPAID";
}

/** A manual invoice's display status. DRAFT and OVERDUE are the derived ones. */
export function deriveManualViewStatus(
  status: ManualInvoiceStatus,
  dueDate: Date | null,
  now: Date,
): AdminInvoiceViewStatus {
  switch (status) {
    case ManualInvoiceStatus.DRAFT:
      return "DRAFT";
    case ManualInvoiceStatus.PAID:
      return "PAID";
    case ManualInvoiceStatus.CANCELLED:
      return "CANCELLED";
    default:
      return dueDate && dueDate < now ? "OVERDUE" : "UNPAID";
  }
}

/** An uploaded bill's display status. */
export function deriveAccountViewStatus(
  status: InvoiceStatus,
  dueDate: Date | null,
  now: Date,
): AdminInvoiceViewStatus {
  if (status === "PAID") return "PAID";
  if (status === "CANCELLED") return "CANCELLED";
  return dueDate && dueDate < now ? "OVERDUE" : "UNPAID";
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Deliberately short, and for the same reason the tenant feed's is: rows come
 * from three tables and are merged in memory, so a sort is only safe where the
 * JS comparator and the database agree exactly. A date and a number do; a string
 * under a database collation does not, and a row would land on the wrong page or
 * on none. Finding one invoice by its number is what the search box is for.
 */
export type AdminInvoiceSortField = "issueDate" | "amount";

export function coerceAdminInvoiceSortField(
  value: unknown,
): AdminInvoiceSortField {
  return value === "amount" ? "amount" : "issueDate";
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface AdminInvoiceRow {
  /** Kind-prefixed, because the three source tables number their ids separately. */
  id: string;
  /** The row's id within its own table. What every action is called with. */
  rawId: string;
  kind: AdminInvoiceKind;
  /** A booking or manual document can be a credit note rather than an invoice. */
  isCreditNote: boolean;

  /** Null on a draft, and on a booking invoice the job has not numbered yet. */
  invoiceNumber: string | null;
  /** Already derived, so every consumer reads the same answer. */
  status: AdminInvoiceViewStatus;

  /** Who is being billed: the org, or the billing party on a manual invoice. */
  customerName: string;
  /** The org a billing party belongs to, when that adds something. */
  customerNote: string | null;
  orgId: string | null;

  shipmentId: string | null;
  shipmentNumber: string | null;
  /** First AWB on a manual invoice; null on the other kinds. */
  awbNumber: string | null;
  /** How many consignments a manual invoice carries, so the cell can say "and 2 more". */
  consignmentCount: number;
  /** The admin's own reference on a manual invoice. */
  reference: string | null;

  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string | null;
  /** Manual invoices only: when the PDF was last emailed to the customer. */
  lastSentAt: string | null;

  fileUrl: string | null;
  fileName: string | null;

  /** Booking invoices only: the generation error, for the ATTENTION tooltip. */
  generationError: string | null;

  /**
   * Uploaded bills only: the whole record.
   *
   * Carried rather than re-fetched so the preview and edit dialogs, which are
   * written against InvoiceRow, keep working untouched. The other two kinds are
   * edited on their own pages and need nothing here.
   */
  account: InvoiceRow | null;
}

export interface AdminInvoiceSummary extends InvoiceSummary {
  /** Manual invoices sitting unissued. */
  draftCount: number;
  /** Booking invoices whose generation failed or stalled. */
  attentionCount: number;
  /**
   * True when the rows span more than one currency, so the UI can say the totals
   * cover only the dominant one instead of printing a number that adds rupees to
   * dollars and is wrong in a way nobody notices.
   */
  mixedCurrency: boolean;
}

export interface AdminInvoicePage {
  rows: AdminInvoiceRow[];
  total: number;
  pageCount: number;
  page: number;
  pageSize: number;
  summary: AdminInvoiceSummary;
  /**
   * How many rows each kind holds under the CURRENT status filter, org filter
   * and search, so the kind switch shows what you would get before you click it.
   */
  kindCounts: Record<AdminInvoiceKind, number>;
}

export interface AdminInvoiceFeedParams {
  page?: number;
  pageSize?: number;
  sortField?: AdminInvoiceSortField;
  sortDir?: "asc" | "desc";
  statusFilter?: AdminInvoiceStatusFilter;
  kindFilter?: AdminInvoiceKindFilter;
  search?: string;
  /** Narrow to one organisation. A manual invoice with no org drops out. */
  orgId?: string | null;
}
