/**
 * lib/invoices/admin/feed.ts
 *
 * The Arena admin's invoice list: booking invoices (ShipmentInvoice), manual
 * invoices (ManualInvoice) and uploaded bills (Invoice) merged into one
 * paginated feed. See ./config.ts for why they share a table at all.
 *
 * WHY MERGE IN MEMORY. The three documents live in three tables with different
 * columns, and Prisma cannot order across a union. Rather than drop to raw SQL,
 * this fetches the first `page * pageSize` rows from each side, already filtered
 * and ordered by the database, merges them with the same comparator the database
 * used, and slices out the page. The work is bounded by the page you are looking
 * at, not by how many invoices exist, so it does not degrade as Arena grows.
 * ../feed.ts does the same thing for the tenant side.
 *
 * The comparator and every `orderBy` must stay in step, id tiebreak included, or
 * a row could show up on two pages or on none. That is why sorting is restricted
 * to issueDate and amount (see AdminInvoiceSortField).
 *
 * NOT CACHED. A booking invoice appears seconds after a booking and an admin
 * watching for a failure must not be shown a snapshot from before it happened.
 *
 * ARENA SCOPE. Every row here belongs to some other organisation, so this is
 * only ever reached through requireArenaAdmin() in the action layer.
 */

import "server-only";

import {
  InvoiceGenerationStatus,
  InvoiceStatus,
  ManualInvoiceDocType,
  ManualInvoiceStatus,
  Prisma,
  ShipmentInvoiceStatus,
  TaxDocType,
} from "@/generated/prisma";
import { prisma } from "@/utils/db";

import { coerceInvoicePage, coerceInvoicePageSize } from "../config";
import { invoiceRowInclude, invoiceToRow } from "../queries";
import {
  coerceAdminInvoiceKindFilter,
  coerceAdminInvoiceSortField,
  coerceAdminInvoiceStatusFilter,
  deriveAccountViewStatus,
  deriveBookingViewStatus,
  deriveManualViewStatus,
  invoiceStaleBefore,
  type AdminInvoiceFeedParams,
  type AdminInvoiceKind,
  type AdminInvoicePage,
  type AdminInvoiceRow,
  type AdminInvoiceStatusFilter,
  type AdminInvoiceSummary,
} from "./config";

// ---------------------------------------------------------------------------
// Where builders — one per source, one interpretation of each filter
// ---------------------------------------------------------------------------

interface WhereOpts {
  statusFilter: AdminInvoiceStatusFilter;
  search?: string;
  orgId?: string | null;
  now: Date;
  staleBefore: Date;
}

function contains(q: string): Prisma.StringFilter {
  return { contains: q, mode: "insensitive" };
}

/**
 * Which statuses a source can even hold. Asking a booking invoice for a draft,
 * or an uploaded bill for a failed render, is asking for something that cannot
 * exist — so the source is skipped entirely rather than queried for nothing.
 */
function supportsStatus(
  kind: AdminInvoiceKind,
  filter: AdminInvoiceStatusFilter,
): boolean {
  switch (filter) {
    case "DRAFT":
      return kind === "MANUAL";
    case "ATTENTION":
      return kind === "BOOKING";
    case "OVERDUE":
      // A booking invoice is settled from the wallet at booking and carries no
      // due date to be past, so it can never be overdue.
      return kind !== "BOOKING";
    default:
      return true;
  }
}

/**
 * Clauses are collected into an AND rather than assigned onto one object,
 * because both the status filter and the search box want an OR of their own and
 * merging them would widen the status filter instead of narrowing the result.
 */
function bookingWhere(opts: WhereOpts): Prisma.ShipmentInvoiceWhereInput {
  const and: Prisma.ShipmentInvoiceWhereInput[] = [];

  if (opts.orgId) and.push({ orgId: opts.orgId });

  // Mirrors deriveBookingViewStatus exactly, including its precedence. READY is
  // the compact way of saying "neither preparing nor stuck", which is what keeps
  // UNPAID, PAID and ATTENTION a true partition.
  switch (opts.statusFilter) {
    case "ATTENTION":
      and.push({
        status: { not: ShipmentInvoiceStatus.CANCELLED },
        OR: [
          { generationStatus: InvoiceGenerationStatus.FAILED },
          {
            generationStatus: InvoiceGenerationStatus.PENDING,
            createdAt: { lt: opts.staleBefore },
          },
        ],
      });
      break;
    case "UNPAID":
      and.push({
        status: ShipmentInvoiceStatus.UNPAID,
        generationStatus: InvoiceGenerationStatus.READY,
      });
      break;
    case "PAID":
      and.push({
        status: ShipmentInvoiceStatus.PAID,
        generationStatus: InvoiceGenerationStatus.READY,
      });
      break;
    case "CANCELLED":
      and.push({ status: ShipmentInvoiceStatus.CANCELLED });
      break;
    default:
      break;
  }

  const q = opts.search?.trim();
  if (q) {
    and.push({
      OR: [
        { invoiceNumber: contains(q) },
        { shipment: { is: { shipmentNumber: contains(q) } } },
        { org: { is: { name: contains(q) } } },
        { org: { is: { companyName: contains(q) } } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

function manualWhere(opts: WhereOpts): Prisma.ManualInvoiceWhereInput {
  const and: Prisma.ManualInvoiceWhereInput[] = [{ deletedAt: null }];

  if (opts.orgId) and.push({ orgId: opts.orgId });

  switch (opts.statusFilter) {
    case "DRAFT":
      and.push({ status: ManualInvoiceStatus.DRAFT });
      break;
    case "UNPAID":
      // Issued but not yet due, so UNPAID and OVERDUE partition the set.
      and.push({
        status: ManualInvoiceStatus.ISSUED,
        OR: [{ dueDate: null }, { dueDate: { gte: opts.now } }],
      });
      break;
    case "OVERDUE":
      and.push({
        status: ManualInvoiceStatus.ISSUED,
        dueDate: { lt: opts.now },
      });
      break;
    case "PAID":
      and.push({ status: ManualInvoiceStatus.PAID });
      break;
    case "CANCELLED":
      and.push({ status: ManualInvoiceStatus.CANCELLED });
      break;
    default:
      break;
  }

  const q = opts.search?.trim();
  if (q) {
    and.push({
      OR: [
        { invoiceNumber: contains(q) },
        { reference: contains(q) },
        { billingParty: { is: { legalName: contains(q) } } },
        { billingParty: { is: { gstin: contains(q) } } },
        { org: { is: { name: contains(q) } } },
        { org: { is: { companyName: contains(q) } } },
        {
          consignments: {
            some: {
              OR: [
                { awbNumber: contains(q) },
                { mawbNumber: contains(q) },
                { jobNumber: contains(q) },
              ],
            },
          },
        },
      ],
    });
  }

  return { AND: and };
}

function accountWhere(opts: WhereOpts): Prisma.InvoiceWhereInput {
  const and: Prisma.InvoiceWhereInput[] = [{ deletedAt: null }];

  if (opts.orgId) and.push({ orgId: opts.orgId });

  switch (opts.statusFilter) {
    case "UNPAID":
      and.push({
        status: InvoiceStatus.UNPAID,
        OR: [{ dueDate: null }, { dueDate: { gte: opts.now } }],
      });
      break;
    case "OVERDUE":
      and.push({ status: InvoiceStatus.UNPAID, dueDate: { lt: opts.now } });
      break;
    case "PAID":
      and.push({ status: InvoiceStatus.PAID });
      break;
    case "CANCELLED":
      and.push({ status: InvoiceStatus.CANCELLED });
      break;
    default:
      break;
  }

  const q = opts.search?.trim();
  if (q) {
    and.push({
      OR: [
        { invoiceNumber: contains(q) },
        { shipment: { is: { shipmentNumber: contains(q) } } },
        { org: { is: { name: contains(q) } } },
        { org: { is: { companyName: contains(q) } } },
      ],
    });
  }

  return { AND: and };
}

// ---------------------------------------------------------------------------
// Selects and row mapping
// ---------------------------------------------------------------------------

const BOOKING_SELECT = {
  id: true,
  invoiceNumber: true,
  docType: true,
  status: true,
  generationStatus: true,
  generationError: true,
  createdAt: true,
  total: true,
  currency: true,
  issueDate: true,
  fileUrl: true,
  fileName: true,
  shipmentId: true,
  shipment: { select: { shipmentNumber: true } },
  orgId: true,
  org: { select: { name: true, companyName: true } },
} satisfies Prisma.ShipmentInvoiceSelect;

const MANUAL_SELECT = {
  id: true,
  invoiceNumber: true,
  docType: true,
  status: true,
  total: true,
  currency: true,
  issueDate: true,
  dueDate: true,
  lastSentAt: true,
  reference: true,
  fileUrl: true,
  fileName: true,
  orgId: true,
  org: { select: { name: true, companyName: true } },
  billingParty: { select: { legalName: true } },
  consignments: {
    orderBy: { sortOrder: "asc" },
    take: 1,
    select: { awbNumber: true },
  },
  _count: { select: { consignments: true } },
} satisfies Prisma.ManualInvoiceSelect;

type BookingRaw = Prisma.ShipmentInvoiceGetPayload<{
  select: typeof BOOKING_SELECT;
}>;
type ManualRaw = Prisma.ManualInvoiceGetPayload<{ select: typeof MANUAL_SELECT }>;
type AccountRaw = Prisma.InvoiceGetPayload<{ include: typeof invoiceRowInclude }>;

function orgLabel(
  org: { name: string; companyName: string | null } | null,
): string | null {
  if (!org) return null;
  return org.companyName?.trim() || org.name;
}

function bookingToRow(row: BookingRaw, staleBefore: Date): AdminInvoiceRow {
  return {
    id: `booking:${row.id}`,
    rawId: row.id,
    kind: "BOOKING",
    isCreditNote: row.docType === TaxDocType.CREDIT_NOTE,
    invoiceNumber: row.invoiceNumber,
    status: deriveBookingViewStatus({
      status: row.status,
      generationStatus: row.generationStatus,
      createdAt: row.createdAt,
      staleBefore,
    }),

    customerName: orgLabel(row.org) ?? "Unknown organisation",
    customerNote: null,
    orgId: row.orgId,

    shipmentId: row.shipmentId,
    shipmentNumber: row.shipment.shipmentNumber,
    awbNumber: null,
    consignmentCount: 0,
    reference: null,

    amount: Number(row.total),
    currency: row.currency,
    issueDate: row.issueDate.toISOString(),
    // Settled from the wallet at booking, so there is no date it can be past.
    dueDate: null,
    lastSentAt: null,

    fileUrl: row.fileUrl,
    fileName: row.fileName,
    generationError: row.generationError,
    account: null,
  };
}

function manualToRow(row: ManualRaw, now: Date): AdminInvoiceRow {
  const org = orgLabel(row.org);
  const party = row.billingParty.legalName;

  return {
    id: `manual:${row.id}`,
    rawId: row.id,
    kind: "MANUAL",
    isCreditNote: row.docType === ManualInvoiceDocType.CREDIT_NOTE,
    invoiceNumber: row.invoiceNumber,
    status: deriveManualViewStatus(row.status, row.dueDate, now),

    customerName: party,
    // Only when it says something the name above does not. A billing party
    // adopted from an org usually carries that org's own name.
    customerNote: org && org !== party ? org : null,
    orgId: row.orgId,

    // Manual invoicing exists for work that never went through the platform, so
    // there is no Shipment to point at. Its own consignments are the reference.
    shipmentId: null,
    shipmentNumber: null,
    awbNumber: row.consignments[0]?.awbNumber ?? null,
    consignmentCount: row._count.consignments,
    reference: row.reference,

    amount: Number(row.total),
    currency: row.currency,
    issueDate: row.issueDate.toISOString(),
    dueDate: row.dueDate?.toISOString() ?? null,
    lastSentAt: row.lastSentAt?.toISOString() ?? null,

    fileUrl: row.fileUrl,
    fileName: row.fileName,
    generationError: null,
    account: null,
  };
}

function accountToRow(row: AccountRaw, now: Date): AdminInvoiceRow {
  const full = invoiceToRow(row);

  return {
    id: `account:${row.id}`,
    rawId: row.id,
    kind: "ACCOUNT",
    isCreditNote: false,
    invoiceNumber: full.invoiceNumber,
    status: deriveAccountViewStatus(row.status, row.dueDate, now),

    customerName: full.orgName,
    customerNote: null,
    orgId: full.orgId,

    shipmentId: full.shipmentId,
    shipmentNumber: full.shipmentNumber,
    awbNumber: null,
    consignmentCount: 0,
    reference: null,

    amount: full.amount,
    currency: full.currency,
    issueDate: full.issueDate,
    dueDate: full.dueDate,
    lastSentAt: null,

    fileUrl: full.fileUrl,
    fileName: full.fileName,
    generationError: null,
    account: full,
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
//
// Deliberately ignores the status filter, the kind switch and the search box:
// the tiles answer "where does this stand overall", and a summary that moved
// every time a filter changed would be answering a question nobody asked. It
// does honour the organisation filter, because that IS the scope.
//
// Amounts are summed only within the dominant currency. Adding rupees to dollars
// produces a number that is wrong in a way nobody notices, so a mixed set says
// so and the UI repeats it rather than printing a meaningless total. Counts span
// every currency, because counting documents is currency-agnostic.

type NormalStatus = "DRAFT" | "UNPAID" | "PAID" | "CANCELLED";

interface Bucket {
  status: NormalStatus;
  currency: string;
  count: number;
  sum: number;
}

async function fetchSummary(
  orgId: string | null,
  now: Date,
  staleBefore: Date,
): Promise<AdminInvoiceSummary> {
  const bookingScope: Prisma.ShipmentInvoiceWhereInput = orgId ? { orgId } : {};
  const manualScope: Prisma.ManualInvoiceWhereInput = {
    deletedAt: null,
    ...(orgId ? { orgId } : {}),
  };
  const accountScope: Prisma.InvoiceWhereInput = {
    deletedAt: null,
    ...(orgId ? { orgId } : {}),
  };

  const [
    bookingGroups,
    manualGroups,
    accountGroups,
    manualOverdue,
    accountOverdue,
    attentionCount,
  ] = await Promise.all([
    prisma.shipmentInvoice.groupBy({
      by: ["status", "currency"],
      where: bookingScope,
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.manualInvoice.groupBy({
      by: ["status", "currency"],
      where: manualScope,
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.invoice.groupBy({
      by: ["status", "currency"],
      where: accountScope,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    // Overdue is a date comparison, not a status, so groupBy cannot express it.
    prisma.manualInvoice.count({
      where: {
        ...manualScope,
        status: ManualInvoiceStatus.ISSUED,
        dueDate: { lt: now },
      },
    }),
    prisma.invoice.count({
      where: {
        ...accountScope,
        status: InvoiceStatus.UNPAID,
        dueDate: { lt: now },
      },
    }),
    prisma.shipmentInvoice.count({
      where: {
        ...bookingScope,
        status: { not: ShipmentInvoiceStatus.CANCELLED },
        OR: [
          { generationStatus: InvoiceGenerationStatus.FAILED },
          {
            generationStatus: InvoiceGenerationStatus.PENDING,
            createdAt: { lt: staleBefore },
          },
        ],
      },
    }),
  ]);

  const buckets: Bucket[] = [
    ...bookingGroups.map((g) => ({
      status:
        g.status === ShipmentInvoiceStatus.PAID
          ? ("PAID" as const)
          : g.status === ShipmentInvoiceStatus.CANCELLED
            ? ("CANCELLED" as const)
            : ("UNPAID" as const),
      currency: g.currency,
      count: g._count._all,
      sum: Number(g._sum.total ?? 0),
    })),
    ...manualGroups.map((g) => ({
      status:
        g.status === ManualInvoiceStatus.DRAFT
          ? ("DRAFT" as const)
          : g.status === ManualInvoiceStatus.PAID
            ? ("PAID" as const)
            : g.status === ManualInvoiceStatus.CANCELLED
              ? ("CANCELLED" as const)
              : ("UNPAID" as const),
      currency: g.currency,
      count: g._count._all,
      sum: Number(g._sum.total ?? 0),
    })),
    ...accountGroups.map((g) => ({
      status:
        g.status === InvoiceStatus.PAID
          ? ("PAID" as const)
          : g.status === InvoiceStatus.CANCELLED
            ? ("CANCELLED" as const)
            : ("UNPAID" as const),
      currency: g.currency,
      count: g._count._all,
      sum: Number(g._sum.amount ?? 0),
    })),
  ];

  const byCurrency = new Map<string, number>();
  for (const b of buckets) {
    byCurrency.set(b.currency, (byCurrency.get(b.currency) ?? 0) + b.count);
  }
  const dominant =
    [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "INR";

  const inScope = buckets.filter((b) => b.currency === dominant);
  const totalOf = (status: NormalStatus) =>
    inScope
      .filter((b) => b.status === status)
      .reduce(
        (acc, b) => ({ count: acc.count + b.count, sum: acc.sum + b.sum }),
        { count: 0, sum: 0 },
      );

  const outstanding = totalOf("UNPAID");
  const paid = totalOf("PAID");

  return {
    total: buckets.reduce((acc, b) => acc + b.count, 0),
    outstandingAmount: outstanding.sum,
    outstandingCount: outstanding.count,
    overdueCount: manualOverdue + accountOverdue,
    paidCount: paid.count,
    paidAmount: paid.sum,
    currency: dominant,
    draftCount: buckets
      .filter((b) => b.status === "DRAFT")
      .reduce((acc, b) => acc + b.count, 0),
    attentionCount,
    mixedCurrency: byCurrency.size > 1,
  };
}

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

export async function getAdminInvoiceFeed(
  params: AdminInvoiceFeedParams,
): Promise<AdminInvoicePage> {
  const now = new Date();
  const staleBefore = invoiceStaleBefore(now);

  const page = coerceInvoicePage(params.page);
  const pageSize = coerceInvoicePageSize(params.pageSize);
  const sortField = coerceAdminInvoiceSortField(params.sortField);
  const sortDir = params.sortDir === "asc" ? "asc" : "desc";
  const statusFilter = coerceAdminInvoiceStatusFilter(params.statusFilter);
  const kindFilter = coerceAdminInvoiceKindFilter(params.kindFilter);
  const orgId = params.orgId?.trim() || null;
  const search = params.search?.trim() || undefined;

  const opts: WhereOpts = { statusFilter, search, orgId, now, staleBefore };
  const bookWhere = bookingWhere(opts);
  const manWhere = manualWhere(opts);
  const accWhere = accountWhere(opts);

  // Counted whether or not the kind switch is on it: the switch shows what you
  // would get before you click, so its numbers answer the status filter and the
  // search box only. Rows, unlike counts, are fetched for the selected kind
  // alone.
  const countBooking = supportsStatus("BOOKING", statusFilter);
  const countManual = supportsStatus("MANUAL", statusFilter);
  const countAccount = supportsStatus("ACCOUNT", statusFilter);

  const selected = (kind: AdminInvoiceKind) =>
    kindFilter === "ALL" || kindFilter === kind;

  const wantBooking = countBooking && selected("BOOKING");
  const wantManual = countManual && selected("MANUAL");
  const wantAccount = countAccount && selected("ACCOUNT");

  // Everything above the requested page has to be merged before it can be
  // sliced, so each side contributes at most that many rows.
  const take = page * pageSize;
  const amountFirst = sortField === "amount";

  const [
    bookingRows,
    manualRows,
    accountRows,
    bookingCount,
    manualCount,
    accountCount,
    summary,
  ] = await Promise.all([
    wantBooking
      ? prisma.shipmentInvoice.findMany({
          where: bookWhere,
          select: BOOKING_SELECT,
          orderBy: [
            amountFirst ? { total: sortDir } : { issueDate: sortDir },
            { id: "desc" },
          ],
          take,
        })
      : Promise.resolve([] as BookingRaw[]),
    wantManual
      ? prisma.manualInvoice.findMany({
          where: manWhere,
          select: MANUAL_SELECT,
          orderBy: [
            amountFirst ? { total: sortDir } : { issueDate: sortDir },
            { id: "desc" },
          ],
          take,
        })
      : Promise.resolve([] as ManualRaw[]),
    wantAccount
      ? prisma.invoice.findMany({
          where: accWhere,
          include: invoiceRowInclude,
          orderBy: [
            amountFirst ? { amount: sortDir } : { issueDate: sortDir },
            { id: "desc" },
          ],
          take,
        })
      : Promise.resolve([] as AccountRaw[]),
    countBooking
      ? prisma.shipmentInvoice.count({ where: bookWhere })
      : Promise.resolve(0),
    countManual
      ? prisma.manualInvoice.count({ where: manWhere })
      : Promise.resolve(0),
    countAccount ? prisma.invoice.count({ where: accWhere }) : Promise.resolve(0),
    fetchSummary(orgId, now, staleBefore),
  ]);

  const merged = [
    ...bookingRows.map((row) => bookingToRow(row, staleBefore)),
    ...manualRows.map((row) => manualToRow(row, now)),
    ...accountRows.map((row) => accountToRow(row, now)),
  ];

  // Mirrors the database's ordering exactly. The tiebreak compares rawId rather
  // than the kind-prefixed id, because that is the column the database sorted on
  // and a prefix would silently reorder rows within a source.
  merged.sort((a, b) => {
    const primary = amountFirst
      ? a.amount - b.amount
      : Date.parse(a.issueDate) - Date.parse(b.issueDate);
    if (primary !== 0) return sortDir === "asc" ? primary : -primary;
    return a.rawId < b.rawId ? 1 : a.rawId > b.rawId ? -1 : 0;
  });

  // The pager counts only what the kind switch is actually showing.
  const total =
    (wantBooking ? bookingCount : 0) +
    (wantManual ? manualCount : 0) +
    (wantAccount ? accountCount : 0);

  return {
    rows: merged.slice((page - 1) * pageSize, page * pageSize),
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    page,
    pageSize,
    summary,
    kindCounts: {
      BOOKING: bookingCount,
      MANUAL: manualCount,
      ACCOUNT: accountCount,
    },
  };
}
