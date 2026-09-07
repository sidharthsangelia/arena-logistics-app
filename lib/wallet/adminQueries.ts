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
  type WalletSummaryDTO,
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
 * ROUND TRIPS, NOT QUERY COST. The production dataset is small — tens of orgs,
 * tens of wallet transactions — so nothing here is slow because the database is
 * working hard. It is slow because every statement is a trip across the internet
 * to Neon. Read that as the budget: the unit of cost on this screen is the
 * statement, not the row. Adding a query to a function here is expensive in a way
 * that adding a column to one is not.
 *
 * CURRENCY. Every wallet in the system is INR and there is no path to create one
 * in another currency, so totals here add up in a single unit. If a second
 * currency ever appears, these aggregates become wrong rather than merely
 * incomplete, so the summary query counts distinct currencies and reports to
 * Sentry instead of silently summing rupees and dollars together.
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

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------
//
// ── WHY THIS IS THREE FUNCTIONS AND THREE SQL STATEMENTS ────────────────────
// This used to be one function issuing eleven queries through Promise.all and
// returning one DTO. Promise.all is not free here: the app talks to Neon over
// the open internet, and measured from a Mumbai function against the Singapore
// database a single round trip costs about 75ms while ten in parallel cost
// 338ms — the pool does not fan out for free. Those eleven aggregates measured
// 212ms against production data of seventy-six wallet transactions. Almost none
// of that was the database doing work.
//
// So the fix is not a faster query, it is fewer of them. Each function below is
// exactly one round trip, and the three are independent: the figures do not wait
// on the charts and the charts do not wait on each other. The page gives each its
// own Suspense boundary, so the tiles paint as soon as their statement returns.
//
// Aggregates are computed with FILTER rather than by scanning the table once per
// figure. Postgres evaluates every one of them in a single pass.

/**
 * Every figure on the overview tiles, plus the attention strip, in one
 * statement.
 *
 * The three tables involved (Wallet, WalletTransaction, Shipment) are unrelated
 * to each other here — nothing joins, they are three independent aggregates that
 * happen to be displayed together. That is why they are scalar subqueries in one
 * statement rather than a join: a join across them would multiply rows and the
 * sums would be wrong.
 *
 * `toppedUp` deliberately counts TOP_UP and MANUAL_CREDIT only, not the whole of
 * CREDIT_TYPES. A refund is money going back to a customer, not money arriving,
 * and it is reported on its own line.
 */
export async function getWalletSummary(period: MoneyPeriod): Promise<WalletSummaryDTO> {
  try {
    const since = periodStart(period);
    const lowThreshold = resolveLowBalanceThreshold();
    const staleBefore = new Date(Date.now() - STALE_TOPUP_MINUTES * 60_000);

    const [row] = await prisma.$queryRaw<
      {
        currency: string | null;
        currency_count: bigint;
        held: unknown;
        wallet_count: bigint;
        low_count: bigint;
        topped_up: unknown;
        topped_up_count: bigint;
        spent: unknown;
        spent_count: bigint;
        refunded: unknown;
        stale_amount: unknown;
        stale_count: bigint;
        failed_amount: unknown;
        failed_count: bigint;
        awaiting: unknown;
        awaiting_count: bigint;
      }[]
    >`
      WITH wallets AS (
        SELECT
          MIN(currency)                                             AS currency,
          COUNT(DISTINCT currency)                                  AS currency_count,
          COALESCE(SUM(balance), 0)                                 AS held,
          COUNT(*)                                                  AS wallet_count,
          COUNT(*) FILTER (WHERE balance <= ${lowThreshold})        AS low_count
        FROM "Wallet"
      ),
      txns AS (
        SELECT
          COALESCE(SUM(amount) FILTER (
            WHERE status = 'SUCCESS' AND type::text = ANY(${["TOP_UP", "MANUAL_CREDIT"]})
              AND "createdAt" >= ${since}), 0)                      AS topped_up,
          COUNT(*) FILTER (
            WHERE status = 'SUCCESS' AND type::text = ANY(${["TOP_UP", "MANUAL_CREDIT"]})
              AND "createdAt" >= ${since})                          AS topped_up_count,

          COALESCE(SUM(amount) FILTER (
            WHERE status = 'SUCCESS' AND type::text = ANY(${[...DEBIT_TYPES]})
              AND "createdAt" >= ${since}), 0)                      AS spent,
          COUNT(*) FILTER (
            WHERE status = 'SUCCESS' AND type::text = ANY(${[...DEBIT_TYPES]})
              AND "createdAt" >= ${since})                          AS spent_count,

          COALESCE(SUM(amount) FILTER (
            WHERE status = 'SUCCESS' AND type = 'REFUND'
              AND "createdAt" >= ${since}), 0)                      AS refunded,

          -- Not bounded by the period on purpose. An abandoned checkout from six
          -- weeks ago is still an abandoned checkout, and narrowing this to the
          -- selected window would hide the oldest and most suspect ones.
          COALESCE(SUM(amount) FILTER (
            WHERE status = 'PENDING' AND type = 'TOP_UP'
              AND "createdAt" < ${staleBefore}), 0)                 AS stale_amount,
          COUNT(*) FILTER (
            WHERE status = 'PENDING' AND type = 'TOP_UP'
              AND "createdAt" < ${staleBefore})                     AS stale_count,

          COALESCE(SUM(amount) FILTER (
            WHERE status = 'FAILED' AND "createdAt" >= ${since}), 0) AS failed_amount,
          COUNT(*) FILTER (
            WHERE status = 'FAILED' AND "createdAt" >= ${since})    AS failed_count
        FROM "WalletTransaction"
      ),
      owed AS (
        SELECT
          COALESCE(SUM(COALESCE("quotedTotal", 0) - "paymentCollectedAmount"), 0) AS awaiting,
          COUNT(*)                                                                AS awaiting_count
        FROM "Shipment"
        WHERE "paymentDeferred" = true
          AND "paymentCollectionStatus" IN ('PENDING', 'PART_PAID')
      )
      SELECT * FROM wallets, txns, owed
    `;

    // Every total on this screen adds amounts together without converting
    // between currencies, which is correct only while there is exactly one.
    // Reported rather than thrown: a second currency should page us, not break
    // the money screen for the person trying to investigate it.
    if (Number(row?.currency_count ?? 0) > 1) {
      Sentry.captureMessage("Arena wallets screen: more than one wallet currency", {
        level: "error",
        tags: { location: "adminQueries.getWalletSummary" },
        extra: { currencyCount: Number(row.currency_count) },
      });
    }

    return {
      currency: row?.currency ?? "INR",
      period,
      heldInWallets: toNumber(row?.held as string),
      walletCount: Number(row?.wallet_count ?? 0),
      lowBalanceCount: Number(row?.low_count ?? 0),
      toppedUp: toNumber(row?.topped_up as string),
      toppedUpCount: Number(row?.topped_up_count ?? 0),
      spent: toNumber(row?.spent as string),
      spentCount: Number(row?.spent_count ?? 0),
      refunded: toNumber(row?.refunded as string),
      awaitingCollection: toNumber(row?.awaiting as string),
      awaitingCollectionCount: Number(row?.awaiting_count ?? 0),
      attention: {
        staleTopUpCount: Number(row?.stale_count ?? 0),
        staleTopUpAmount: toNumber(row?.stale_amount as string),
        failedTopUpCount: Number(row?.failed_count ?? 0),
        failedTopUpAmount: toNumber(row?.failed_amount as string),
      },
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "getWalletSummary" },
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
export async function getMoneyFlowSeries(period: MoneyPeriod): Promise<DailyMoneyPoint[]> {
  try {
    const since = periodStart(period);

    const rows = await prisma.$queryRaw<
      { day: string; money_in: unknown; money_out: unknown }[]
    >`
      SELECT
        to_char(date_trunc('day', "createdAt" AT TIME ZONE ${REPORTING_TIMEZONE}), 'YYYY-MM-DD') AS day,
        SUM(amount) FILTER (WHERE type::text = ANY(${[...CREDIT_TYPES]})) AS money_in,
        SUM(amount) FILTER (WHERE type::text = ANY(${[...DEBIT_TYPES]}))  AS money_out
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
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "getMoneyFlowSeries" },
      extra: { period },
    });
    throw error;
  }
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

/**
 * How old the money owed to us is. Standard receivables aging: the longer a
 * bucket, the less likely it is ever collected, which is exactly the thing worth
 * looking at rather than the total alone.
 *
 * Bucketed in SQL rather than in JavaScript. The previous version selected one
 * row per unpaid deferred shipment and totalled them in a loop, which meant the
 * whole outstanding book crossed the wire on every page load to produce four
 * numbers. The CASE arms are generated from AGING_BUCKETS so the boundaries
 * cannot drift away from the labels rendered next to them.
 */
export async function getCollectionAging(): Promise<AgingBucket[]> {
  try {
    const bounded = AGING_BUCKETS.filter((b) => b.upToDays !== null);
    const overflow = AGING_BUCKETS[AGING_BUCKETS.length - 1];

    const arms = bounded.map(
      (b) =>
        Prisma.sql`WHEN EXTRACT(EPOCH FROM (now() - COALESCE("bookedAt", "createdAt"))) / 86400 < ${b.upToDays} THEN ${b.key}`,
    );

    const rows = await prisma.$queryRaw<{ bucket: string; owed: unknown; n: bigint }[]>`
      SELECT
        CASE ${Prisma.join(arms, " ")} ELSE ${overflow.key} END                    AS bucket,
        COALESCE(SUM(COALESCE("quotedTotal", 0) - "paymentCollectedAmount"), 0)    AS owed,
        COUNT(*)                                                                   AS n
      FROM "Shipment"
      WHERE "paymentDeferred" = true
        AND "paymentCollectionStatus" IN ('PENDING', 'PART_PAID')
      GROUP BY 1
    `;

    const byBucket = new Map(rows.map((r) => [r.bucket, r]));

    // Mapped over the config rather than over the rows, so a bucket with nothing
    // in it still renders as an empty bar. Dropping it would silently change the
    // chart's x-axis depending on the data.
    return AGING_BUCKETS.map((b) => {
      const found = byBucket.get(b.key);
      return {
        key: b.key,
        label: b.label,
        amount: toNumber(found?.owed as string),
        count: Number(found?.n ?? 0),
      };
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "getCollectionAging" },
    });
    throw error;
  }
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
