import { Suspense } from "react";
import { redirect } from "next/navigation";

import { resolveInboxAudience } from "@/lib/notifications/audience";
import { getInboxPage } from "@/lib/notifications/queries";
import {
  ARENA_INBOX_FILTERS,
  INBOX_PAGE_SIZE,
  coerceArenaFilter,
} from "@/lib/notifications/config";
import { NotificationHistory } from "@/components/notifications/NotificationHistory";
import { NotificationHistorySkeleton } from "@/components/notifications/NotificationHistorySkeleton";

/**
 * The arena inbox: new bookings, and everything that needs somebody to act.
 *
 * Open to every arena member, not just admins. Ops needs to see a stuck shipment
 * and a new booking, and that is most of what is here.
 *
 * The money rows are the exception, and they are filtered inside the query rather
 * than here: notifications naming an amount are written with adminOnly set, and
 * audienceWhere drops them for a non-admin. So an ops member gets a working screen
 * with no gaps in it, rather than rows they cannot open. See lib/notifications/queries.ts.
 */

export const metadata = {
  title: "Notifications",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function readString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function ArenaNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const audience = await resolveInboxAudience();
  if (!audience || audience.scope !== "ARENA") redirect("/arena-dashboard");

  const sp = await searchParams;
  const filter = coerceArenaFilter(readString(sp.filter));
  const unreadOnly = readString(sp.unread) === "1";

  const rawPage = Number(readString(sp.page));
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          New bookings and anything that needs somebody to pick it up.
        </p>
      </header>

      {/* The heading stays put while the inbox is read. Keyed on what was asked
          for, so changing filter or page brings the skeleton back rather than
          leaving the previous page's rows on screen under a filter that no
          longer describes them. */}
      <Suspense
        key={`${filter}-${unreadOnly}-${page}`}
        fallback={<NotificationHistorySkeleton rows={7} />}
      >
        <InboxSection
          audience={audience}
          filter={filter}
          unreadOnly={unreadOnly}
          page={page}
        />
      </Suspense>
    </div>
  );
}

async function InboxSection({
  audience,
  filter,
  unreadOnly,
  page,
}: {
  audience: NonNullable<Awaited<ReturnType<typeof resolveInboxAudience>>>;
  filter: ReturnType<typeof coerceArenaFilter>;
  unreadOnly: boolean;
  page: number;
}) {
  const data = await getInboxPage({
    audience,
    kinds: ARENA_INBOX_FILTERS[filter].kinds,
    page,
    pageSize: INBOX_PAGE_SIZE,
    unreadOnly,
  });

  return (
    <NotificationHistory
      variant="arena"
      data={data}
      activeFilter={filter}
      unreadOnly={unreadOnly}
      page={Math.min(page, data.pageCount)}
    />
  );
}
