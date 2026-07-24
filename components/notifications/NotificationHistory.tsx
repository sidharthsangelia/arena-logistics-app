"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  ARENA_INBOX_FILTERS,
  TENANT_INBOX_FILTERS,
  type InboxPage,
} from "@/lib/notifications/config";
import { markAllNotificationsReadAction } from "@/actions/notifications/inbox.action";
import { NotificationRow } from "./NotificationRow";

/**
 * THE FULL HISTORY
 * -----------------------------------------------------------------------------
 * The bell answers "what is new"; this answers "what happened". Same rows, so the
 * two never look like different features, but paginated and filterable rather than
 * capped at eight.
 *
 * Filter and page live in the URL, which means a link to "everything that needs
 * attention" can be pasted into a message to a colleague, and the state survives
 * the refresh that follows acting on one of these rows.
 *
 * Reading this screen does NOT mark anything read. That is the important difference
 * from the bell: the bell is a glance, and clearing the badge is what you wanted.
 * This is a record you might be scrolling through for something from last week, and
 * silently marking a fortnight of history read on the way past would destroy the
 * one signal telling you where you had got to. There is an explicit button instead.
 */
export function NotificationHistory({
  variant,
  data,
  activeFilter,
  unreadOnly,
  page,
}: {
  variant: "arena" | "tenant";
  data: InboxPage;
  activeFilter: string;
  unreadOnly: boolean;
  page: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const filters = variant === "arena" ? ARENA_INBOX_FILTERS : TENANT_INBOX_FILTERS;

  const pushParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  function handleMarkAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      toast.success("Marked as read");
      // The action does not revalidate this route: the bell reads through a
      // different path, and refreshing here is what brings the page's own rows and
      // its unread count back in step.
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filter chips. Buttons rather than a select: there are three of them, and
            a dropdown would hide the one people want most behind a click. */}
        <div
          role="tablist"
          aria-label="Filter notifications"
          className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1"
        >
          {Object.entries(filters).map(([key, meta]) => {
            const active = key === activeFilter;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() =>
                  pushParams((params) => {
                    if (key === "all") params.delete("filter");
                    else params.set("filter", key);
                    params.delete("page");
                  })
                }
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={unreadOnly ? "default" : "outline"}
            size="sm"
            disabled={isPending}
            onClick={() =>
              pushParams((params) => {
                if (unreadOnly) params.delete("unread");
                else params.set("unread", "1");
                params.delete("page");
              })
            }
          >
            {unreadOnly ? "Showing unread" : "Unread only"}
            {data.unreadCount > 0 && !unreadOnly && (
              <span className="ml-1.5 tabular-nums">({data.unreadCount})</span>
            )}
          </Button>

          {data.unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              disabled={isPending}
              onClick={handleMarkAll}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all as read
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-background transition-opacity",
          isPending && "opacity-70",
        )}
      >
        {data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </span>
            <p className="text-sm font-medium">
              {unreadOnly ? "Nothing unread" : "Nothing here yet"}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {unreadOnly
                ? "You have read everything in this view."
                : activeFilter === "all"
                  ? "As things happen, they will be recorded here."
                  : "Nothing matches this filter."}
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {data.items.map((item) => (
              <li key={item.id}>
                {/* isNew is driven by the stored read state here, not by a frozen
                    snapshot: on a history screen the honest answer to "have I seen
                    this" is the one in the database. */}
                <NotificationRow item={item} isNew={!item.readAt} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.pageCount > 1 && (
        <>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Page {page} of {data.pageCount} · {data.totalRows}{" "}
              {data.totalRows === 1 ? "notification" : "notifications"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isPending}
                onClick={() =>
                  pushParams((params) => params.set("page", String(page - 1)))
                }
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.pageCount || isPending}
                onClick={() =>
                  pushParams((params) => params.set("page", String(page + 1)))
                }
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
