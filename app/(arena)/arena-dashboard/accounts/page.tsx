// app/(arena)/arena-dashboard/accounts/page.tsx
//
// ACCOUNTS: every organisation that has signed up, associate or not.
//
// This is the answer to "who is on our platform". The Business Associates list
// next door is the same data narrowed to partners, and All Clients is a
// different table entirely (a business associate's own customers), which is why
// a standard account can never appear there.
//
// HOW THIS PAGE IS PUT TOGETHER, AND WHY
// The heading and the toolbar are rendered before anything is awaited, so they
// paint immediately and stay put. Only the parts that need the database suspend,
// and they suspend separately: a slow count cannot hold up the rows.
//
// Neither boundary carries a key. That is deliberate. A key that changes with
// the filters would remount the subtree and bring the skeleton back on every
// keystroke, which is the flicker this layout exists to avoid. Instead the
// toolbar navigates inside a transition (see ListNavigation), React holds the
// current rows until the next set is ready, and StaleWhileNavigating dims them
// meanwhile. Skeletons are for the first load, when there is nothing to hold.

import { Suspense } from "react";

import { canSeeMoney } from "@/utils/arena-auth";
import {
  getAccountsPage,
  getAccountsSummary,
} from "@/queries/accounts";
import {
  ACCOUNTS_BASE_PATH,
  accountFiltersToQuery,
  parseAccountFilters,
  type AccountFilters,
  type RawSearchParams,
} from "@/lib/accounts/filters";
import {
  ListNavigationProgress,
  ListNavigationProvider,
  StaleWhileNavigating,
} from "@/components/data-table/ListNavigation";
import AccountsToolbar from "@/components/accounts/AccountsToolbar";
import AccountsTable from "@/components/accounts/AccountsTable";
import AccountsSummary from "@/components/accounts/AccountsSummary";
import {
  AccountsSummarySkeleton,
  AccountsTableSkeleton,
} from "@/components/accounts/AccountsSkeletons";

export const metadata = {
  title: "Accounts",
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  // Two awaits before the shell, both effectively free. searchParams is request
  // data Next has already parsed, and canSeeMoney reads the session Clerk
  // resolved in middleware: no database, no network. Resolving the role here
  // rather than inside the boundary lets the skeleton render the same columns
  // the real table will, so nothing shifts when the rows arrive.
  const [sp, viewerCanSeeMoney] = await Promise.all([searchParams, canSeeMoney()]);
  const filters = parseAccountFilters(sp);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Everyone who has signed up, whether they book for their own customers
          or ship for themselves.
        </p>
      </header>

      <ListNavigationProvider
        basePath={ACCOUNTS_BASE_PATH}
        params={accountFiltersToQuery(filters)}
      >
        <div className="space-y-4">
          <AccountsToolbar filters={filters} />
          <ListNavigationProgress />
        </div>

        {/* Both results boundaries dim together. The counts belong to the rows
            beside them, so leaving them crisp while the table greys out would
            read as though they had already updated. */}
        <StaleWhileNavigating className="space-y-6">
          <Suspense fallback={<AccountsSummarySkeleton />}>
            <SummarySection filters={filters} />
          </Suspense>

          <Suspense
            fallback={
              <AccountsTableSkeleton
                canSeeMoney={viewerCanSeeMoney}
                rows={Math.min(8, filters.pageSize)}
              />
            }
          >
            <TableSection filters={filters} canSeeMoney={viewerCanSeeMoney} />
          </Suspense>
        </StaleWhileNavigating>
      </ListNavigationProvider>
    </div>
  );
}

async function SummarySection({ filters }: { filters: AccountFilters }) {
  const summary = await getAccountsSummary(filters);

  return <AccountsSummary summary={summary} filters={filters} />;
}

async function TableSection({
  filters,
  canSeeMoney: viewerCanSeeMoney,
}: {
  filters: AccountFilters;
  canSeeMoney: boolean;
}) {
  const { rows, totalRows, pageCount, page } = await getAccountsPage(
    filters,
    viewerCanSeeMoney,
  );

  return (
    <AccountsTable
      rows={rows}
      filters={filters}
      page={page}
      pageCount={pageCount}
      totalRows={totalRows}
      canSeeMoney={viewerCanSeeMoney}
      // Changing an account's markup is a money operation, so it sits behind the
      // same gate as reading one. The action re-checks regardless.
      canManage={viewerCanSeeMoney}
    />
  );
}
