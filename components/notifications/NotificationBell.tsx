"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, BellRing, CheckCheck, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { UNREAD_BADGE_CAP, type InboxSnapshot } from "@/lib/notifications/config";
import { NotificationRow } from "./NotificationRow";
import { useInbox } from "./useInbox";

/**
 * THE BELL
 * -----------------------------------------------------------------------------
 * Mounted in both dashboard headers. Everything it knows about who it belongs to
 * arrives as the server-resolved snapshot and a history link, so the component
 * itself is the same on both sides.
 *
 * Two decisions worth spelling out, both about making a glance mean something:
 *
 *   1. The badge turns RED when something unread is critical, and stays neutral
 *      when it is only new. A failed payment and three new bookings should not look
 *      identical from across a desk. This is the whole reason severity is stored on
 *      the notification rather than inferred at render time.
 *
 *   2. Opening the bell marks what it shows as read, so the badge clears the way
 *      people expect from every other app they use. The rows keep their highlight
 *      for the rest of that session, because a list that goes flat while you are
 *      reading it is worse than one that stays honest about what was new.
 */
export function NotificationBell({
  initialSnapshot,
  historyHref,
  className,
}: {
  initialSnapshot: InboxSnapshot;
  /** Where "See everything" goes. Differs per dashboard. */
  historyHref: string;
  className?: string;
}) {
  const { snapshot, markRead, markAllRead } = useInbox(initialSnapshot);
  const [open, setOpen] = React.useState(false);

  // Frozen at open time. See NotificationRow for why the highlight must outlive
  // the read receipt.
  const [newIds, setNewIds] = React.useState<ReadonlySet<string>>(new Set());

  const unread = snapshot.unreadCount;
  const hasCritical = snapshot.items.some(
    (item) => !item.readAt && item.severity === "CRITICAL",
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (next) {
      const unreadShown = snapshot.items.filter((item) => !item.readAt);
      setNewIds(new Set(unreadShown.map((item) => item.id)));
      if (unreadShown.length > 0) markRead(unreadShown.map((item) => item.id));
      return;
    }

    // Cleared on close so the next open recomputes from a fresh snapshot rather
    // than re-highlighting rows that were already dealt with.
    setNewIds(new Set());
  }

  const badgeLabel =
    unread === 0
      ? null
      : snapshot.unreadCapped
        ? `${UNREAD_BADGE_CAP}+`
        : String(unread);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unread === 0
              ? "Notifications, nothing new"
              : `Notifications, ${badgeLabel} unread`
          }
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            open && "bg-muted text-foreground",
            className,
          )}
        >
          {unread > 0 ? (
            <BellRing className="h-[18px] w-[18px]" />
          ) : (
            <Bell className="h-[18px] w-[18px]" />
          )}

          {badgeLabel && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 flex min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums text-white",
                "h-[17px] leading-none",
                hasCritical ? "bg-red-600" : "bg-slate-900",
              )}
              aria-hidden="true"
            >
              {badgeLabel}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={markAllRead}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all as read
            </Button>
          )}
        </div>

        <Separator />

        {snapshot.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </span>
            <p className="text-sm font-medium">You are all caught up</p>
            <p className="text-xs text-muted-foreground">
              Anything that needs you will show up here.
            </p>
          </div>
        ) : (
          // Capped height with its own scroll, so a long list never grows the
          // popover past the viewport on a laptop screen.
          <div className="max-h-[min(26rem,60vh)] divide-y overflow-y-auto">
            {snapshot.items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                isNew={newIds.has(item.id)}
                compact
                onOpen={() => setOpen(false)}
              />
            ))}
          </div>
        )}

        <Separator />

        <Link
          href={historyHref}
          onClick={() => setOpen(false)}
          className="block px-4 py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          See everything
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/** Matches the trigger's footprint so the header does not shift when it resolves. */
export function NotificationBellSkeleton() {
  return <div className="h-9 w-9 rounded-md bg-muted/50" aria-hidden="true" />;
}
