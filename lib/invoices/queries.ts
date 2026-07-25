/**
 * lib/invoices/queries.ts
 *
 * The read side of the invoice feature. One place builds the Prisma `where`, so
 * the tenant view (locked to one org) and the Arena view (all orgs, optionally
 * filtered to one) can never drift apart in how they interpret a status filter
 * or a search box.
 */

import "server-only";

import { Prisma } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import {
  DEFAULT_INVOICE_PAGE_SIZE,
  INVOICE_PAGE_SIZE_OPTIONS,
  coerceInvoiceSortField,
  coerceInvoiceStatusFilter,
  type InvoiceListParams,
  type InvoicePage,
  type InvoiceRow,
  type InvoiceSortField,
  type InvoiceStatusFilter,
  type InvoiceSummary,
} from "./config";

// ---------------------------------------------------------------------------
// Where builder
// ---------------------------------------------------------------------------

function coercePage(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.floor(value as number)
    : 1;
}

function coercePageSize(value: number | undefined): number {
  return (INVOICE_PAGE_SIZE_OPTIONS as readonly number[]).includes(value as number)
    ? (value as number)
    : DEFAULT_INVOICE_PAGE_SIZE;
}

/**
 * Build the `where` for a scope. `forcedOrgId` is the tenant's own org (never
 * overridable); `filterOrgId` is the Arena org filter (optional). Soft-deleted
 * rows are always excluded.
 */
function buildWhere(opts: {
  forcedOrgId?: string;
  filterOrgId?: string | null;
  statusFilter: InvoiceStatusFilter;
  search?: string;
  now: Date;
}): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = { deletedAt: null };

  if (opts.forcedOrgId) where.orgId = opts.forcedOrgId;
  else if (opts.filterOrgId) where.orgId = opts.filterOrgId;

  switch (opts.statusFilter) {
    case "PAID":
      where.status = "PAID";
      break;
    case "CANCELLED":
      where.status = "CANCELLED";
      break;
    case "OVERDUE":
      where.status = "UNPAID";
      where.dueDate = { lt: opts.now };
      break;
    case "UNPAID":
      // Unpaid but not yet overdue, so UNPAID and OVERDUE partition the set.
      where.status = "UNPAID";
      where.OR = [{ dueDate: null }, { dueDate: { gte: opts.now } }];
      break;
    case "ALL":
    default:
      break;
  }

  const q = opts.search?.trim();
  if (q) {
    const contains: Prisma.StringFilter = { contains: q, mode: "insensitive" };
    const searchOr: Prisma.InvoiceWhereInput[] = [
      { invoiceNumber: contains },
      { shipment: { is: { shipmentNumber: contains } } },
    ];
    // The org name is only worth searching where more than one org is in view.
    if (!opts.forcedOrgId) {
      searchOr.push({ org: { is: { name: contains } } });
      searchOr.push({ org: { is: { companyName: contains } } });
    }
    // Combine with any status OR already present.
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchOr }];
      delete where.OR;
    } else {
      where.OR = searchOr;
    }
  }

  return where;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

const rowInclude = {
  org: { select: { id: true, name: true, companyName: true } },
  shipment: { select: { id: true, shipmentNumber: true } },
} satisfies Prisma.InvoiceInclude;

type InvoiceWithRels = Prisma.InvoiceGetPayload<{ include: typeof rowInclude }>;

function toRow(inv: InvoiceWithRels): InvoiceRow {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    amount: Number(inv.amount),
    currency: inv.currency,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
    notes: inv.notes,
    fileUrl: inv.fileUrl,
    fileName: inv.fileName,
    fileSize: inv.fileSize,
    mimeType: inv.mimeType,
    orgId: inv.orgId,
    orgName: inv.org.companyName?.trim() || inv.org.name,
    shipmentId: inv.shipmentId,
    shipmentNumber: inv.shipment?.shipmentNumber ?? null,
    createdByName: inv.createdByName,
    paidByName: inv.paidByName,
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    createdAt: inv.createdAt.toISOString(),
  };
}

const SORT_COLUMN: Record<InvoiceSortField, keyof Prisma.InvoiceOrderByWithRelationInput> = {
  issueDate: "issueDate",
  dueDate: "dueDate",
  amount: "amount",
  invoiceNumber: "invoiceNumber",
  status: "status",
  createdAt: "createdAt",
};

// ---------------------------------------------------------------------------
// Summary — reflects the org scope only (ignores status filter + search) so the
// tiles read as a stable overview regardless of how the table below is filtered.
// ---------------------------------------------------------------------------

async function fetchSummary(
  scopeWhere: Prisma.InvoiceWhereInput,
  now: Date,
): Promise<InvoiceSummary> {
  const [total, outstanding, overdueCount, paid] = await Promise.all([
    prisma.invoice.count({ where: scopeWhere }),
    prisma.invoice.aggregate({
      where: { ...scopeWhere, status: "UNPAID" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.invoice.count({
      where: { ...scopeWhere, status: "UNPAID", dueDate: { lt: now } },
    }),
    prisma.invoice.aggregate({
      where: { ...scopeWhere, status: "PAID" },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return {
    total,
    outstandingAmount: Number(outstanding._sum.amount ?? 0),
    outstandingCount: outstanding._count,
    overdueCount,
    paidCount: paid._count,
    paidAmount: Number(paid._sum.amount ?? 0),
    currency: "INR",
  };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

async function fetchPage(opts: {
  forcedOrgId?: string;
  params: InvoiceListParams;
}): Promise<InvoicePage> {
  const now = new Date();
  const page = coercePage(opts.params.page);
  const pageSize = coercePageSize(opts.params.pageSize);
  const sortField = coerceInvoiceSortField(opts.params.sortField);
  const sortDir = opts.params.sortDir === "asc" ? "asc" : "desc";
  const statusFilter = coerceInvoiceStatusFilter(opts.params.statusFilter);

  const where = buildWhere({
    forcedOrgId: opts.forcedOrgId,
    filterOrgId: opts.params.orgId ?? null,
    statusFilter,
    search: opts.params.search,
    now,
  });

  // The summary scope keeps the org narrowing but drops the status/search parts.
  const scopeWhere: Prisma.InvoiceWhereInput = { deletedAt: null };
  if (opts.forcedOrgId) scopeWhere.orgId = opts.forcedOrgId;
  else if (opts.params.orgId) scopeWhere.orgId = opts.params.orgId;

  const orderBy: Prisma.InvoiceOrderByWithRelationInput[] = [
    { [SORT_COLUMN[sortField]]: sortDir },
    { id: "desc" }, // stable tiebreak so pagination never repeats a row
  ];

  const [total, rows, summary] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: rowInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    fetchSummary(scopeWhere, now),
  ]);

  return {
    rows: rows.map(toRow),
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    page,
    pageSize,
    summary,
  };
}

/** Tenant view: hard-locked to the caller's org. */
export function getOrgInvoicesPage(orgId: string, params: InvoiceListParams) {
  return fetchPage({ forcedOrgId: orgId, params });
}

/** Arena view: every org, optionally filtered to one via params.orgId. */
export function getAllInvoicesPage(params: InvoiceListParams) {
  return fetchPage({ params });
}
