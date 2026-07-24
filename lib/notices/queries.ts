import * as Sentry from "@sentry/nextjs";
import { unstable_cache } from "next/cache";

import { prisma } from "@/utils/db";
import type { AdminSystemNoticeDTO, SystemNoticeDTO } from "./types";

/** Revalidation tag. Every notice mutation invalidates this one key. */
export const SYSTEM_NOTICES_TAG = "system-notices";

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
// Uncached on purpose. The Arena admin screen is the one place that must show
// the true current state the instant a save lands, so it reads straight from
// the DB rather than sharing the tenant cache.
// ---------------------------------------------------------------------------

export async function listSystemNoticesForAdmin(): Promise<
  AdminSystemNoticeDTO[]
> {
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
}

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
