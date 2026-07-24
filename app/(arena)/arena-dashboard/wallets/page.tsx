import { redirect } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";

import { getArenaAuth } from "@/utils/arena-auth";
import {
  BALANCE_FILTERS,
  COLLECTION_FILTERS,
  COLLECTION_SORT_FIELDS,
  DEFAULT_LEDGER_PAGE_SIZE,
  LEDGER_PAGE_SIZE_OPTIONS,
  ORG_SORT_FIELDS,
  TXN_SORT_FIELDS,
  coerceMoneyPeriod,
  coerceWalletTab,
  type BalanceFilter,
  type CollectionFilter,
  type CollectionSortField,
  type OrgSortField,
  type TxnSortField,
} from "@/lib/wallet/adminConfig";
import { getWalletOrgsPage, getWalletOverview } from "@/lib/wallet/adminQueries";
import {
  getCollectionsPage,
  getOrgFilterOptions,
  getWalletTransactionsPage,
} from "@/lib/wallet/adminLedger";
import { WalletTxnStatus, WalletTxnType } from "@/generated/prisma";

import { CollectionsTable } from "@/components/wallet/admin/CollectionsTable";
import { LedgerTable } from "@/components/wallet/admin/LedgerTable";
import { MoneyPeriodSelect } from "@/components/wallet/admin/MoneyPeriodSelect";
import { OrgBalancesTable } from "@/components/wallet/admin/OrgBalancesTable";
import { WalletOverviewTab } from "@/components/wallet/admin/WalletOverviewTab";
import { WalletTabsNav } from "@/components/wallet/admin/WalletTabsNav";

/**
 * ARENA WALLETS
 * -----------------------------------------------------------------------------
 * Admin-only view of every rupee in the system: what is held in wallets, what
 * moved, and what customers still owe.
 *
 * The role check here is not redundant with proxy.ts. The Next.js docs are
 * explicit that proxy is for optimistic checks rather than authorisation, and the
 * redirect there can be bypassed by anything that does not go through the route
 * matcher. Every action behind this page checks for itself too.
 *
 * Only the visible tab's query runs. The tab and its filters live in the URL, so a
 * link to a filtered ledger is shareable and survives the refresh that follows
 * recording a payment.
 */

type RawSearchParams = Record<string, string | string[] | undefined>;

// ---------------------------------------------------------------------------
// Search param parsing. Anything malformed falls back to a sane default rather
// than throwing, because these values arrive from a URL anyone can edit.
// ---------------------------------------------------------------------------

function readString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function readPage(value: string | string[] | undefined): number {
  const n = Number(readString(value));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function readPageSize(value: string | string[] | undefined, fallback: number): number {
  const n = Number(readString(value));
  return (LEDGER_PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : fallback;
}

function readDir(value: string | string[] | undefined): "asc" | "desc" {
  return readString(value) === "asc" ? "asc" : "desc";
}

function readEnumList<T extends string>(
  value: string | string[] | undefined,
  valid: readonly T[],
): T[] {
  const raw = readString(value);
  if (!raw) return [];
  const allowed = new Set<string>(valid);
  return raw.split(",").filter((v): v is T => allowed.has(v));
}

/** A date-only string from an <input type="date">, as a Date, or undefined. */
function readDate(value: string | string[] | undefined, endOfDay = false): Date | undefined {
  const raw = readString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  // The "to" bound is inclusive of the whole day, which is what someone picking a
  // date on a filter means.
  const parsed = new Date(endOfDay ? `${raw}T23:59:59.999` : `${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default async function ArenaWalletsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { isArenaAdmin } = await getArenaAuth();
  if (!isArenaAdmin) redirect("/arena-dashboard");

  const sp = await searchParams;
  const tab = coerceWalletTab(readString(sp.tab));
  const period = coerceMoneyPeriod(readString(sp.period));

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-screen-2xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Wallets and money</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every rupee across the platform: what you are holding for customers, what
              moved, and what is still owed to you.
            </p>
          </div>

          {/* Hidden on the collections tab, where nothing is period-scoped: a debt
              is either outstanding or it is not, regardless of the window. */}
          {tab !== "collections" && <MoneyPeriodSelect value={period} />}
        </div>

        <WalletTabsNav active={tab} />

        {tab === "overview" && <OverviewPanel period={period} />}
        {tab === "organisations" && <OrganisationsPanel sp={sp} period={period} />}
        {tab === "transactions" && <TransactionsPanel sp={sp} />}
        {tab === "collections" && (
          <CollectionsPanel sp={sp} isArenaAdmin={isArenaAdmin} />
        )}
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Tab panels. Each owns its own query, so switching tabs never pays for the
// others.
// ---------------------------------------------------------------------------

async function OverviewPanel({ period }: { period: ReturnType<typeof coerceMoneyPeriod> }) {
  const data = await getWalletOverview(period);
  return <WalletOverviewTab data={data} />;
}

async function OrganisationsPanel({
  sp,
  period,
}: {
  sp: RawSearchParams;
  period: ReturnType<typeof coerceMoneyPeriod>;
}) {
  const sortRaw = readString(sp.sort) as OrgSortField;
  const sortField: OrgSortField = ORG_SORT_FIELDS.includes(sortRaw) ? sortRaw : "balance";

  const balanceRaw = readString(sp.balance) as BalanceFilter;
  const balance: BalanceFilter = BALANCE_FILTERS.includes(balanceRaw) ? balanceRaw : "all";

  const page = readPage(sp.page);
  const pageSize = readPageSize(sp.pageSize, 20);
  const query = readString(sp.q);

  const result = await getWalletOrgsPage({
    period,
    page,
    pageSize,
    sortField,
    sortDir: readDir(sp.dir),
    balance,
    query: query || undefined,
  });

  return (
    <OrgBalancesTable
      rows={result.rows}
      page={page}
      pageSize={pageSize}
      totalRows={result.totalRows}
      pageCount={result.pageCount}
      sortField={sortField}
      sortDir={readDir(sp.dir)}
      balance={balance}
      query={query}
      period={period}
      lowThreshold={result.lowThreshold}
      currency="INR"
    />
  );
}

async function TransactionsPanel({ sp }: { sp: RawSearchParams }) {
  const sortRaw = readString(sp.sort) as TxnSortField;
  const sortField: TxnSortField = TXN_SORT_FIELDS.includes(sortRaw) ? sortRaw : "createdAt";
  const sortDir = readDir(sp.dir);

  const page = readPage(sp.page);
  const pageSize = readPageSize(sp.pageSize, DEFAULT_LEDGER_PAGE_SIZE);
  const query = readString(sp.q);
  const orgId = readString(sp.orgId);

  const types = readEnumList(sp.type, Object.values(WalletTxnType));
  const statuses = readEnumList(sp.status, Object.values(WalletTxnStatus));

  const from = readDate(sp.from);
  const to = readDate(sp.to, true);

  const [result, orgOptions] = await Promise.all([
    getWalletTransactionsPage({
      page,
      pageSize,
      sortField,
      sortDir,
      orgId: orgId || undefined,
      types: types.length ? types : undefined,
      statuses: statuses.length ? statuses : undefined,
      from,
      to,
      query: query || undefined,
    }),
    getOrgFilterOptions(),
  ]);

  return (
    <LedgerTable
      rows={result.rows}
      page={page}
      pageSize={pageSize}
      totalRows={result.totalRows}
      pageCount={result.pageCount}
      sortField={sortField}
      sortDir={sortDir}
      filteredIn={result.filteredIn}
      filteredOut={result.filteredOut}
      filteredNet={result.filteredNet}
      currency="INR"
      orgOptions={orgOptions}
      selectedOrgId={orgId}
      selectedTypes={types}
      selectedStatuses={statuses}
      from={readString(sp.from)}
      to={readString(sp.to)}
      query={query}
    />
  );
}

async function CollectionsPanel({
  sp,
  isArenaAdmin,
}: {
  sp: RawSearchParams;
  isArenaAdmin: boolean;
}) {
  const sortRaw = readString(sp.sort) as CollectionSortField;
  const sortField: CollectionSortField = COLLECTION_SORT_FIELDS.includes(sortRaw)
    ? sortRaw
    : "bookedAt";

  const filterRaw = readString(sp.filter) as CollectionFilter;
  const filter: CollectionFilter = COLLECTION_FILTERS.includes(filterRaw)
    ? filterRaw
    : "outstanding";

  const page = readPage(sp.page);
  const pageSize = readPageSize(sp.pageSize, 20);
  const query = readString(sp.q);

  // Oldest first by default. The longest-waiting debt is the one at most risk of
  // never being paid, so it belongs at the top of a work queue.
  const sortDir = readString(sp.dir) === "desc" ? "desc" : "asc";

  const result = await getCollectionsPage({
    page,
    pageSize,
    sortField,
    sortDir,
    filter,
    query: query || undefined,
  });

  return (
    <CollectionsTable
      rows={result.rows}
      page={page}
      pageSize={pageSize}
      totalRows={result.totalRows}
      pageCount={result.pageCount}
      sortField={sortField}
      sortDir={sortDir}
      filter={filter}
      query={query}
      totalOwed={result.totalOwed}
      totalCollected={result.totalCollected}
      currency="INR"
      isArenaAdmin={isArenaAdmin}
    />
  );
}
