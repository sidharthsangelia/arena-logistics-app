"use client";

import * as React from "react";

import {
  getInboxSnapshotAction,
  markAllNotificationsReadAction,
  markNotificationsReadAction,
} from "@/actions/notifications/inbox.action";
import { INBOX_POLL_MS, type InboxSnapshot } from "@/lib/notifications/config";

/**
 * KEEPING THE BELL FRESH
 * -----------------------------------------------------------------------------
 * Polling, not SSE. The volume is a handful of events an hour, and a long-lived
 * connection per open tab is real infrastructure to operate for something an
 * interval answers just as well.
 *
 * Three rules make the polling cheap enough to be defensible:
 *
 *   1. Nothing is fetched while the tab is hidden. A dashboard left open in a
 *      background tab all afternoon is the normal case in an ops office, and those
 *      requests would be the entire cost of this approach. The interval is torn
 *      down on `visibilitychange` and rebuilt on return.
 *
 *   2. Coming back to the tab fetches immediately, so the badge is right the moment
 *      you look at it rather than up to a minute later. This is what makes the poll
 *      interval itself almost unnoticeable.
 *
 *   3. `focus` also refreshes, but throttled. Focus fires every time somebody
 *      clicks back into the browser window, which in normal use is far more often
 *      than anything here changes.
 *
 * The initial snapshot comes from the server render, so there is no fetch on mount
 * and no empty first paint. After mount this hook owns the state: later changes to
 * the `initial` prop are ignored, because the polled value is by definition at
 * least as fresh as a re-rendered layout's.
 */

/** Minimum gap between focus-triggered fetches. */
const FOCUS_THROTTLE_MS = 15_000;

export interface UseInboxResult {
  snapshot: InboxSnapshot;
  isBusy: boolean;
  refresh: () => void;
  markRead: (ids: string[]) => void;
  markAllRead: () => void;
}

export function useInbox(initial: InboxSnapshot): UseInboxResult {
  const [snapshot, setSnapshot] = React.useState(initial);
  const [isBusy, setIsBusy] = React.useState(false);

  // Guards against overlapping requests, which a slow network plus an eager focus
  // handler would otherwise produce.
  const inFlight = React.useRef(false);
  // Starts at 0 rather than Date.now(), which react-hooks/purity rightly refuses:
  // reading the clock during render makes the value depend on when React happened to
  // re-render. Zero means the first focus after mount is never throttled, which is
  // the behaviour you want anyway.
  const lastFetchedAt = React.useRef(0);
  // Set on unmount so a response that arrives afterwards does not try to set state
  // on a component that is gone.
  const alive = React.useRef(true);

  const run = React.useCallback(
    async (task: () => Promise<InboxSnapshot>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setIsBusy(true);

      try {
        const next = await task();
        if (alive.current) setSnapshot(next);
      } catch {
        // Deliberately silent. A failed poll means the badge is briefly stale,
        // which is not worth a toast on every page in the app; the action itself
        // reports to Sentry.
      } finally {
        inFlight.current = false;
        lastFetchedAt.current = Date.now();
        if (alive.current) setIsBusy(false);
      }
    },
    [],
  );

  const refresh = React.useCallback(() => {
    void run(getInboxSnapshotAction);
  }, [run]);

  const markRead = React.useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;

      // The badge drops immediately rather than after the round trip. The server
      // response replaces this shortly, and if the write failed the next poll puts
      // the number back, which is the right way round: a badge that lags a click
      // feels broken far more often than one that corrects itself.
      setSnapshot((prev) => ({
        ...prev,
        unreadCount: Math.max(0, prev.unreadCount - ids.length),
        unreadCapped: prev.unreadCapped && prev.unreadCount - ids.length > 0,
        items: prev.items.map((item) =>
          ids.includes(item.id) && !item.readAt
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      }));

      void run(() => markNotificationsReadAction(ids));
    },
    [run],
  );

  const markAllRead = React.useCallback(() => {
    setSnapshot((prev) => ({
      ...prev,
      unreadCount: 0,
      unreadCapped: false,
      items: prev.items.map((item) =>
        item.readAt ? item : { ...item, readAt: new Date().toISOString() },
      ),
    }));

    void run(markAllNotificationsReadAction);
  }, [run]);

  React.useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(refresh, INBOX_POLL_MS);
    };

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
        return;
      }
      refresh();
      start();
    };

    const onFocus = () => {
      if (document.hidden) return;
      if (Date.now() - lastFetchedAt.current < FOCUS_THROTTLE_MS) return;
      refresh();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      alive.current = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return { snapshot, isBusy, refresh, markRead, markAllRead };
}
