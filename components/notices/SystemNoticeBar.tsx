// Server half of the tenant info banner: reads the cached notice set, narrows
// it to this viewer, and hands the result to the client stack. Renders nothing
// at all when there is nothing to say, so the layout is unchanged on a quiet day.

import { getActiveSystemNotices } from "@/lib/notices/queries";
import { selectVisibleNotices } from "@/lib/notices/visibility";
import { SystemNoticeStack } from "@/components/notices/SystemNoticeStack";

export async function SystemNoticeBar({
  isBusinessAssociate,
}: {
  isBusinessAssociate: boolean;
}) {
  // Audience and schedule are resolved here, outside the cache boundary, so one
  // cached row set serves every org and "now" is always the real current time.
  const notices = selectVisibleNotices(await getActiveSystemNotices(), {
    isBusinessAssociate,
  });

  if (notices.length === 0) return null;

  return <SystemNoticeStack notices={notices} />;
}
