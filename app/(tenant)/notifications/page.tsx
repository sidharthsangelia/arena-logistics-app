import { Suspense } from "react";
import { redirect } from "next/navigation";

import { resolveInboxAudience } from "@/lib/notifications/audience";
import { NotificationHistorySkeleton } from "@/components/notifications/NotificationHistorySkeleton";
import { getInboxPage } from "@/lib/notifications/queries";
import {
  INBOX_PAGE_SIZE,
  TENANT_INBOX_FILTERS,
  coerceTenantFilter,
} from "@/lib/notifications/config";
import { NotificationHistory } from "@/components/notifications/NotificationHistory";

/**
 * Everything that has happened on this org's shipments, plus anything Arena has
 * written to them. The bell's "See everything" lands here.
 */

export const metadata = {
  title: "Notifications",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function readString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

// Params only, no data fetch, so the header renders on the first flush. The
// inbox itself streams in below it.
//
// Nothing on this route is cached, deliberately. What it shows is read/unread
// state, which the user changes by looking at this very page — serving that from
// even a two-second cache would mean a notification they just opened bouncing
// back to unread. This is the case the brief calls "needs to be fresh always".
export default async function TenantNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filter = coerceTenantFilter(readString(sp.filter));
  const unreadOnly = readString(sp.unread) === "1";

  const rawPage = Number(readString(sp.page));
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every update on your shipments, and anything our team has sent you.
        </p>
      </header>

      <Suspense
        // Re-suspends when the filter or page changes, so switching tabs shows
        // the skeleton rather than the previous filter's rows.
        key={`${filter}:${unreadOnly}:${page}`}
        fallback={<NotificationHistorySkeleton rows={6} />}
      >
        <InboxPanel filter={filter} unreadOnly={unreadOnly} page={page} />
      </Suspense>
    </div>
  );
}

async function InboxPanel({
  filter,
  unreadOnly,
  page,
}: {
  filter: ReturnType<typeof coerceTenantFilter>;
  unreadOnly: boolean;
  page: number;
}) {
  const audience = await resolveInboxAudience();

  // No org resolved means the user has not finished onboarding. The tenant layout
  // sends them to the same place, so this only fires on a direct hit to the route.
  if (!audience) redirect("/onboarding");
  // Arena staff have their own inbox, and this route would show them an empty one.
  if (audience.scope === "ARENA") redirect("/arena-dashboard/notifications");

  const data = await getInboxPage({
    audience,
    kinds: TENANT_INBOX_FILTERS[filter].kinds,
    page,
    pageSize: INBOX_PAGE_SIZE,
    unreadOnly,
  });

  return (
    <NotificationHistory
      variant="tenant"
      data={data}
      activeFilter={filter}
      unreadOnly={unreadOnly}
      page={Math.min(page, data.pageCount)}
    />
  );
}
