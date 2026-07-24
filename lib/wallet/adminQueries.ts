import "server-only";

import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { Prisma } from "@/generated/prisma";
import { resolveLowBalanceThreshold } from "@/utils/wallet/config";
import {
  AGING_BUCKETS,
  CREDIT_TYPES,
  DEBIT_TYPES,
  MONEY_PERIODS,
  REPORTING_TIMEZONE,
  STALE_TOPUP_MINUTES,
  type AgingBucket,
  type BalanceFilter,
  type DailyMoneyPoint,
  type MoneyPeriod,
  type OrgSortField,
  type WalletOrgRow,
  type WalletOrgsResult,
  type WalletOverviewDTO,
} from "./adminConfig";

/**
 * ARENA MONEY READS
 * -----------------------------------------------------------------------------
 * Everything the /arena-dashboard/wallets screen reads. Admin-only data, so the
 * page and every action re-check `requireArenaAdmin()` for themselves; nothing
 * here assumes it was called by someone allowed to see the result.
 *
 * NOT CACHED, on purpose. The tenant header chip caches its balance hard because
 * it is glanced at constantly and rarely changes. This screen is the opposite:
 * someone opens it to answer a question about money right now, often straight
 * after recording a payment, and a stale figure would be worse than a slow one.
 *
 * CURRENCY. Every wallet in the system is INR and there is no path to create one
 * in another currency, so totals here add up in a single unit. If a second
 * currency ever appears, these aggregates become wrong rather than merely
 * incomplete, so `assertSingleCurrency` reports it to Sentry instead of silently
 * summing rupees and dollars together.
 *
 * DECIMALS. Prisma hands back `Decimal`, which survives neither JSON nor the
 * server to client boundary. Every DTO below exposes plain numbers, converted at
 * the edge. Amounts here are display and reporting figures; the arithmetic that
 * actually moves money stays in Decimal inside utils/wallet/service.ts.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

function periodStart(period: MoneyPeriod): Date {
  const start = new Date();
  start.setDate(start.getDate() - MONEY_PERIODS[period].days);
  return start;
}

/**
 * Every total on this screen adds amounts together without converting between
 * currencies, which is correct only while there is exactly one. Reports rather
 * than throws: a second currency should page us, not break the money screen for
 * the person trying to investigate it.
 */
async function assertSingleCurrency(): Promise<string> {
  const groups = await prisma.wallet.groupBy({
    by: ["currency"],
    _count: { _all: true },
  });

  if (groups.length > 1) {
    Sentry.captureMessage("Arena wallets screen: more than one wallet currency", {
      level: "error",
      tags: { location: "adminQueries.assertSingleCurrency" },
      extra: { currencies: groups.map((g) => g.currency) },
    });
  }

  return groups[0]?.currency ?? "INR";
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getWalletOverview(period: MoneyPeriod): Promise<WalletOverviewDTO> {
  try {
    const since = periodStart(period);
    const lowThreshold = resolveLowBalanceThreshold();
    const staleBefore = new Date(Date.now() - STALE_TOPUP_MINUTES * 60_000);

    const [
      currency,
      walletTotals,
      lowBalanceCount,
      creditTotals,
      debitTotals,
      refundTotals,
      staleTopUps,
      failedTopUps,
      collections,
      series,
      aging,
    ] = await Promise.all([
      assertSingleCurrency(),

      prisma.wallet.aggregate({ _sum: { balance: true }, _count: { _all: true } }),

      prisma.wallet.count({ where: { balance: { lte: lowThreshold } } }),

      prisma.walletTransaction.aggregate({
        where: { status: "SUCCESS", type: { in: ["TOP_UP", "MANUAL_CREDIT"] }, createdAt: { gte: since } },
        _sum: { amount: true },
        _count: { _all: true },
      }),

      prisma.walletTransaction.aggregate({
        where: { status: "SUCCESS", type: { in: [...DEBIT_TYPES] }, createdAt: { gte: since } },
        _sum: { amount: true },
        _count: { _all: true },
      }),

      prisma.walletTransaction.aggregate({
        where: { status: "SUCCESS", type: "REFUND", createdAt: { gte: since } },
        _sum: { amount: true },
      }),

      prisma.walletTransaction.aggregate({
        where: { status: "PENDING", type: "TOP_UP", createdAt: { lt: staleBefore } },
        _sum: { amount: true },
        _count: { _all: true },
      }),

      prisma.walletTransaction.aggregate({
        where: { status: "FAILED", createdAt: { gte: since } },
        _sum: { amount: true },
        _count: { _all: true },
      }),

      getAwaitingCollectionTotal(),

      getDailyMoneySeries(since),

      getCollectionAging(),
    ]);

    return {
      currency,
      period,
      heldInWallets: toNumber(walletTotals._sum.balance),
      walletCount: walletTotals._count._all,
      lowBalanceCount,
      toppedUp: toNumber(creditTotals._sum.amount),
      toppedUpCount: creditTotals._count._all,
      spent: toNumber(debitTotals._sum.amount),
      spentCount: debitTotals._count._all,
      refunded: toNumber(refundTotals._sum.amount),
      awaitingCollection: collections.amount,
      awaitingCollectionCount: collections.count,
      series,
      aging,
      attention: {
        staleTopUpCount: staleTopUps._count._all,
        staleTopUpAmount: toNumber(staleTopUps._sum.amount),
        failedTopUpCount: failedTopUps._count._all,
        failedTopUpAmount: toNumber(failedTopUps._sum.amount),
      },
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "getWalletOverview" },
      extra: { period },
    });
    throw error;
  }
}

/**
 * Money in and money out per day, bucketed in IST so a 11pm booking lands on the
 * day ops actually made it. Gaps are filled with zeroes: a bar chart that skips
 * quiet days silently compresses time and misreads as busier than it was.
 */
async function getDailyMoneySeries(since: Date): Promise<DailyMoneyPoint[]> {
  const rows = await prisma.$queryRaw<
    { day: string; money_in: unknown; money_out: unknown }[]
  >`
    SELECT
      to_char(date_trunc('day', "createdAt" AT TIME ZONE ${REPORTING_TIMEZONE}), 'YYYY-MM-DD') AS day,
      SUM(CASE WHEN type::text = ANY(${[...CREDIT_TYPES]}) THEN amount ELSE 0 END) AS money_in,
      SUM(CASE WHEN type::text = ANY(${[...DEBIT_TYPES]}) THEN amount ELSE 0 END) AS money_out
    FROM "WalletTransaction"
    WHERE status = 'SUCCESS' AND "createdAt" >= ${since}
    GROUP BY 1
    ORDER BY 1
  `;

  const byDay = new Map(
    rows.map((r) => [
      r.day,
      { moneyIn: toNumber(r.money_in as string), moneyOut: toNumber(r.money_out as string) },
    ]),
  );

  const points: DailyMoneyPoint[] = [];
  const cursor = new Date(since);
  const today = new Date();

  while (cursor <= today) {
    const key = istDateKey(cursor);
    const found = byDay.get(key);
    points.push({ date: key, moneyIn: found?.moneyIn ?? 0, moneyOut: found?.moneyOut ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return points;
}

/** YYYY-MM-DD for a Date, as seen in IST. Matches the SQL bucketing above. */
function istDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORTING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Total still owed on deferred bookings. */
async function getAwaitingCollectionTotal(): Promise<{ amount: number; count: number }> {
  const rows = await prisma.$queryRaw<{ owed: unknown; n: bigint }[]>`
    SELECT
      COALESCE(SUM(COALESCE("quotedTotal", 0) - "paymentCollectedAmount"), 0) AS owed,
      COUNT(*) AS n
    FROM "Shipment"
    WHERE "paymentDeferred" = true
      AND "paymentCollectionStatus" IN ('PENDING', 'PART_PAID')
  `;

  return {
    amount: toNumber(rows[0]?.owed as string),
    count: Number(rows[0]?.n ?? 0),
  };
}

/**
 * How old the money owed to us is. Standard receivables aging: the longer a
 * bucket, the less likely it is ever collected, which is exactly the thing worth
 * looking at rather than the total alone.
 */
async function getCollectionAging(): Promise<AgingBucket[]> {
  const rows = await prisma.$queryRaw<{ age_days: unknown; owed: unknown }[]>`
    SELECT
      EXTRACT(EPOCH FROM (now() - COALESCE("bookedAt", "createdAt"))) / 86400 AS age_days,
      COALESCE("quotedTotal", 0) - "paymentCollectedAmount" AS owed
    FROM "Shipment"
    WHERE "paymentDeferred" = true
      AND "paymentCollectionStatus" IN ('PENDING', 'PART_PAID')
  `;

  const totals = new Map(AGING_BUCKETS.map((b) => [b.key, { amount: 0, count: 0 }]));

  for (const row of rows) {
    const age = toNumber(row.age_days as string);
    const owed = toNumber(row.owed as string);
    const bucket =
      AGING_BUCKETS.find((b) => b.upToDays !== null && age < b.upToDays) ??
      AGING_BUCKETS[AGING_BUCKETS.length - 1];

    const entry = totals.get(bucket.key)!;
    entry.amount += owed;
    entry.count += 1;
  }

  return AGING_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    amount: totals.get(b.key)!.amount,
    count: totals.get(b.key)!.count,
  }));
}

// ---------------------------------------------------------------------------
// Organisations tab
// ---------------------------------------------------------------------------

/**
 * The organisations table.
 *
 * Filters, sorts and paginates in memory rather than in SQL. Two of the columns
 * (topped up and spent in the selected period) are aggregates that cannot be
 * ordered in the query, and the alternative is offering sorting on some columns
 * but not others, which reads as broken. Orgs are a small table measured in tens,
 * and unlike shipments they do not grow per booking, so loading them all is
 * cheap. If this ever reaches thousands of orgs it wants rewriting as one raw
 * query with the aggregates joined in.
 */
export async function getWalletOrgsPage(params: {
  period: MoneyPeriod;
  page: number;
  pageSize: number;
  sortField: OrgSortField;
  sortDir: "asc" | "desc";
  balance: BalanceFilter;
  query?: string;
}): Promise<WalletOrgsResult> {
  const { period, page, pageSize, sortField, sortDir, balance, query } = params;

  try {
    const since = periodStart(period);
    const lowThreshold = resolveLowBalanceThreshold();

    const [orgs, movements] = await Promise.all([
      prisma.org.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          companyName: true,
          isBusinessAssociate: true,
          skipPayment: true,
          wallet: { select: { id: true, balance: true, currency: true } },
        },
      }),

      prisma.walletTransaction.groupBy({
        by: ["walletId", "type"],
        where: { status: "SUCCESS", createdAt: { gte: since } },
        _sum: { amount: true },
        _max: { createdAt: true },
      }),
    ]);

    // walletId -> in-period totals. One pass, so the per-org lookup below is O(1).
    const byWallet = new Map<
      string,
      { toppedUp: number; spent: number; lastActivity: Date | null }
    >();

    for (const m of movements) {
      const entry =
        byWallet.get(m.walletId) ?? { toppedUp: 0, spent: 0, lastActivity: null };
      const amount = toNumber(m._sum.amount);

      if ((CREDIT_TYPES as readonly string[]).includes(m.type)) entry.toppedUp += amount;
      if ((DEBIT_TYPES as readonly string[]).includes(m.type)) entry.spent += amount;

      const last = m._max.createdAt;
      if (last && (!entry.lastActivity || last > entry.lastActivity)) {
        entry.lastActivity = last;
      }

      byWallet.set(m.walletId, entry);
    }

    let rows: WalletOrgRow[] = orgs.map((org) => {
      const wallet = org.wallet;
      const movement = wallet ? byWallet.get(wallet.id) : undefined;
      const walletBalance = toNumber(wallet?.balance);

      return {
        orgId: org.id,
        orgName: org.companyName?.trim() || org.name,
        isBusinessAssociate: org.isBusinessAssociate,
        skipPayment: org.skipPayment,
        hasWallet: Boolean(wallet),
        balance: walletBalance,
        currency: wallet?.currency ?? "INR",
        toppedUp: movement?.toppedUp ?? 0,
        spent: movement?.spent ?? 0,
        lastActivity: movement?.lastActivity?.toISOString() ?? null,
        // An org that never pays up front is not "low", it is simply not using a
        // wallet. Flagging them would fill the queue with orgs nobody can act on.
        isLow: Boolean(wallet) && !org.skipPayment && walletBalance <= lowThreshold,
      };
    });

    const needle = query?.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((r) => r.orgName.toLowerCase().includes(needle));
    }

    if (balance === "low") rows = rows.filter((r) => r.isLow);
    if (balance === "empty") rows = rows.filter((r) => r.hasWallet && r.balance <= 0);
    if (balance === "healthy") rows = rows.filter((r) => r.hasWallet && !r.isLow);

    const direction = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortField) {
        case "name":
          return a.orgName.localeCompare(b.orgName) * direction;
        case "balance":
          return (a.balance - b.balance) * direction;
        case "toppedUp":
          return (a.toppedUp - b.toppedUp) * direction;
        case "spent":
          return (a.spent - b.spent) * direction;
        case "lastActivity": {
          // Never-active orgs sort last in either direction. They carry no
          // information, and letting them head the list buries the useful rows.
          if (!a.lastActivity && !b.lastActivity) return 0;
          if (!a.lastActivity) return 1;
          if (!b.lastActivity) return -1;
          return (Date.parse(a.lastActivity) - Date.parse(b.lastActivity)) * direction;
        }
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
      lowThreshold,
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "getWalletOrgsPage" },
      extra: { params },
    });
    throw error;
  }
}
