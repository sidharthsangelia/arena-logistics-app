import * as Sentry from "@sentry/nextjs";
import { unstable_cache } from "next/cache";

import { prisma } from "@/utils/db";
import type { AdminSystemNoticeDTO, SystemNoticeDTO } from "./types";

/** Revalidation tag. Every notice mutation invalidates this one key. */
export const SYSTEM_NOTICES_TAG = "system-notices";

/**
 * Admin-list cache tag, separate from the tenant one so the two can be
 * invalidated with different urgency. Every notice mutation calls
 * `updateTag(ADMIN_SYSTEM_NOTICES_TAG)`, which is read-your-writes: the next
 * render blocks for fresh data rather than serving stale, so a save still shows
 * on the admin screen the instant it lands.
 */
export const ADMIN_SYSTEM_NOTICES_TAG = "admin-system-notices";

const NOTICE_SELECT = {
  id: true,
  title: true,
  message: true,
  severity: true,
  audience: true,
  displayMode: true,
  isActive: true,
  dismissible: true,
  priority: true,
  startsAt: true,
  endsAt: true,
  linkLabel: true,
  linkHref: true,
  revision: true,
} as const;

// ---------------------------------------------------------------------------
// getActiveSystemNotices
//
// Every tenant page render in the app hits this, so it is cached hard: one
// cache entry shared by every org, revalidated once a minute.
//
// Two decisions worth spelling out:
//
//   1. The query filters on isActive only, NOT on the schedule window or the
//      audience. Both of those are per-request concerns (the window depends on
//      "now", the audience on who is asking), and folding either into the SQL
//      would fragment the cache into one entry per org per minute. Filtering
//      happens in selectVisibleNotices, outside the cache boundary.
//
//   2. The 60s revalidate is what makes scheduled notices turn themselves on
//      and off. A notice whose window opens at 6pm appears within a minute of
//      6pm with no cron job involved. Admin edits do not wait for it: every
//      mutation revalidates SYSTEM_NOTICES_TAG directly.
//
// Errors are rethrown so a failed DB read is never cached as "no notices" — a
// swallowed failure here would silently hide a CRITICAL notice for a full
// minute. The next request retries against the DB.
// ---------------------------------------------------------------------------

export const getActiveSystemNotices = unstable_cache(
  async (): Promise<SystemNoticeDTO[]> => {
    try {
      const notices = await prisma.systemNotice.findMany({
        where: { isActive: true, deletedAt: null },
        select: NOTICE_SELECT,
        orderBy: { createdAt: "desc" },
      });

      return notices.map(serialise);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { location: "getActiveSystemNotices" },
      });
      throw error;
    }
  },
  ["system-notices:active"],
  { tags: [SYSTEM_NOTICES_TAG], revalidate: 60 },
);

// ---------------------------------------------------------------------------
// listSystemNoticesForAdmin
//
// Cached under its own tag so switching back to this screen, or refreshing it,
// does not pay for the DB round trip every time. The row content only changes
// when ops mutates a notice, and every mutation calls
// `updateTag(ADMIN_SYSTEM_NOTICES_TAG)` (read-your-writes), so a save is still
// reflected here immediately. The 30s revalidate is a safety net, nothing more:
// the admin table computes LIVE/SCHEDULED status client-side from these dates,
// so a scheduled window opening does not need a fresh read to show correctly.
// ---------------------------------------------------------------------------

export const listSystemNoticesForAdmin = unstable_cache(
  async (): Promise<AdminSystemNoticeDTO[]> => {
    const notices = await prisma.systemNotice.findMany({
      where: { deletedAt: null },
      select: {
        ...NOTICE_SELECT,
        createdBy: true,
        updatedBy: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });

    return notices.map((notice) => ({
      ...serialise(notice),
      createdBy: notice.createdBy,
      updatedBy: notice.updatedBy,
      createdAt: notice.createdAt.toISOString(),
      updatedAt: notice.updatedAt.toISOString(),
    }));
  },
  ["system-notices:admin"],
  { tags: [ADMIN_SYSTEM_NOTICES_TAG], revalidate: 30 },
);

// ---------------------------------------------------------------------------
// serialise
//
// Dates become ISO strings before they leave the server: these rows travel
// through unstable_cache (which round-trips as JSON) and on into client
// components, and a Date survives neither hop intact.
// ---------------------------------------------------------------------------

type NoticeRow = Omit<SystemNoticeDTO, "startsAt" | "endsAt"> & {
  startsAt: Date | null;
  endsAt: Date | null;
};

function serialise(notice: NoticeRow): SystemNoticeDTO {
  return {
    id: notice.id,
    title: notice.title,
    message: notice.message,
    severity: notice.severity,
    audience: notice.audience,
    displayMode: notice.displayMode,
    isActive: notice.isActive,
    dismissible: notice.dismissible,
    priority: notice.priority,
    startsAt: notice.startsAt?.toISOString() ?? null,
    endsAt: notice.endsAt?.toISOString() ?? null,
    linkLabel: notice.linkLabel,
    linkHref: notice.linkHref,
    revision: notice.revision,
  };
}
