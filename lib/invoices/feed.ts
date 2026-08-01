/**
 * lib/invoices/feed.ts
 *
 * The customer's invoice list: booking tax invoices (ShipmentInvoice) and
 * account bills (Invoice) merged into one paginated feed.
 *
 * WHY MERGE IN MEMORY. The two documents live in different tables with
 * different columns, and Prisma cannot order across a union. Rather than drop
 * to raw SQL for a list a customer opens a few times a month, this fetches the
 * first `page * pageSize` rows from each side — already filtered and ordered by
 * the database — merges them with the same comparator the database used, and
 * slices out the page. The work is bounded by the page you are looking at, not
 * by how many invoices the org has, so it does not degrade as an org grows.
 *
 * The comparator and the `orderBy` must stay in step, including the id
 * tiebreak, or a row could show up on two pages or on none. That is the reason
 * sorting is restricted to issueDate and amount (see InvoiceFeedSortField).
 *
 * NOT CACHED, unlike getOrgInvoicesPage. A booking invoice appears seconds
 * after a booking, and a customer who books and immediately opens /invoices
 * must not be told it does not exist because a cache entry was warmed a moment
 * too early.
 */

import "server-only";

import { Prisma, TaxDocType } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import {
  coerceInvoiceFeedSortField,
  coerceInvoiceKindFilter,
  coerceInvoicePage,
  coerceInvoicePageSize,
  coerceInvoiceStatusFilter,
  deriveInvoiceStatusView,
  type InvoiceFeedPage,
  type InvoiceFeedParams,
  type InvoiceFeedRow,
  type InvoiceStatusFilter,
  type InvoiceSummary,
} from "./config";

// ---------------------------------------------------------------------------
// Where builders — one per source, same rules
// ---------------------------------------------------------------------------

function accountWhere(opts: {
  orgId: string;
  statusFilter: InvoiceStatusFilter;
  search?: string;
  now: Date;
}): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {
    orgId: opts.orgId,
    deletedAt: null,
  };

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
      // Unpaid but not yet due, so UNPAID and OVERDUE partition the set.
      where.status = "UNPAID";
      where.OR = [{ dueDate: null }, { dueDate: { gte: opts.now } }];
      break;
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
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchOr }];
      delete where.OR;
    } else {
      where.OR = searchOr;
    }
  }

  return where;
}

function bookingWhere(opts: {
  orgId: string;
  statusFilter: InvoiceStatusFilter;
  search?: string;
}): Prisma.ShipmentInvoiceWhereInput {
  const where: Prisma.ShipmentInvoiceWhereInput = { orgId: opts.orgId };

  switch (opts.statusFilter) {
    case "PAID":
      where.status = "PAID";
      break;
    case "CANCELLED":
      where.status = "CANCELLED";
      break;
    case "UNPAID":
      where.status = "UNPAID";
      break;
    // OVERDUE is filtered out before we get here — see bookingIsExcluded.
    default:
      break;
  }

  const q = opts.search?.trim();
  if (q) {
    const contains: Prisma.StringFilter = { contains: q, mode: "insensitive" };
    where.OR = [
      { invoiceNumber: contains },
      { shipment: { is: { shipmentNumber: contains } } },
    ];
  }

  return where;
}

/**
 * A booking invoice is never overdue: it is settled from the wallet at booking,
 * and it carries no due date to be past. Asking for overdue therefore asks for
 * account bills only.
 */
function bookingIsExcluded(statusFilter: InvoiceStatusFilter): boolean {
  return statusFilter === "OVERDUE";
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

const ACCOUNT_SELECT = {
  id: true,
  invoiceNumber: true,
  status: true,
  amount: true,
  currency: true,
  issueDate: true,
  dueDate: true,
  fileUrl: true,
  fileName: true,
  shipmentId: true,
  shipment: { select: { shipmentNumber: true } },
} satisfies Prisma.InvoiceSelect;

const BOOKING_SELECT = {
  id: true,
  invoiceNumber: true,
  docType: true,
  status: true,
  generationStatus: true,
  total: true,
  currency: true,
  issueDate: true,
  fileUrl: true,
  fileName: true,
  shipmentId: true,
  shipment: { select: { shipmentNumber: true } },
} satisfies Prisma.ShipmentInvoiceSelect;

type AccountRaw = Prisma.InvoiceGetPayload<{ select: typeof ACCOUNT_SELECT }>;
type BookingRaw = Prisma.ShipmentInvoiceGetPayload<{ select: typeof BOOKING_SELECT }>;

function accountToRow(inv: AccountRaw): InvoiceFeedRow {
  return {
    id: `account:${inv.id}`,
    kind: "ACCOUNT",
    isCreditNote: false,
    invoiceNumber: inv.invoiceNumber,
    status: deriveInvoiceStatusView(inv.status, inv.dueDate),
    amount: Number(inv.amount),
    currency: inv.currency,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
    shipmentId: inv.shipmentId,
    shipmentNumber: inv.shipment?.shipmentNumber ?? null,
    fileUrl: inv.fileUrl,
    fileName: inv.fileName,
    preparing: false,
  };
}

function bookingToRow(inv: BookingRaw): InvoiceFeedRow {
  return {
    id: `booking:${inv.id}`,
    kind: "BOOKING",
    isCreditNote: inv.docType === TaxDocType.CREDIT_NOTE,
    invoiceNumber: inv.invoiceNumber,
    // No due date exists on this side, so the derivation can only return the
    // stored status. Passing null keeps that explicit.
    status: deriveInvoiceStatusView(inv.status, null),
    amount: Number(inv.total),
    currency: inv.currency,
    issueDate: inv.issueDate.toISOString(),
    dueDate: null,
    shipmentId: inv.shipmentId,
    shipmentNumber: inv.shipment.shipmentNumber,
    fileUrl: inv.fileUrl,
    fileName: inv.fileName,
    preparing: inv.generationStatus !== "READY" || !inv.fileUrl,
  };
}

// ---------------------------------------------------------------------------
// Summary — org scope only
// ---------------------------------------------------------------------------
//
// Like the tiles it feeds, this ignores the status filter, the kind switch and
// the search box: the numbers are a steady statement of the account, not a
// readout of however the list below happens to be sliced. It does span both
// kinds, so "total invoices" matches everything the table can show.

async function fetchSummary(orgId: string, now: Date): Promise<InvoiceSummary> {
  const accountScope: Prisma.InvoiceWhereInput = { orgId, deletedAt: null };
  const bookingScope: Prisma.ShipmentInvoiceWhereInput = { orgId };

  const [
    accountTotal,
    accountUnpaid,
    accountOverdue,
    accountPaid,
    bookingTotal,
    bookingUnpaid,
    bookingPaid,
  ] = await Promise.all([
    prisma.invoice.count({ where: accountScope }),
    prisma.invoice.aggregate({
      where: { ...accountScope, status: "UNPAID" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.invoice.count({
      where: { ...accountScope, status: "UNPAID", dueDate: { lt: now } },
    }),
    prisma.invoice.aggregate({
      where: { ...accountScope, status: "PAID" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.shipmentInvoice.count({ where: bookingScope }),
    prisma.shipmentInvoice.aggregate({
      where: { ...bookingScope, status: "UNPAID" },
      _sum: { total: true },
      _count: true,
    }),
    prisma.shipmentInvoice.aggregate({
      where: { ...bookingScope, status: "PAID" },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  return {
    total: accountTotal + bookingTotal,
    outstandingAmount:
      Number(accountUnpaid._sum.amount ?? 0) + Number(bookingUnpaid._sum.total ?? 0),
    outstandingCount: accountUnpaid._count + bookingUnpaid._count,
    overdueCount: accountOverdue,
    paidCount: accountPaid._count + bookingPaid._count,
    paidAmount:
      Number(accountPaid._sum.amount ?? 0) + Number(bookingPaid._sum.total ?? 0),
    currency: "INR",
  };
}

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

/**
 * One org's invoices, both kinds, newest first.
 *
 * orgId is forced by the caller from the session and never taken from a
 * parameter the browser can influence — the same rule the rest of the tenant
 * query layer follows.
 */
export async function getOrgInvoiceFeed(
  orgId: string,
  params: InvoiceFeedParams,
): Promise<InvoiceFeedPage> {
  const now = new Date();
  const page = coerceInvoicePage(params.page);
  const pageSize = coerceInvoicePageSize(params.pageSize);
  const sortField = coerceInvoiceFeedSortField(params.sortField);
  const sortDir = params.sortDir === "asc" ? "asc" : "desc";
  const statusFilter = coerceInvoiceStatusFilter(params.statusFilter);
  const kindFilter = coerceInvoiceKindFilter(params.kindFilter);
  const search = params.search?.trim() || undefined;

  const accWhere = accountWhere({ orgId, statusFilter, search, now });
  const bookWhere = bookingWhere({ orgId, statusFilter, search });

  const bookingOff = bookingIsExcluded(statusFilter);
  const wantAccount = kindFilter !== "BOOKING";
  const wantBooking = kindFilter !== "ACCOUNT" && !bookingOff;

  // Everything above the requested page has to be merged before it can be
  // sliced, so each side contributes at most that many rows.
  const take = page * pageSize;

  const [accountRows, bookingRows, accountCount, bookingCount] = await Promise.all([
    wantAccount
      ? prisma.invoice.findMany({
          where: accWhere,
          select: ACCOUNT_SELECT,
          orderBy: [{ [sortField === "amount" ? "amount" : "issueDate"]: sortDir }, { id: "desc" }],
          take,
        })
      : Promise.resolve([] as AccountRaw[]),
    wantBooking
      ? prisma.shipmentInvoice.findMany({
          where: bookWhere,
          select: BOOKING_SELECT,
          orderBy: [{ [sortField === "amount" ? "total" : "issueDate"]: sortDir }, { id: "desc" }],
          take,
        })
      : Promise.resolve([] as BookingRaw[]),
    prisma.invoice.count({ where: accWhere }),
    bookingOff
      ? Promise.resolve(0)
      : prisma.shipmentInvoice.count({ where: bookWhere }),
  ]);

  const merged = [...accountRows.map(accountToRow), ...bookingRows.map(bookingToRow)];

  // Mirrors the database's ordering exactly, id tiebreak included.
  merged.sort((a, b) => {
    const primary =
      sortField === "amount"
        ? a.amount - b.amount
        : Date.parse(a.issueDate) - Date.parse(b.issueDate);
    if (primary !== 0) return sortDir === "asc" ? primary : -primary;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });

  const total =
    (wantAccount ? accountCount : 0) + (wantBooking ? bookingCount : 0);

  return {
    rows: merged.slice((page - 1) * pageSize, page * pageSize),
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    page,
    pageSize,
    summary: await fetchSummary(orgId, now),
    kindCounts: { ACCOUNT: accountCount, BOOKING: bookingCount },
  };
}
