import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { Prisma } from "@/generated/prisma";

import { prisma } from "@/utils/db";
import {
  INBOX_PREVIEW_LIMIT,
  UNREAD_BADGE_CAP,
  type InboxPage,
  type InboxSnapshot,
  type NotificationDTO,
  type NotificationKindKey,
  type NotificationScopeKey,
} from "./config";

/**
 * READING THE INBOX
 * -----------------------------------------------------------------------------
 * Uncached, on purpose, and the opposite call from the header wallet chip. The
 * whole value of a bell is that it reflects what has happened; a badge that is a
 * minute stale is a badge nobody trusts. The queries are small and indexed, and
 * the poll interval is already the rate limiter.
 *
 * Read state comes from NotificationReceipt, one row per user per notification,
 * written only when somebody actually reads something. Two properties fall out of
 * addressing notifications to a scope rather than fanning them out per user:
 * somebody added to the org next month still sees the whole history, and one
 * person clearing their badge does not clear anybody else's.
 */

export interface InboxAudience {
  scope: NotificationScopeKey;
  /** Required for ORG scope. */
  orgId?: string | null;
  /** Clerk userId, for read state. */
  userId: string;
  /**
   * ARENA scope only. Money notifications name amounts, so an ops member's inbox
   * must exclude them for the same reason their overview has no revenue tile.
   */
  isArenaAdmin?: boolean;
}

function audienceWhere(
  audience: InboxAudience,
  kinds?: readonly NotificationKindKey[] | null,
): Prisma.NotificationWhereInput {
  const base: Prisma.NotificationWhereInput =
    audience.scope === "ARENA"
      ? {
          scope: "ARENA",
          ...(audience.isArenaAdmin ? {} : { adminOnly: false }),
        }
      : { scope: "ORG", orgId: audience.orgId ?? "__none__" };

  return kinds && kinds.length > 0 ? { ...base, kind: { in: [...kinds] } } : base;
}

const ROW_SELECT = {
  id: true,
  kind: true,
  severity: true,
  title: true,
  body: true,
  linkHref: true,
  createdAt: true,
} as const;

type RowWithReceipts = Prisma.NotificationGetPayload<{
  select: typeof ROW_SELECT & {
    receipts: { select: { readAt: true } };
  };
}>;

function toDTO(row: RowWithReceipts): NotificationDTO {
  return {
    id: row.id,
    kind: row.kind as NotificationKindKey,
    severity: row.severity,
    title: row.title,
    body: row.body,
    linkHref: row.linkHref,
    createdAt: row.createdAt.toISOString(),
    // The receipts relation was filtered to this one user, so at most one row can
    // come back and its presence is the read mark.
    readAt: row.receipts[0]?.readAt?.toISOString() ?? null,
  };
}

/**
 * Counts unread, stopping at the badge cap.
 *
 * Fetches ids up to the cap rather than running COUNT, so the work is bounded no
 * matter how far behind somebody is. "50+" and "4,318" lead to the same action,
 * and only one of them is a full table scan.
 */
async function countUnread(
  audience: InboxAudience,
): Promise<{ unreadCount: number; unreadCapped: boolean }> {
  const rows = await prisma.notification.findMany({
    where: {
      ...audienceWhere(audience),
      receipts: { none: { userId: audience.userId } },
    },
    select: { id: true },
    take: UNREAD_BADGE_CAP + 1,
  });

  return {
    unreadCount: Math.min(rows.length, UNREAD_BADGE_CAP),
    unreadCapped: rows.length > UNREAD_BADGE_CAP,
  };
}

/**
 * What the bell popover shows: the newest few, plus the badge number.
 *
 * Never throws. The bell is chrome on every page in the app, and a failed
 * notification read must not take a working dashboard down with it. An empty
 * snapshot renders as "you are all caught up", which is wrong but harmless for
 * one poll cycle, and the failure is in Sentry.
 */
export async function getInboxSnapshot(
  audience: InboxAudience,
): Promise<InboxSnapshot> {
  try {
    const [rows, unread] = await Promise.all([
      prisma.notification.findMany({
        where: audienceWhere(audience),
        select: {
          ...ROW_SELECT,
          receipts: { where: { userId: audience.userId }, select: { readAt: true } },
        },
        orderBy: { createdAt: "desc" },
        take: INBOX_PREVIEW_LIMIT,
      }),
      countUnread(audience),
    ]);

    return { items: rows.map(toDTO), ...unread };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "getInboxSnapshot" },
      extra: { scope: audience.scope, orgId: audience.orgId ?? null },
    });
    return { items: [], unreadCount: 0, unreadCapped: false };
  }
}

/** The full history screen. Throws, so the page can show an error boundary. */
export async function getInboxPage(params: {
  audience: InboxAudience;
  kinds?: readonly NotificationKindKey[] | null;
  page: number;
  pageSize: number;
  /** Narrows to unread only, for the "just what I have not seen" view. */
  unreadOnly?: boolean;
}): Promise<InboxPage> {
  const { audience, kinds, page, pageSize, unreadOnly } = params;

  const where: Prisma.NotificationWhereInput = {
    ...audienceWhere(audience, kinds),
    ...(unreadOnly ? { receipts: { none: { userId: audience.userId } } } : {}),
  };

  const [rows, totalRows, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: {
        ...ROW_SELECT,
        receipts: { where: { userId: audience.userId }, select: { readAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: Math.max(0, (page - 1) * pageSize),
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    countUnread(audience),
  ]);

  return {
    items: rows.map(toDTO),
    totalRows,
    pageCount: Math.max(1, Math.ceil(totalRows / pageSize)),
    unreadCount: unread.unreadCount,
  };
}

/**
 * Marks specific notifications read for one user.
 *
 * `createMany` with skipDuplicates rather than an upsert per id: re-reading
 * something already read is the common case (opening the bell twice), and the
 * first readAt is the honest one to keep.
 *
 * The ids are filtered through the audience before anything is written, so a
 * crafted id cannot create a receipt against a notification the caller was never
 * allowed to see. It would leak nothing on its own, but it would let somebody
 * silently mark another org's rows, and the filter costs one indexed query.
 */
export async function markNotificationsRead(
  audience: InboxAudience,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;

  try {
    const visible = await prisma.notification.findMany({
      where: { ...audienceWhere(audience), id: { in: ids.slice(0, 200) } },
      select: { id: true },
    });
    if (visible.length === 0) return 0;

    const result = await prisma.notificationReceipt.createMany({
      data: visible.map((n) => ({ notificationId: n.id, userId: audience.userId })),
      skipDuplicates: true,
    });

    return result.count;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "markNotificationsRead" },
      extra: { scope: audience.scope, count: ids.length },
    });
    return 0;
  }
}

/**
 * Marks everything currently visible to this user read.
 *
 * Bounded by MARK_ALL_CAP. Anything past that is old enough that "mark all as
 * read" means "clear the badge", which a second click finishes. An unbounded
 * version would be one statement that could write tens of thousands of rows.
 */
const MARK_ALL_CAP = 500;

export async function markAllNotificationsRead(
  audience: InboxAudience,
): Promise<number> {
  try {
    const unread = await prisma.notification.findMany({
      where: {
        ...audienceWhere(audience),
        receipts: { none: { userId: audience.userId } },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: MARK_ALL_CAP,
    });

    if (unread.length === 0) return 0;

    const result = await prisma.notificationReceipt.createMany({
      data: unread.map((n) => ({ notificationId: n.id, userId: audience.userId })),
      skipDuplicates: true,
    });

    return result.count;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "markAllNotificationsRead" },
      extra: { scope: audience.scope },
    });
    return 0;
  }
}

/**
 * Retention. Called from the scheduled sweep.
 *
 * Only READ notifications are removed, and only once they are properly old.
 * Deleting an unread one would take away something nobody ever saw, which defeats
 * the point of having a durable record at all. Receipts go with them by cascade.
 */
export async function pruneOldNotifications(
  olderThanDays = 90,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);

  try {
    const { count } = await prisma.notification.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        // "Read by somebody" is the test. A notification addressed to a scope has
        // no fixed reader list, so "read by everybody" is not a question this
        // schema can answer, and waiting for it would mean never pruning.
        receipts: { some: {} },
      },
    });
    return count;
  } catch (error) {
    Sentry.captureException(error, { tags: { location: "pruneOldNotifications" } });
    return 0;
  }
}
