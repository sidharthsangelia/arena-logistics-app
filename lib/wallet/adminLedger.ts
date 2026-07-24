import "server-only";

import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import {
  Prisma,
  type PaymentCollectionStatus,
  type ShipmentStatus,
  type WalletTxnStatus,
  type WalletTxnType,
} from "@/generated/prisma";
import {
  CREDIT_TYPES,
  DEBIT_TYPES,
  EXPORT_ROW_CAP,
  type CollectionFilter,
  type CollectionSortField,
  type TxnSortField,
} from "./adminConfig";

/**
 * ARENA MONEY READS, part two: the transaction ledger and the collections queue.
 * Split from adminQueries.ts only for file size; the same rules apply. Admin-only
 * data, uncached, plain numbers rather than Decimal at the boundary. See the
 * header comment there for the reasoning.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

/**
 * +1 for money entering a wallet, -1 for money leaving. `amount` is always stored
 * positive with the type carrying the direction, so anything that displays or
 * totals a transaction has to go through this rather than guess.
 */
export function amountSign(type: WalletTxnType): 1 | -1 {
  if ((CREDIT_TYPES as readonly string[]).includes(type)) return 1;
  if ((DEBIT_TYPES as readonly string[]).includes(type)) return -1;
  // Legacy ADJUSTMENT rows carry no direction. Treated as credit so a total is
  // never silently wrong in the pessimistic direction; none exist in practice.
  return 1;
}

// ---------------------------------------------------------------------------
// Transactions tab
// ---------------------------------------------------------------------------

export type WalletTxnRow = {
  id: string;
  createdAt: string;
  orgId: string | null;
  orgName: string;
  type: WalletTxnType;
  status: WalletTxnStatus;
  /** Always positive, as stored. */
  amount: number;
  /** Negative for money leaving the wallet. What the UI should show. */
  signedAmount: number;
  balanceAfter: number | null;
  currency: string;
  shipmentId: string | null;
  shipmentNumber: string | null;
  notes: string | null;
  /** Set only when a person moved this money by hand. */
  actorName: string | null;
  razorpayPaymentId: string | null;
};

export type WalletTxnsResult = {
  rows: WalletTxnRow[];
  totalRows: number;
  pageCount: number;
  /** Net movement across every row matching the filters, not just this page. */
  filteredNet: number;
  filteredIn: number;
  filteredOut: number;
};

export type WalletTxnFilters = {
  page: number;
  pageSize: number;
  sortField: TxnSortField;
  sortDir: "asc" | "desc";
  orgId?: string;
  types?: WalletTxnType[];
  statuses?: WalletTxnStatus[];
  from?: Date;
  to?: Date;
  query?: string;
};

function buildTxnWhere(filters: WalletTxnFilters): Prisma.WalletTransactionWhereInput {
  const where: Prisma.WalletTransactionWhereInput = {};

  if (filters.orgId) where.wallet = { orgId: filters.orgId };
  if (filters.types?.length) where.type = { in: filters.types };
  if (filters.statuses?.length) where.status = { in: filters.statuses };

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const needle = filters.query?.trim();
  if (needle) {
    // Searches the things someone actually has in hand when investigating: a
    // note, a shipment number off a document, or a Razorpay payment id from an
    // email. Org name is included so the box works before picking an org filter.
    where.OR = [
      { notes: { contains: needle, mode: "insensitive" } },
      { razorpayPaymentId: { contains: needle, mode: "insensitive" } },
      { razorpayOrderId: { contains: needle, mode: "insensitive" } },
      { createdByName: { contains: needle, mode: "insensitive" } },
      { shipment: { shipmentNumber: { contains: needle, mode: "insensitive" } } },
      { wallet: { org: { name: { contains: needle, mode: "insensitive" } } } },
      { wallet: { org: { companyName: { contains: needle, mode: "insensitive" } } } },
    ];
  }

  return where;
}

export async function getWalletTransactionsPage(
  filters: WalletTxnFilters,
): Promise<WalletTxnsResult> {
  try {
    const where = buildTxnWhere(filters);
    const skip = (Math.max(1, filters.page) - 1) * filters.pageSize;

    const [rows, totalRows, creditTotals, debitTotals] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { [filters.sortField]: filters.sortDir },
        skip,
        take: filters.pageSize,
        select: {
          id: true,
          createdAt: true,
          type: true,
          status: true,
          amount: true,
          balanceAfter: true,
          currency: true,
          notes: true,
          createdByName: true,
          razorpayPaymentId: true,
          shipmentId: true,
          shipment: { select: { shipmentNumber: true } },
          wallet: {
            select: { orgId: true, org: { select: { name: true, companyName: true } } },
          },
        },
      }),

      prisma.walletTransaction.count({ where }),

      // Totals cover the whole filtered set, not the visible page. A footer that
      // only added up one page of a ledger would be actively misleading.
      prisma.walletTransaction.aggregate({
        where: { ...where, status: "SUCCESS", type: { in: [...CREDIT_TYPES] } },
        _sum: { amount: true },
      }),

      prisma.walletTransaction.aggregate({
        where: { ...where, status: "SUCCESS", type: { in: [...DEBIT_TYPES] } },
        _sum: { amount: true },
      }),
    ]);

    const filteredIn = toNumber(creditTotals._sum.amount);
    const filteredOut = toNumber(debitTotals._sum.amount);

    return {
      rows: rows.map((t) => {
        const amount = toNumber(t.amount);
        return {
          id: t.id,
          createdAt: t.createdAt.toISOString(),
          orgId: t.wallet?.orgId ?? null,
          orgName: t.wallet?.org?.companyName?.trim() || t.wallet?.org?.name || "Unknown",
          type: t.type,
          status: t.status,
          amount,
          signedAmount: amount * amountSign(t.type),
          balanceAfter: t.balanceAfter == null ? null : toNumber(t.balanceAfter),
          currency: t.currency,
          shipmentId: t.shipmentId,
          shipmentNumber: t.shipment?.shipmentNumber ?? null,
          notes: t.notes,
          actorName: t.createdByName,
          razorpayPaymentId: t.razorpayPaymentId,
        };
      }),
      totalRows,
      pageCount: Math.max(1, Math.ceil(totalRows / filters.pageSize)),
      filteredNet: filteredIn - filteredOut,
      filteredIn,
      filteredOut,
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "getWalletTransactionsPage" },
      extra: { filters },
    });
    throw error;
  }
}

export async function getWalletTransactionsForExport(
  filters: Omit<WalletTxnFilters, "page" | "pageSize">,
): Promise<{ rows: WalletTxnRow[]; truncated: boolean }> {
  const result = await getWalletTransactionsPage({
    ...filters,
    page: 1,
    pageSize: EXPORT_ROW_CAP,
  });

  return { rows: result.rows, truncated: result.totalRows > EXPORT_ROW_CAP };
}

// ---------------------------------------------------------------------------
// Collections tab
// ---------------------------------------------------------------------------

/** Which collection statuses each filter shows. */
const COLLECTION_FILTER_STATUSES: Record<CollectionFilter, PaymentCollectionStatus[]> = {
  // The default: everything still owing us money, which is the working queue.
  outstanding: ["PENDING", "PART_PAID"],
  pending: ["PENDING"],
  part_paid: ["PART_PAID"],
  collected: ["COLLECTED"],
  written_off: ["WRITTEN_OFF"],
  all: ["PENDING", "PART_PAID", "COLLECTED", "WRITTEN_OFF"],
};

export type CollectionPaymentDTO = {
  id: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  note: string | null;
  collectedAt: string;
  recordedByName: string | null;
  reversedAt: string | null;
  reversedByName: string | null;
  reversalReason: string | null;
};

export type CollectionRow = {
  shipmentId: string;
  shipmentNumber: string;
  orgId: string;
  orgName: string;
  clientName: string | null;
  shipmentStatus: ShipmentStatus;
  collectionStatus: PaymentCollectionStatus;
  /** What the booking was worth. Null on legacy rows that never got a total. */
  quotedTotal: number | null;
  collected: number;
  owed: number;
  currency: string;
  bookedAt: string | null;
  /** Whole days since booking. Drives the aging colour in the UI. */
  ageDays: number;
  payments: CollectionPaymentDTO[];
};

export type CollectionsResult = {
  rows: CollectionRow[];
  totalRows: number;
  pageCount: number;
  /** Totals across the whole filtered set. */
  totalOwed: number;
  totalCollected: number;
};

/**
 * The collections queue: bookings allowed to skip payment, and where each one
 * stands.
 *
 * Filters and sorts in memory for the same reason as the organisations table:
 * "owed" is a computed difference that SQL cannot order without a generated
 * column, and offering sorting on every column but that one reads as broken. This
 * is a queue ops works down rather than an archive, so it stays small. If the
 * COLLECTED and WRITTEN_OFF history ever grows past a few thousand rows, the
 * archive filters want real SQL pagination.
 */
/**
 * Exactly what `toCollectionRow` needs. Declared as a Prisma select so the
 * collections queue and the booking detail page cannot drift apart: adding a
 * field here is a type error at every call site until it is selected.
 */
export const COLLECTION_SELECT = {
  id: true,
  shipmentNumber: true,
  status: true,
  paymentCollectionStatus: true,
  paymentCollectedAmount: true,
  quotedTotal: true,
  currency: true,
  bookedAt: true,
  createdAt: true,
  orgId: true,
  org: { select: { name: true, companyName: true } },
  client: { select: { companyName: true } },
  paymentCollections: {
    orderBy: { collectedAt: "desc" },
    select: {
      id: true,
      amount: true,
      currency: true,
      method: true,
      reference: true,
      note: true,
      collectedAt: true,
      recordedByName: true,
      reversedAt: true,
      reversedByName: true,
      reversalReason: true,
    },
  },
} satisfies Prisma.ShipmentSelect;

type CollectionSource = Prisma.ShipmentGetPayload<{ select: typeof COLLECTION_SELECT }>;

/**
 * Shipment row to wire-safe collection row.
 *
 * Shared with the arena booking detail page, which shows the same figures on the
 * shipment itself. Ops members can record a payment there but cannot reach the
 * admin-only wallets screen, so both surfaces have to agree on what is owed.
 */
export function toCollectionRow(s: CollectionSource, now = Date.now()): CollectionRow {
  const quotedTotal = s.quotedTotal == null ? null : toNumber(s.quotedTotal);
  const collected = toNumber(s.paymentCollectedAmount);
  const reference = s.bookedAt ?? s.createdAt;

  return {
    shipmentId: s.id,
    shipmentNumber: s.shipmentNumber,
    orgId: s.orgId,
    orgName: s.org.companyName?.trim() || s.org.name,
    clientName: s.client?.companyName ?? null,
    shipmentStatus: s.status,
    collectionStatus: s.paymentCollectionStatus,
    quotedTotal,
    collected,
    // Never negative: over-collecting is a data problem, not a negative debt, and
    // a negative here would quietly reduce the queue total.
    owed: Math.max(0, (quotedTotal ?? 0) - collected),
    currency: s.currency,
    bookedAt: s.bookedAt?.toISOString() ?? null,
    ageDays: Math.floor((now - reference.getTime()) / 86_400_000),
    payments: s.paymentCollections.map((p) => ({
      id: p.id,
      amount: toNumber(p.amount),
      currency: p.currency,
      method: p.method,
      reference: p.reference,
      note: p.note,
      collectedAt: p.collectedAt.toISOString(),
      recordedByName: p.recordedByName,
      reversedAt: p.reversedAt?.toISOString() ?? null,
      reversedByName: p.reversedByName,
      reversalReason: p.reversalReason,
    })),
  };
}

export async function getCollectionsPage(params: {
  page: number;
  pageSize: number;
  sortField: CollectionSortField;
  sortDir: "asc" | "desc";
  filter: CollectionFilter;
  query?: string;
}): Promise<CollectionsResult> {
  const { page, pageSize, sortField, sortDir, filter, query } = params;

  try {
    const shipments = await prisma.shipment.findMany({
      where: {
        paymentDeferred: true,
        paymentCollectionStatus: { in: COLLECTION_FILTER_STATUSES[filter] },
      },
      select: COLLECTION_SELECT,
    });

    const now = Date.now();
    let rows: CollectionRow[] = shipments.map((s) => toCollectionRow(s, now));

    const needle = query?.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(
        (r) =>
          r.shipmentNumber.toLowerCase().includes(needle) ||
          r.orgName.toLowerCase().includes(needle) ||
          (r.clientName?.toLowerCase().includes(needle) ?? false),
      );
    }

    const totalOwed = rows.reduce((sum, r) => sum + r.owed, 0);
    const totalCollected = rows.reduce((sum, r) => sum + r.collected, 0);

    const direction = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortField) {
        case "owed":
          return (a.owed - b.owed) * direction;
        case "org":
          return a.orgName.localeCompare(b.orgName) * direction;
        case "bookedAt":
          return (a.ageDays - b.ageDays) * -direction;
      }
    });

    const totalRows = rows.length;
    const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.min(Math.max(1, page), pageCount);
    const start = (safePage - 1) * pageSize;

    return {
      rows: rows.slice(start, start + pageSize),
      totalRows,
      pageCount,
      totalOwed,
      totalCollected,
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "getCollectionsPage" },
      extra: { params },
    });
    throw error;
  }
}

/** Org list for the ledger's org filter. Small, so no search or pagination. */
export async function getOrgFilterOptions(): Promise<{ id: string; name: string }[]> {
  const orgs = await prisma.org.findMany({
    where: { deletedAt: null, wallet: { isNot: null } },
    select: { id: true, name: true, companyName: true },
    orderBy: { name: "asc" },
  });

  return orgs.map((o) => ({ id: o.id, name: o.companyName?.trim() || o.name }));
}
