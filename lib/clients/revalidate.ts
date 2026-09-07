import "server-only";

import { revalidatePath, updateTag } from "next/cache";

import { CLIENT_ORG_OPTIONS_TAG } from "@/queries/clients";

/**
 * Everything that has to be refreshed after a client is created, edited or
 * removed.
 *
 * ── WHY THIS IS SHARED RATHER THAN INLINE ───────────────────────────────────
 * The same client list renders at two routes — the tenant's own at /clients and
 * Arena's cross-org one at /arena-dashboard/clients — and there are two files
 * that write clients: the single-record actions and the CSV importer. Every one
 * of those combinations used to be maintained by hand, and two of them were
 * wrong: the importer and the single-record actions both refreshed /clients
 * only, so anything done from the Arena screen left the table showing the list
 * as it was before. That reads exactly like the save having failed.
 *
 * One function, called from every write path, so a third route or a fourth
 * writer cannot quietly go stale.
 *
 * ── SERVER ACTIONS ONLY ─────────────────────────────────────────────────────
 * updateTag may only be called from a Server Action; it throws anywhere else.
 * That is the right primitive here rather than revalidateTag, whose "max"
 * profile is stale-while-revalidate and would serve the old list once more — to
 * the very person who just changed it. If a route handler ever needs to
 * invalidate this, it wants revalidateTag(CLIENT_ORG_OPTIONS_TAG, "max"), the
 * way the Clerk organisation.updated webhook does.
 */
export function revalidateClientLists({
  membershipChanged = false,
}: {
  /**
   * True when a client was created or removed, as opposed to edited.
   *
   * The Business Associate filter lists organisations that have at least one
   * client, so an org's first client puts it on that list and its last one takes
   * it off. Editing a client cannot change the list, and expiring an hour-long
   * cache entry for nothing is worth avoiding.
   */
  membershipChanged?: boolean;
} = {}) {
  revalidatePath("/clients");
  revalidatePath("/arena-dashboard/clients");

  if (membershipChanged) {
    updateTag(CLIENT_ORG_OPTIONS_TAG);
  }
}
