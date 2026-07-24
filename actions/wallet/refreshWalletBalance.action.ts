"use server";

import * as Sentry from "@sentry/nextjs";

import { requireOrg } from "@/utils/auth-helper";
import {
  invalidateWalletBalance,
  readWalletBalance,
} from "@/lib/wallet/queries";

/**
 * What the header chip's refresh button calls.
 *
 * Reads the DB directly rather than going through getCachedWalletBalance, then
 * invalidates the tag. Two reasons for that order:
 *
 *   - Reading directly is what makes the button honest. Going through the cache
 *     and relying on the invalidation to land first would hand back a
 *     stale-while-revalidate value, so the first press would appear to do
 *     nothing.
 *   - Invalidating afterwards means the fresh number is also what the next page
 *     render sees, instead of this one tenant getting a private answer.
 */
export async function refreshWalletBalanceAction() {
  try {
    const org = await requireOrg();
    const wallet = await readWalletBalance(org.id);

    invalidateWalletBalance(org.id);

    return { ok: true as const, ...wallet };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "refreshWalletBalanceAction" },
    });
    return { ok: false as const, error: "Could not refresh your balance." };
  }
}
