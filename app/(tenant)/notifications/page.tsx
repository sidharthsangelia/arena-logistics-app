import { redirect } from "next/navigation";

import { resolveInboxAudience } from "@/lib/notifications/audience";
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

export default async function TenantNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const audience = await resolveInboxAudience();

  // No org resolved means the user has not finished onboarding. The tenant layout
  // sends them to the same place, so this only fires on a direct hit to the route.
  if (!audience) redirect("/onboarding");
  // Arena staff have their own inbox, and this route would show them an empty one.
  if (audience.scope === "ARENA") redirect("/arena-dashboard/notifications");

  const sp = await searchParams;
  const filter = coerceTenantFilter(readString(sp.filter));
  const unreadOnly = readString(sp.unread) === "1";

  const rawPage = Number(readString(sp.page));
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const data = await getInboxPage({
    audience,
    kinds: TENANT_INBOX_FILTERS[filter].kinds,
    page,
    pageSize: INBOX_PAGE_SIZE,
    unreadOnly,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every update on your shipments, and anything our team has sent you.
        </p>
      </header>

      <NotificationHistory
        variant="tenant"
        data={data}
        activeFilter={filter}
        unreadOnly={unreadOnly}
        page={Math.min(page, data.pageCount)}
      />
    </div>
  );
}
