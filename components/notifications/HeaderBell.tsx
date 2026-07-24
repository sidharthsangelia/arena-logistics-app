import { resolveInboxAudience } from "@/lib/notifications/audience";
import { getInboxSnapshot } from "@/lib/notifications/queries";
import { NotificationBell } from "./NotificationBell";

/**
 * Server half of the bell: resolves whose inbox this is and fetches the first
 * snapshot so the badge is correct on first paint rather than popping in after a
 * client fetch.
 *
 * The history link is derived from the scope rather than passed in, so neither
 * layout can wire the wrong one and send arena staff to a tenant route.
 *
 * Renders nothing when there is no inbox (signed out, mid-onboarding). An empty
 * bell in that state would be chrome that does nothing.
 */
export async function HeaderBell() {
  const audience = await resolveInboxAudience();
  if (!audience) return null;

  const snapshot = await getInboxSnapshot(audience);

  return (
    <NotificationBell
      initialSnapshot={snapshot}
      historyHref={
        audience.scope === "ARENA"
          ? "/arena-dashboard/notifications"
          : "/notifications"
      }
    />
  );
}
