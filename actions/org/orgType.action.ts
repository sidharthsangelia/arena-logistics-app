"use server";

// Client-callable wrapper around backfillActiveOrgTypeMetadata. The tenant
// sidebar invokes this once, only when it detects the active org has no
// classification in its public metadata yet (an org created before this
// feature). It is a no-op when metadata is already present, so it is cheap to
// call and safe to leave wired up permanently.

import { backfillActiveOrgTypeMetadata } from "@/lib/org-type.server";

export async function ensureOrgTypeMetadata(): Promise<void> {
  await backfillActiveOrgTypeMetadata();
}
