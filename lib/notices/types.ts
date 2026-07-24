// Shared shapes for the system notice banner. Kept in a plain module (not a
// "use server" file, which cannot export types) so both the tenant banner and
// the Arena admin screen import from one place.

import type {
  NoticeAudience,
  NoticeDisplayMode,
  NoticeSeverity,
} from "@/generated/prisma";

export type { NoticeAudience, NoticeDisplayMode, NoticeSeverity };

/**
 * A notice as it crosses the server → client boundary. Dates are ISO strings
 * because these rows travel through `unstable_cache` (which round-trips values
 * as JSON) and then into client components, and a `Date` survives neither hop
 * intact.
 */
export interface SystemNoticeDTO {
  id: string;
  title: string | null;
  message: string;
  severity: NoticeSeverity;
  audience: NoticeAudience;
  displayMode: NoticeDisplayMode;
  isActive: boolean;
  dismissible: boolean;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  linkLabel: string | null;
  linkHref: string | null;
  revision: number;
}

/** Admin table rows carry the audit fields the tenant banner has no use for. */
export interface AdminSystemNoticeDTO extends SystemNoticeDTO {
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lifecycle state derived from isActive + the schedule window. Never stored —
 * a notice with a past endsAt becomes EXPIRED on its own, with no cron job.
 */
export type NoticeStatus = "OFF" | "SCHEDULED" | "LIVE" | "EXPIRED";
