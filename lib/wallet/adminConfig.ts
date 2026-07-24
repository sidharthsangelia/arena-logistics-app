/**
 * ARENA MONEY: SHARED CONFIG AND WIRE TYPES
 * -----------------------------------------------------------------------------
 * Deliberately free of `server-only`, Prisma and any server import, because both
 * the queries and the client tables need these.
 *
 * The query modules (adminQueries.ts, adminLedger.ts) are `server-only`, so a
 * client component importing a runtime value from either is a build error. Labels,
 * sort field lists and filter names are exactly the things a client table needs at
 * runtime, so they live here instead.
 *
 * Every amount in these types is a plain number rather than a Prisma Decimal.
 * Decimal survives neither JSON nor the server to client boundary, so the
 * conversion happens once in the query layer and everything downstream is
 * ordinary arithmetic.
 */

// ---------------------------------------------------------------------------
// Tabs
//
// Keys, labels and the coercion live here rather than beside the tab bar, because
// the server page has to resolve the active tab before it can decide which query
// to run. A `"use client"` module can only be rendered by the server, never called
// into, so exporting `coerceWalletTab` from the tab bar was a runtime error that
// no amount of typechecking would catch.
//
// Icons stay in the client component. They are React components, and keeping them
// out of shared modules matches how the sidebar nav config is arranged.
// ---------------------------------------------------------------------------

export const WALLET_TAB_KEYS = [
  "overview",
  "organisations",
  "transactions",
  "collections",
] as const;

export type WalletTabKey = (typeof WALLET_TAB_KEYS)[number];

export const WALLET_TAB_META: Record<WalletTabKey, { label: string; hint: string }> = {
  overview: { label: "Overview", hint: "How money is moving" },
  organisations: {
    label: "Organisations",
    hint: "Who is holding a balance, and who is running dry",
  },
  transactions: { label: "Transactions", hint: "Every movement in and out" },
  collections: { label: "Collections", hint: "Bookings that still owe us money" },
};

export function coerceWalletTab(value: unknown): WalletTabKey {
  return WALLET_TAB_KEYS.includes(value as WalletTabKey)
    ? (value as WalletTabKey)
    : "overview";
}

// ---------------------------------------------------------------------------
// Period
// ---------------------------------------------------------------------------

export const MONEY_PERIODS = {
  "7d": { days: 7, label: "Last 7 days" },
  "30d": { days: 30, label: "Last 30 days" },
  "90d": { days: 90, label: "Last 90 days" },
} as const;

export type MoneyPeriod = keyof typeof MONEY_PERIODS;
export const DEFAULT_MONEY_PERIOD: MoneyPeriod = "30d";

export function coerceMoneyPeriod(value: unknown): MoneyPeriod {
  // Object.hasOwn rather than `in`, which also matches inherited keys. `in` let
  // ?period=toString through, and MONEY_PERIODS["toString"].days is undefined,
  // which makes setDate(NaN) and hands an Invalid Date to the query.
  return typeof value === "string" && Object.hasOwn(MONEY_PERIODS, value)
    ? (value as MoneyPeriod)
    : DEFAULT_MONEY_PERIOD;
}

// ---------------------------------------------------------------------------
// Transaction direction
// ---------------------------------------------------------------------------

/** Money coming in. A refund puts money back in the wallet, so it counts here. */
export const CREDIT_TYPES = ["TOP_UP", "MANUAL_CREDIT", "REFUND"] as const;
/** Money going out of a wallet. */
export const DEBIT_TYPES = ["SHIPMENT_DEBIT", "MANUAL_DEBIT"] as const;

/**
 * A top-up sits at PENDING between Razorpay checkout opening and the webhook
 * landing. Past this, it is almost certainly an abandoned checkout rather than a
 * payment in flight, and worth surfacing.
 */
export const STALE_TOPUP_MINUTES = 30;

/** Ops works this queue in IST, so days must be bucketed in IST, not UTC. */
export const REPORTING_TIMEZONE = "Asia/Kolkata";

// ---------------------------------------------------------------------------
// Overview types
// ---------------------------------------------------------------------------

export type DailyMoneyPoint = {
  /** YYYY-MM-DD in IST. */
  date: string;
  moneyIn: number;
  moneyOut: number;
};

export type AgingBucket = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

export type MoneyAttention = {
  /** Top-ups stuck at PENDING long enough to be abandoned checkouts. */
  staleTopUpCount: number;
  staleTopUpAmount: number;
  /** Payments the bank rejected, in the selected period. */
  failedTopUpCount: number;
  failedTopUpAmount: number;
};

export type WalletOverviewDTO = {
  currency: string;
  period: MoneyPeriod;

  /** Sum of every wallet balance. Money customers have paid but not yet spent. */
  heldInWallets: number;
  walletCount: number;
  /** Wallets at or under the low balance line. */
  lowBalanceCount: number;

  toppedUp: number;
  toppedUpCount: number;
  spent: number;
  spentCount: number;
  refunded: number;

  /** Owed to us on bookings that were allowed to skip payment. */
  awaitingCollection: number;
  awaitingCollectionCount: number;

  series: DailyMoneyPoint[];
  aging: AgingBucket[];
  attention: MoneyAttention;
};

export const AGING_BUCKETS: { key: string; label: string; upToDays: number | null }[] = [
  { key: "0-7", label: "Up to a week", upToDays: 7 },
  { key: "8-15", label: "1 to 2 weeks", upToDays: 15 },
  { key: "16-30", label: "2 to 4 weeks", upToDays: 30 },
  { key: "30+", label: "Over a month", upToDays: null },
];

// ---------------------------------------------------------------------------
// Organisations tab
// ---------------------------------------------------------------------------

export const ORG_SORT_FIELDS = [
  "name",
  "balance",
  "toppedUp",
  "spent",
  "lastActivity",
] as const;
export type OrgSortField = (typeof ORG_SORT_FIELDS)[number];

export const BALANCE_FILTERS = ["all", "low", "empty", "healthy"] as const;
export type BalanceFilter = (typeof BALANCE_FILTERS)[number];

export type WalletOrgRow = {
  orgId: string;
  orgName: string;
  isBusinessAssociate: boolean;
  /** Books without paying up front, so a zero balance is not a problem for them. */
  skipPayment: boolean;
  hasWallet: boolean;
  balance: number;
  currency: string;
  toppedUp: number;
  spent: number;
  /** Last successful movement in or out, not merely a row being written. */
  lastActivity: string | null;
  isLow: boolean;
};

export type WalletOrgsResult = {
  rows: WalletOrgRow[];
  totalRows: number;
  pageCount: number;
  lowThreshold: number;
};

// ---------------------------------------------------------------------------
// Transactions tab
// ---------------------------------------------------------------------------

export const LEDGER_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
export const DEFAULT_LEDGER_PAGE_SIZE = 50;

export const TXN_SORT_FIELDS = ["createdAt", "amount"] as const;
export type TxnSortField = (typeof TXN_SORT_FIELDS)[number];

/** Every row matching the filters, for CSV export, capped so one bad filter cannot
 *  try to serialise the whole ledger into a single response. */
export const EXPORT_ROW_CAP = 5000;

// ---------------------------------------------------------------------------
// Collections tab
// ---------------------------------------------------------------------------

export const COLLECTION_SORT_FIELDS = ["bookedAt", "owed", "org"] as const;
export type CollectionSortField = (typeof COLLECTION_SORT_FIELDS)[number];

export const COLLECTION_FILTERS = [
  "outstanding",
  "pending",
  "part_paid",
  "collected",
  "written_off",
  "all",
] as const;
export type CollectionFilter = (typeof COLLECTION_FILTERS)[number];
