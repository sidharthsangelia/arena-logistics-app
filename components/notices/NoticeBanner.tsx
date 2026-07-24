"use client";

// The banner itself: one notice, one row. Purely presentational — it owns no
// data fetching and no dismissal state, which is what lets the tenant dashboard
// and the Arena admin preview render the exact same component. What ops sees
// while writing is what tenants get.

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, X } from "lucide-react";

import { SEVERITY_CONFIG } from "@/lib/notices/config";
import type { SystemNoticeDTO } from "@/lib/notices/types";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/format";

interface NoticeBannerProps {
  notice: SystemNoticeDTO;
  /** Omit to render without a dismiss control, e.g. for a pinned notice. */
  onDismiss?: () => void;
  /** How many further notices are collapsed behind this one. */
  extraCount?: number;
  extraExpanded?: boolean;
  onToggleExtra?: () => void;
  /**
   * Renders links as inert text. Used by the admin preview so clicking around
   * in the form cannot navigate ops away mid-edit.
   */
  inert?: boolean;
}

// ---------------------------------------------------------------------------
// The ticking clock
//
// The wall clock is external state, so it is read through useSyncExternalStore
// rather than an effect that calls setState on a timer. One shared interval
// serves every mounted banner, and it only runs while something is actually
// counting down — banners with no end date subscribe to a store that never
// emits, so no timer is created at all.
//
// getServerSnapshot returns 0 for "unknown", which is what keeps the label out
// of the SSR output: a clock-derived string rendered on the server would
// mismatch on hydration by definition.
// ---------------------------------------------------------------------------

const TICK_MS = 30_000;
const NEAR_MS = 24 * 60 * 60 * 1000;

let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
const clockListeners = new Set<() => void>();

function subscribeClock(onStoreChange: () => void) {
  clockListeners.add(onStoreChange);

  clockTimer ??= setInterval(() => {
    clockNow = Date.now();
    for (const listener of clockListeners) listener();
  }, TICK_MS);

  return () => {
    clockListeners.delete(onStoreChange);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

/** For banners with nothing to count down: subscribing costs nothing. */
function subscribeNever() {
  return () => {};
}

function getClock() {
  if (clockNow === 0) clockNow = Date.now();
  return clockNow;
}

function getServerClock() {
  return 0;
}

/**
 * "Ends in 2h 10m" while the finish line is close, an absolute timestamp when it
 * is not. A maintenance window is only actionable if you can see how long you
 * have left, and a date three weeks out tells you nothing.
 */
function useEndsInLabel(endsAt: string | null): string | null {
  const now = useSyncExternalStore(
    endsAt ? subscribeClock : subscribeNever,
    getClock,
    getServerClock,
  );

  if (!endsAt || now === 0) return null;

  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return null;

  const remaining = end - now;
  if (remaining <= 0) return "Ending now";
  if (remaining > NEAR_MS) return `Until ${formatDateTime(endsAt)}`;

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  if (hours > 0) return `Ends in ${hours}h ${minutes}m`;
  if (minutes > 0) return `Ends in ${minutes}m`;
  return "Ends in under a minute";
}

export function NoticeBanner({
  notice,
  onDismiss,
  extraCount = 0,
  extraExpanded = false,
  onToggleExtra,
  inert = false,
}: NoticeBannerProps) {
  const config = SEVERITY_CONFIG[notice.severity];
  const Icon = config.icon;
  const endsInLabel = useEndsInLabel(notice.endsAt);

  // An in-app path routes through the client router; anything else is external
  // and opens in a new tab so a tenant never loses their place in a booking.
  const isInternalLink = notice.linkHref?.startsWith("/") ?? false;

  const cta =
    notice.linkHref && notice.linkLabel ? (
      inert ? (
        <span className={cn("font-medium underline underline-offset-2", config.link)}>
          {notice.linkLabel}
        </span>
      ) : isInternalLink ? (
        <Link
          href={notice.linkHref}
          className={cn(
            "font-medium underline underline-offset-2 whitespace-nowrap",
            config.link,
          )}
        >
          {notice.linkLabel}
        </Link>
      ) : (
        <a
          href={notice.linkHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "font-medium underline underline-offset-2 whitespace-nowrap",
            config.link,
          )}
        >
          {notice.linkLabel}
        </a>
      )
    ) : null;

  return (
    <div
      role={notice.severity === "CRITICAL" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 border-b px-4 py-2 text-sm",
        config.banner,
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.iconClass)} />

      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
        {notice.title && <span className="font-semibold">{notice.title}</span>}
        <span className="min-w-0">{notice.message}</span>
        {cta}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {endsInLabel && (
          <span className="hidden text-xs opacity-70 sm:inline">
            {endsInLabel}
          </span>
        )}

        {extraCount > 0 && onToggleExtra && (
          <button
            type="button"
            onClick={onToggleExtra}
            aria-expanded={extraExpanded}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors",
              config.dismiss,
            )}
          >
            {extraExpanded
              ? "Show less"
              : `${extraCount} more ${extraCount === 1 ? "update" : "updates"}`}
            {extraExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notice"
            className={cn("rounded p-0.5 transition-colors", config.dismiss)}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
