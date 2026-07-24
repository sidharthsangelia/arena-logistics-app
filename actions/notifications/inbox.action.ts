"use server";

/**
 * INBOX ACTIONS
 * -----------------------------------------------------------------------------
 * The three things the bell needs: read the snapshot, mark some read, mark all
 * read. Every one resolves the audience from the session rather than trusting an
 * argument, because a server action is a public endpoint. See
 * lib/notifications/audience.ts.
 *
 * `getInboxSnapshotAction` is called on a timer by every open tab, so it stays as
 * cheap as it can be: two indexed queries, both bounded, no Clerk round trip
 * beyond the session already in the request.
 */

import * as Sentry from "@sentry/nextjs";

import { resolveInboxAudience } from "@/lib/notifications/audience";
import {
  getInboxSnapshot,
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/lib/notifications/queries";
import type { InboxSnapshot } from "@/lib/notifications/config";

const EMPTY: InboxSnapshot = { items: [], unreadCount: 0, unreadCapped: false };

export async function getInboxSnapshotAction(): Promise<InboxSnapshot> {
  const audience = await resolveInboxAudience();
  if (!audience) return EMPTY;
  return getInboxSnapshot(audience);
}

/**
 * Marks the given notifications read and hands back a fresh snapshot.
 *
 * Returning the snapshot rather than void is what lets the popover settle in one
 * round trip instead of a write followed by a re-poll, and it means the badge
 * cannot briefly disagree with the list.
 */
export async function markNotificationsReadAction(
  ids: string[],
): Promise<InboxSnapshot> {
  try {
    const audience = await resolveInboxAudience();
    if (!audience) return EMPTY;

    if (Array.isArray(ids) && ids.length > 0) {
      await markNotificationsRead(audience, ids.filter((id) => typeof id === "string"));
    }

    return getInboxSnapshot(audience);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "markNotificationsReadAction" },
    });
    return EMPTY;
  }
}

export async function markAllNotificationsReadAction(): Promise<InboxSnapshot> {
  try {
    const audience = await resolveInboxAudience();
    if (!audience) return EMPTY;

    await markAllNotificationsRead(audience);
    return getInboxSnapshot(audience);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "markAllNotificationsReadAction" },
    });
    return EMPTY;
  }
}
