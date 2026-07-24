// Pure, time-aware notice selection. Deliberately free of Prisma, Next and
// React so it can run on the server (tenant layout), in the browser (admin live
// preview) and be reasoned about in isolation.

import { severityRank } from "./config";
import type { NoticeStatus, SystemNoticeDTO } from "./types";

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Is this notice inside its display window right now?
 *
 * ALWAYS notices ignore the window entirely, so a notice that once ran on a
 * schedule can be flipped to ALWAYS without clearing its old dates.
 */
export function isWithinWindow(
  notice: Pick<SystemNoticeDTO, "displayMode" | "startsAt" | "endsAt">,
  now: number,
): boolean {
  if (notice.displayMode !== "SCHEDULED") return true;

  const start = timestamp(notice.startsAt);
  const end = timestamp(notice.endsAt);

  if (start !== null && now < start) return false;
  if (end !== null && now > end) return false;
  return true;
}

/**
 * Lifecycle state for the admin table. Answers "what is a tenant seeing right
 * now?" without the admin having to compare dates by eye.
 */
export function noticeStatus(
  notice: Pick<
    SystemNoticeDTO,
    "isActive" | "displayMode" | "startsAt" | "endsAt"
  >,
  now: number = Date.now(),
): NoticeStatus {
  if (!notice.isActive) return "OFF";
  if (notice.displayMode !== "SCHEDULED") return "LIVE";

  const start = timestamp(notice.startsAt);
  const end = timestamp(notice.endsAt);

  if (end !== null && now > end) return "EXPIRED";
  if (start !== null && now < start) return "SCHEDULED";
  return "LIVE";
}

export interface NoticeViewerContext {
  isBusinessAssociate: boolean;
  /** Injectable for tests and for the admin preview. */
  now?: number;
}

function matchesAudience(
  notice: SystemNoticeDTO,
  isBusinessAssociate: boolean,
): boolean {
  switch (notice.audience) {
    case "ALL":
      return true;
    case "BUSINESS_ASSOCIATES":
      return isBusinessAssociate;
    case "STANDARD":
      return !isBusinessAssociate;
    default:
      return false;
  }
}

/**
 * Everything this viewer should see, most important first.
 *
 * Order is severity, then priority, then newest — so a CRITICAL notice always
 * takes the top slot no matter what priority someone typed, and priority only
 * decides between notices of equal severity.
 */
export function selectVisibleNotices(
  notices: SystemNoticeDTO[],
  { isBusinessAssociate, now = Date.now() }: NoticeViewerContext,
): SystemNoticeDTO[] {
  return notices
    .filter(
      (notice) =>
        notice.isActive &&
        isWithinWindow(notice, now) &&
        matchesAudience(notice, isBusinessAssociate),
    )
    .sort((a, b) => {
      const bySeverity = severityRank(a.severity) - severityRank(b.severity);
      if (bySeverity !== 0) return bySeverity;

      const byPriority = b.priority - a.priority;
      if (byPriority !== 0) return byPriority;

      return (timestamp(b.startsAt) ?? 0) - (timestamp(a.startsAt) ?? 0);
    });
}

/**
 * The localStorage key for a dismissal. Includes `revision` so editing a live
 * notice re-surfaces it to people who dismissed the previous wording.
 */
export function dismissalKey(
  notice: Pick<SystemNoticeDTO, "id" | "revision">,
): string {
  return `${notice.id}:${notice.revision}`;
}
