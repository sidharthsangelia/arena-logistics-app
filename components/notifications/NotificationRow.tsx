"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { timeAgo, type NotificationDTO } from "@/lib/notifications/config";
import { NotificationKindIcon, SEVERITY_TONES } from "./notificationVisuals";

/**
 * One notification, shared by the bell popover and the history page so a row never
 * looks like two different things depending on where you saw it.
 *
 * `isNew` is separate from `readAt` on purpose. Opening the bell marks what it
 * shows as read, which is what clears the badge, but the highlight has to survive
 * that or the list would go flat under the reader's eyes in the moment they were
 * trying to see what had changed. So the caller freezes what was unread when the
 * popover opened and passes it here.
 */
export function NotificationRow({
  item,
  isNew,
  onOpen,
  compact = false,
}: {
  item: NotificationDTO;
  isNew: boolean;
  /** Called when the row is activated, so the caller can mark it read and close. */
  onOpen?: (item: NotificationDTO) => void;
  compact?: boolean;
}) {
  const tone = SEVERITY_TONES[item.severity];
  const urgent = item.severity === "CRITICAL" || item.severity === "WARNING";

  const body = (
    <div className="flex gap-3">
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full",
          compact ? "h-7 w-7" : "h-8 w-8",
          tone.bubble,
        )}
        aria-hidden="true"
      >
        <NotificationKindIcon
          kind={item.kind}
          severity={item.severity}
          className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "text-sm leading-snug",
              isNew ? "font-semibold text-foreground" : "font-medium text-foreground/90",
            )}
          >
            {item.title}
          </span>
          {isNew && (
            <span
              className={cn(
                "mt-1 h-2 w-2 shrink-0 rounded-full",
                item.severity === "CRITICAL" ? "bg-red-500" : "bg-sky-500",
              )}
              // The dot is decorative; "Unread" below is what a screen reader gets.
              aria-hidden="true"
            />
          )}
        </span>

        {item.body && (
          <span
            className={cn(
              "mt-0.5 block text-xs leading-relaxed text-muted-foreground",
              compact && "line-clamp-2",
            )}
          >
            {item.body}
          </span>
        )}

        <span className="mt-1 block text-[11px] text-muted-foreground/80">
          {timeAgo(item.createdAt)}
          {isNew && <span className="sr-only"> · Unread</span>}
        </span>
      </span>
    </div>
  );

  const shell = cn(
    "relative block w-full overflow-hidden px-4 py-3 text-left transition-colors",
    isNew ? tone.unreadBg : "bg-transparent",
    "hover:bg-muted/60",
  );

  // The rail is what makes a failure impossible to scroll past. Drawn for urgent
  // rows whether or not they are still unread, because an unpaid invoice does not
  // stop mattering the moment somebody glances at it.
  const rail = urgent ? (
    <span
      className={cn("absolute inset-y-0 left-0 w-[3px]", tone.rail)}
      aria-hidden="true"
    />
  ) : null;

  if (item.linkHref) {
    return (
      <Link href={item.linkHref} className={shell} onClick={() => onOpen?.(item)}>
        {rail}
        {body}
      </Link>
    );
  }

  // No destination, so this is a message to read rather than a task to open. A
  // button would promise navigation that is not going to happen.
  return (
    <div className={cn(shell, "cursor-default hover:bg-transparent")}>
      {rail}
      {body}
    </div>
  );
}
