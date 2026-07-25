/**
 * app/(arena)/arena-dashboard/notices/page.tsx
 *
 * Where ops tells tenants things. Freight moves on events outside this app, carrier
 * strikes, port congestion, rate revisions, holiday closures, and this is the
 * switchboard for saying so without a deploy.
 *
 * Two modes, chosen by ?mode. A BANNER is ambient and for everybody; an INBOX MESSAGE
 * is addressed to chosen organisations and stays in their history where it can be
 * checked for whether anybody read it. They live on one screen because they answer the
 * same question, and the mode switch states the difference so the choice is informed.
 *
 * Reads the DB directly rather than the tenant-side cache, so a save is reflected here
 * the moment it lands.
 */

import { Suspense } from "react";

import { listSystemNoticesForAdmin } from "@/lib/notices/queries";
import { SystemNoticesManager } from "@/components/notices/admin/SystemNoticesManager";
import { SystemNoticesManagerSkeleton } from "@/components/notices/admin/SystemNoticesManagerSkeleton";
import { NoticeModeSwitch } from "@/components/notices/admin/NoticeModeSwitch";
import {
  getMessageRecipients,
  listSentMessages,
} from "@/lib/notifications/arenaMessages";
import { ArenaMessageComposer } from "@/components/notifications/admin/ArenaMessageComposer";
import { SentMessagesList } from "@/components/notifications/admin/SentMessagesList";
import { InboxPanelSkeleton } from "@/components/notifications/admin/InboxPanelSkeleton";

type RawSearchParams = Record<string, string | string[] | undefined>;

export default async function ArenaNoticesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  // Anything other than the one known alternative falls back to the banner, which is
  // the mode that existed before and the one most visits want.
  const mode = sp.mode === "inbox" ? "inbox" : "banner";

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tell tenants something</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Pick how the message should reach them. A banner is for everybody and sits
            at the top of the app. A message goes to the organisations you choose and
            waits in their notifications.
          </p>
        </div>

        <NoticeModeSwitch mode={mode} />
      </header>

      {/* Only the panel sits behind Suspense; the header and mode switch above stay
          mounted, so clicking a tab swaps just this region instead of blanking the
          whole screen. Keyed by mode so switching re-shows the matching skeleton
          immediately while the new panel's queries resolve. */}
      <Suspense
        key={mode}
        fallback={
          mode === "banner" ? (
            <SystemNoticesManagerSkeleton />
          ) : (
            <InboxPanelSkeleton />
          )
        }
      >
        {mode === "banner" ? <BannerPanel /> : <InboxPanel />}
      </Suspense>
    </div>
  );
}

// Only the chosen mode's queries run. Splitting them into components rather than
// fetching both keeps switching modes from paying for the one you are not looking at.

async function BannerPanel() {
  const notices = await listSystemNoticesForAdmin();
  return <SystemNoticesManager notices={notices} />;
}

async function InboxPanel() {
  const [recipients, sent] = await Promise.all([
    getMessageRecipients(),
    listSentMessages(),
  ]);

  return (
    <div className="space-y-6">
      <ArenaMessageComposer recipients={recipients} />
      <SentMessagesList messages={sent} />
    </div>
  );
}
