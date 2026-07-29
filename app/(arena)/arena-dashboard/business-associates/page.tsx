// app/(arena)/arena-dashboard/business-associates/page.tsx
//
// Business associates: partner firms who book on behalf of their own customers.
//
// This page used to list every organisation with a dropdown to filter down to
// associates, which meant its title was wrong for the default view and there was
// no page anywhere that honestly answered "who has signed up". That question now
// belongs to /arena-dashboard/accounts, and this one is what its name says.
//
// It reuses the Accounts query with the type locked to "ba", so the two lists
// cannot drift apart in what counts as an organisation, what search matches, or
// how signup health is judged. Only the columns differ.
//
// The streaming shape matches the Accounts list: shell first, data in its own
// boundary, no key on the boundary so filter changes hold the current rows
// instead of flashing a skeleton. See components/data-table/ListNavigation.

import { Suspense } from "react";
import Link from "next/link";

import { canSeeMoney } from "@/utils/arena-auth";
import { getAccountsPage } from "@/queries/accounts";
import {
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
import BusinessAssociatesTable, {
  BUSINESS_ASSOCIATES_BASE_PATH,
} from "@/components/business-associates/BusinessAssociatesTable";
import BusinessAssociatesSkeleton from "@/components/business-associates/BusinessAssociatesSkeleton";

export const metadata = {
  title: "Business associates",
};

/**
 * The type is a property of the route, not of the URL, so it is forced after
 * parsing and stripped from the links this page builds. Nobody should be able to
 * reach a standard account by editing ?type= on this address.
 */
function readFilters(sp: RawSearchParams): AccountFilters {
  return { ...parseAccountFilters(sp), type: "ba" };
}

function linkParams(filters: AccountFilters) {
  return { ...accountFiltersToQuery(filters), type: undefined };
}

export default async function BusinessAssociatesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [sp, viewerCanSeeMoney] = await Promise.all([searchParams, canSeeMoney()]);
  const filters = readFilters(sp);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Business associates
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Partner firms who book for their own customers. To add one, promote an
          account from the{" "}
          <Link
            href="/arena-dashboard/accounts"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Accounts
          </Link>{" "}
          list.
        </p>
      </header>

      <ListNavigationProvider
        basePath={BUSINESS_ASSOCIATES_BASE_PATH}
        params={linkParams(filters)}
      >
        <div className="space-y-4">
          <AccountsToolbar
            filters={filters}
            showTypeFilter={false}
            placeholder="Search associates by name or email"
          />
          <ListNavigationProgress />
        </div>

        <StaleWhileNavigating>
          <Suspense
            fallback={
              <BusinessAssociatesSkeleton
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
    <BusinessAssociatesTable
      rows={rows}
      filters={filters}
      page={page}
      pageCount={pageCount}
      totalRows={totalRows}
      searchParams={linkParams(filters)}
      canSeeMoney={viewerCanSeeMoney}
      hasFilters={filters.query.length > 0 || filters.health !== "all"}
    />
  );
}
