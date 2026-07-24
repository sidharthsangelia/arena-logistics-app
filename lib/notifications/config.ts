/**
 * NOTIFICATION INBOX: SHARED CONFIG AND WIRE TYPES
 * -----------------------------------------------------------------------------
 * Deliberately free of `server-only`, Prisma and React, because the queries, the
 * emitters, the bell and the history page all need these. The same mistake in the
 * wallets work cost a build and then a runtime error in the other direction, so
 * this module exists from the start rather than being extracted later.
 *
 * A note on what belongs here: labels, kind metadata and the polling cadence,
 * yes. Icons, no. Icons are React components and live with the components that
 * render them, matching how the sidebar nav config is arranged.
 */

import type { NoticeSeverity } from "@/generated/prisma";

export type NotificationScopeKey = "ARENA" | "ORG";

export const NOTIFICATION_KINDS = [
  "BOOKING_PLACED",
  "PAYMENT_FAILED",
  "COLLECTION_OVERDUE",
  "SHIPMENT_STUCK",
  "QUOTE_EXPIRING",
  "SHIPMENT_STATUS",
  "ARENA_MESSAGE",
] as const;

export type NotificationKindKey = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationKindMeta {
  /** Short noun phrase, used on filter chips and in the empty states. */
  label: string;
  /** Which inbox this kind is written to. */
  scope: NotificationScopeKey;
  /**
   * True when the notification names an amount. Money is hidden from non-admin
   * arena members everywhere else, so these are written with adminOnly set and
   * never appear in an ops member's bell. See utils/arena-auth.ts.
   */
  money: boolean;
}

export const NOTIFICATION_KIND_META: Record<
  NotificationKindKey,
  NotificationKindMeta
> = {
  BOOKING_PLACED: { label: "New bookings", scope: "ARENA", money: false },
  PAYMENT_FAILED: { label: "Payment failures", scope: "ARENA", money: true },
  COLLECTION_OVERDUE: { label: "Uncollected payments", scope: "ARENA", money: true },
  SHIPMENT_STUCK: { label: "Stuck shipments", scope: "ARENA", money: false },
  QUOTE_EXPIRING: { label: "Quotes about to lapse", scope: "ARENA", money: false },
  SHIPMENT_STATUS: { label: "Shipment updates", scope: "ORG", money: false },
  ARENA_MESSAGE: { label: "Messages from Arena", scope: "ORG", money: false },
};

// ---------------------------------------------------------------------------
// Filter tabs on the history page
//
// Grouped by what someone is actually looking for rather than one chip per kind.
// "Needs attention" is the group that matters: it is why anyone opens this screen
// on a busy morning, so it is one click rather than three separate filters.
// ---------------------------------------------------------------------------

export const ARENA_INBOX_FILTERS = {
  all: { label: "Everything", kinds: null },
  attention: {
    label: "Needs attention",
    kinds: [
      "PAYMENT_FAILED",
      "COLLECTION_OVERDUE",
      "SHIPMENT_STUCK",
      "QUOTE_EXPIRING",
    ],
  },
  bookings: { label: "New bookings", kinds: ["BOOKING_PLACED"] },
} as const;

export const TENANT_INBOX_FILTERS = {
  all: { label: "Everything", kinds: null },
  shipments: { label: "Shipment updates", kinds: ["SHIPMENT_STATUS"] },
  messages: { label: "From Arena", kinds: ["ARENA_MESSAGE"] },
} as const;

export type ArenaInboxFilter = keyof typeof ARENA_INBOX_FILTERS;
export type TenantInboxFilter = keyof typeof TENANT_INBOX_FILTERS;

export function coerceArenaFilter(value: unknown): ArenaInboxFilter {
  // Object.hasOwn rather than `in`: `in` also matches inherited keys, so
  // ?filter=toString would pass and then read `.kinds` off undefined.
  return typeof value === "string" && Object.hasOwn(ARENA_INBOX_FILTERS, value)
    ? (value as ArenaInboxFilter)
    : "all";
}

export function coerceTenantFilter(value: unknown): TenantInboxFilter {
  return typeof value === "string" && Object.hasOwn(TENANT_INBOX_FILTERS, value)
    ? (value as TenantInboxFilter)
    : "all";
}

// ---------------------------------------------------------------------------
// Polling
//
// No SSE and no websocket, on purpose. The volume here is a handful of events an
// hour, and a long-lived connection per open tab is real infrastructure to run
// for something a poll answers just as well.
//
// The cadence is 60s while the tab is visible and nothing while it is hidden. A
// background tab polling all afternoon is the actual cost of this approach, and
// skipping those requests is most of the saving. Focus returning triggers an
// immediate fetch, so coming back to the tab feels instant regardless of where
// the interval happened to be.
// ---------------------------------------------------------------------------

export const INBOX_POLL_MS = 60_000;

/** Rows in the bell popover. Enough to be useful, few enough to scan. */
export const INBOX_PREVIEW_LIMIT = 8;

/** Rows per page on the full history screen. */
export const INBOX_PAGE_SIZE = 25;

/**
 * The badge stops counting here and renders "50+". Past that the exact number
 * changes nothing about what anyone does next, and an unbounded count means an
 * unbounded COUNT query on every poll.
 */
export const UNREAD_BADGE_CAP = 50;

// ---------------------------------------------------------------------------
// Wire types
//
// Dates are ISO strings: these cross the server to client boundary, and a Date
// does not survive the trip.
// ---------------------------------------------------------------------------

export interface NotificationDTO {
  id: string;
  kind: NotificationKindKey;
  severity: NoticeSeverity;
  title: string;
  body: string | null;
  linkHref: string | null;
  createdAt: string;
  /** Null when this viewer has not read it. */
  readAt: string | null;
}

export interface InboxSnapshot {
  items: NotificationDTO[];
  /** Capped at UNREAD_BADGE_CAP. */
  unreadCount: number;
  /** True when unreadCount hit the cap, so the badge can render "50+". */
  unreadCapped: boolean;
}

export interface InboxPage {
  items: NotificationDTO[];
  totalRows: number;
  pageCount: number;
  unreadCount: number;
}

/** Relative time, in the plain phrasing the rest of the app uses. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;

  return new Date(then).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
